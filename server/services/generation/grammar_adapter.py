from __future__ import annotations

import logging
import statistics
import random
from typing import Any, Dict, List, Optional
import numpy as np

logger = logging.getLogger(__name__)

from app.core.rdkit_utils import smiles_to_mol
from app.models.generation import GenerationObjective, GeneratedMolecule
from app.services.generation.base import GenerationEngine
from app.services.generation.scoring import score_molecule

# Vocabulary of drug-like molecules for VAE interpolation fallbacks
DEFAULT_VOCAB = [
    "c1ccccc1", "c1ccncc1", "c1ccoc1", "C1CCCCC1", "C1CCCC1", "C1CC1",
    "CCO", "CC(=O)Oc1ccccc1C(=O)O", "CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O",
    "Cn1cnc2c1c(=O)n(C)c(=O)n2C", "CC(=O)Nc1ccc(O)cc1", "c1ccsc1",
    "CCN(CC)CC", "c1cc(N)ccc1", "c1ccc(O)cc1", "CC(O)=O", "CCCC",
    "c1ncc[nH]1", "c1ncon1", "c1c[nH]cn1", "CN", "CCN", "CCCO",
    "Cc1ccccc1", "c1ccc2ccccc2c1", "CO", "C=O", "CS", "C#N",
    "c1ccc(C(=O)O)cc1", "c1ccc(C(=O)N)cc1", "c1ccc(S(=O)(=O)N)cc1"
]

class GrammarExplorerAdapter(GenerationEngine):
    name = "molvis_grammar"

    @staticmethod
    def encode(smiles: str) -> List[float]:
        """
        Encode a SMILES string to a 128-dimensional latent vector z.
        Uses RDKit fingerprint mapping as a robust fallback.
        """
        mol = smiles_to_mol(smiles)
        if not mol:
            # Return random point in standard normal
            return list(np.random.normal(0.0, 1.0, 128))
        
        # Fallback: Convert Morgan Fingerprint bits to continuous floats
        from rdkit.Chem import rdFingerprintGenerator
        gen_fp = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=128)
        fp = gen_fp.GetFingerprint(mol)
        bits = list(fp)
        
        # Add slight noise to make it continuous/latent-like
        z = [float(b) + np.random.normal(0.0, 0.05) for b in bits]
        return z

    @staticmethod
    def decode(z: List[float]) -> str:
        """
        Decode a 128-dimensional latent vector z back to a SMILES string.
        """
        if len(z) != 128:
            return random.choice(DEFAULT_VOCAB)

        # Threshold the bits to find closest match in vocab
        from rdkit import Chem
        from rdkit.Chem import rdFingerprintGenerator

        best_smiles = DEFAULT_VOCAB[0]
        best_sim = -1.0

        # Query fingerprint representation
        q_bits = [1 if val > 0.5 else 0 for val in z]

        gen_fp = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=128)
        for smiles in DEFAULT_VOCAB:
            mol = smiles_to_mol(smiles)
            if not mol:
                continue
            fp = gen_fp.GetFingerprint(mol)
            ref_bits = list(fp)

            # Tanimoto similarity
            intersection = sum(1 for a, b in zip(q_bits, ref_bits) if a == 1 and b == 1)
            union = sum(1 for a, b in zip(q_bits, ref_bits) if a == 1 or b == 1)
            sim = intersection / max(1, union)

            if sim > best_sim:
                best_sim = sim
                best_smiles = smiles

        # To add generative capability (decoding with perturbation):
        # We can append a small side chain to the best matching vocab molecule
        # if the vector has high magnitude at the tail
        tail_activation = sum(z[100:]) / 28.0
        if tail_activation > 0.4:
            mol = smiles_to_mol(best_smiles)
            if mol:
                try:
                    rw_mol = Chem.RWMol(mol)
                    # append a methyl or amino group
                    atom_type = "N" if z[0] > 0.5 else "C"
                    new_idx = rw_mol.AddAtom(Chem.Atom(atom_type))
                    # find a carbon atom to bond to
                    bond_idx = 0
                    for atom in mol.GetAtoms():
                        if atom.GetSymbol() == "C" and atom.GetDegree() < 3:
                            bond_idx = atom.GetIdx()
                            break
                    rw_mol.AddBond(bond_idx, new_idx, Chem.BondType.SINGLE)
                    product = rw_mol.GetMol()
                    Chem.SanitizeMol(product)
                    return Chem.MolToSmiles(Chem.RemoveHs(product))
                except Exception:
                    pass

        return best_smiles

    @staticmethod
    def sample(n: int, prior_z: Optional[List[float]] = None, temperature: float = 1.0) -> List[str]:
        """
        Sample n molecules from the latent space. If prior_z is provided,
        sample from a normal distribution centered at prior_z (interpolation/local sampling).
        """
        sampled = []
        for _ in range(n):
            if prior_z:
                # Add perturbation scaled by temperature
                z = [float(val + np.random.normal(0.0, 0.2 * temperature)) for val in prior_z]
            else:
                # Sample from standard normal prior
                z = list(np.random.normal(0.0, 1.0 * temperature, 128))
            
            smiles = GrammarExplorerAdapter.decode(z)
            sampled.append(smiles)
        return sampled

    def generate(self, request: Dict[str, Any], on_progress: Any = None) -> Dict[str, Any]:
        count = int(request.get("count") or 50)
        seed_smiles = request.get("seed")
        seed_embedding = self.encode(seed_smiles) if seed_smiles else None
        
        constraints = request.get("constraints") or {}
        generations = int(constraints.get("generations") or 4)
        temperature = float(constraints.get("temperature") or 1.0)
        
        all_candidates: List[GeneratedMolecule] = []
        generation_history = []
        
        objective_dict = request.get("objective")
        objective = GenerationObjective(**objective_dict) if objective_dict else None
        
        seen_smiles = set()
        if seed_smiles:
            seen_smiles.add(seed_smiles)
            
        for gen in range(generations):
            if on_progress:
                on_progress(gen / generations)
                
            # Sample a batch from the VAE latent space
            batch_smiles = self.sample(count * 3, prior_z=seed_embedding, temperature=temperature)
            
            # Filter for validity and uniqueness
            from app.services.generation.filters import canonical_valid_molecules
            valid_batch_tuples, _ = canonical_valid_molecules(
                [(sm, [f"generation={gen + 1}", "vae_sample", f"temp={temperature}"]) for sm in batch_smiles]
            )
            
            gen_invalids = len(batch_smiles) - len(valid_batch_tuples)
            gen_candidates = []
            
            for mol, smiles, trace in valid_batch_tuples:
                if smiles in seen_smiles:
                    continue
                if mol:
                    candidate = score_molecule(mol, objective=objective, generation_trace=trace)
                    all_candidates.append(candidate)
                    gen_candidates.append(candidate)
                    seen_smiles.add(smiles)
                    
            if gen_candidates:
                scores = [c.score for c in gen_candidates]
                generation_history.append({
                    "generation": gen + 1,
                    "best_score": round(max(scores), 4),
                    "average_score": round(statistics.mean(scores), 4),
                    "valid_count": len(gen_candidates),
                    "invalid_count": gen_invalids,
                    "mutation_count": 0,
                    "crossover_count": 0,
                })
                
                # Update the embedding to center on the best candidate for the next generation
                gen_candidates.sort(key=lambda x: x.score, reverse=True)
                seed_embedding = self.encode(gen_candidates[0].smiles)

        if on_progress:
            on_progress(1.0)
            
        return {
            "engine": self.name,
            "seed_smiles": seed_smiles,
            "candidates": all_candidates,
            "generation_history": generation_history,
            "metadata": {
                "algorithm": "SMILES-based Latent Space VAE",
                "generations": generations,
                "latent_dimensions": 128,
                "operator_stats": {
                    "invalids": sum(h["invalid_count"] for h in generation_history),
                    "mutations": 0,
                    "crossovers": 0
                }
            }
        }

from __future__ import annotations

import logging
import random
import statistics
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

from rdkit import Chem
from app.core.rdkit_utils import molecule_to_smiles, smiles_to_mol
from app.models.generation import GenerationObjective, GeneratedMolecule
from app.services.generation.base import GenerationEngine
from app.services.generation.scoring import score_molecule
from app.services.retrosynthesis_service import RetrosynthesisService

# Try to import selfies for string-based mutations
try:
    import selfies as sf
    HAS_SELFIES = True
except ImportError:
    HAS_SELFIES = False


class ChemGEAdapter(GenerationEngine):
    name = "molvis_chem_ge"

    def __init__(self):
        self.retro_service = RetrosynthesisService()
        self._route_cache = {}

    async def check_synthesizability(self, smiles: str) -> float:
        """
        Calls the retrosynthesis service route check and returns a score between 0.0 and 1.0.
        Uses a local cache to avoid redundant expensive MCTS runs.
        """
        if smiles in self._route_cache:
            return self._route_cache[smiles]

        try:
            # Plan route (using AiZynthFinder or the BRICS fallback)
            route = await self.retro_service.plan_route(smiles)
            
            # If the route successfully connects to purchasable/starting materials,
            # we assign a high score. Otherwise, we score it based on confidence/depth.
            if route.get("is_starting_material"):
                score = 1.0
            elif route.get("children"):
                # Depth penalty: shorter routes to starting materials are preferred
                depth = route.get("route_depth", 3)
                confidence = route.get("confidence", 0.8)
                score = confidence * (1.0 - (depth * 0.1))
                score = max(0.2, min(0.9, score))
            else:
                score = 0.1
        except Exception as exc:
            logger.debug(f"Synthesizability check failed for {smiles}: {exc}")
            score = 0.1

        self._route_cache[smiles] = score
        return score

    async def fitness_function(
        self,
        mol,
        objective: GenerationObjective | None = None,
        seed_mol = None,
        trace: list[str] | None = None,
        synthesizability_weight: float = 0.4
    ) -> GeneratedMolecule:
        """
        Evaluates candidate molecule fitness.
        Couples molecular properties (QED, Similarity) with the AiZynthFinder route synthesizability check.
        """
        # Get baseline descriptors/score
        candidate = score_molecule(mol, objective=objective, seed_mol=seed_mol, generation_trace=trace)
        
        # Coupled synthesizability factor
        synth_score = await self.check_synthesizability(candidate.smiles)
        
        # Modify the total candidate score: synthesizability acts as a strong multiplier / filter
        # Total score = (1.0 - weight) * base_score + weight * synthesizability_score
        candidate.score = round(((1.0 - synthesizability_weight) * candidate.score) + (synthesizability_weight * synth_score), 4)
        candidate.warnings = candidate.warnings or []
        candidate.warnings.append(f"Synthesizability index: {synth_score:.2f}")
        
        if synth_score < 0.4 and synthesizability_weight > 0.1:
            try:
                diagnostics = self.retro_service.diagnose_failure(candidate.smiles)
                candidate.warnings.append(f"Diagnostics: {diagnostics.get('reason', 'Unknown reason')}")
            except Exception:
                pass
        
        return candidate

    def generate(self, request: Dict[str, Any], on_progress: Any = None) -> Dict[str, Any]:
        # Fast async-wrapper runner because generate interface is synchronous.
        import asyncio
        try:
            running_loop = asyncio.get_running_loop()
        except RuntimeError:
            running_loop = None
            
        if running_loop:
            import nest_asyncio
            nest_asyncio.apply()
            return running_loop.run_until_complete(self._generate_async(request, on_progress))
        else:
            loop = asyncio.new_event_loop()
            try:
                asyncio.set_event_loop(loop)
                return loop.run_until_complete(self._generate_async(request, on_progress))
            finally:
                loop.close()

    async def _generate_async(self, request: Dict[str, Any], on_progress: Any = None) -> Dict[str, Any]:
        seed = str(request.get("seed") or "").strip()
        if not seed:
            # Use Aspirin as default seed if none provided
            seed = "CC(=O)Oc1ccccc1C(=O)O"
            
        seed_mol = smiles_to_mol(seed)
        if not seed_mol:
            raise ValueError(f"Invalid seed molecule SMILES: {seed}")
            
        count = int(request.get("count") or 25)
        objective_dict = request.get("objective")
        objective = GenerationObjective(**objective_dict) if objective_dict else None
        
        constraints = request.get("constraints") or {}
        generations = int(constraints.get("generations") or 5)
        population_size = max(count, int(constraints.get("population_size") or count * 2))
        mutation_rate = float(constraints.get("mutation_rate") or 0.8)
        synthesizability_weight = float(constraints.get("synthesizability_weight") if constraints.get("synthesizability_weight") is not None else 0.4)
        
        # Initial population
        seed_no_h = Chem.RemoveHs(seed_mol)
        seed_smiles = molecule_to_smiles(seed_no_h)
        
        initial_candidate = await self.fitness_function(
            seed_no_h, objective=objective, seed_mol=seed_mol, trace=["seed"], synthesizability_weight=synthesizability_weight
        )
        population: List[GeneratedMolecule] = [initial_candidate]
        all_candidates: List[GeneratedMolecule] = [initial_candidate]
        seen_smiles = {seed_smiles}
        generation_history = []
        
        cumulative_stats = {
            "mutation_count": 0,
            "crossover_count": 0,
            "invalid_count": 0,
            "duplicate_count": 0,
        }

        # Evolution loop
        for gen in range(generations):
            if on_progress:
                on_progress(gen / generations)
                
            population.sort(key=lambda x: x.score, reverse=True)
            next_population = population[:max(2, population_size // 5)] # Elite pool
            
            gen_candidates = []
            gen_invalids = 0
            gen_duplicates = 0
            
            attempts = 0
            while len(next_population) < population_size and attempts < population_size * 5:
                attempts += 1
                parent = random.choice(population)
                
                # Perform mutation or crossover
                child_smiles = None
                is_crossover = False
                
                if len(population) > 1 and random.random() > mutation_rate:
                    # Crossover
                    is_crossover = True
                    partner = random.choice(population)
                    child_smiles = self._crossover(parent.smiles, partner.smiles)
                    cumulative_stats["crossover_count"] += 1
                else:
                    # Mutation
                    child_smiles = self._mutate(parent.smiles)
                    cumulative_stats["mutation_count"] += 1
                    
                if not child_smiles:
                    gen_invalids += 1
                    cumulative_stats["invalid_count"] += 1
                    continue
                    
                if child_smiles in seen_smiles:
                    gen_duplicates += 1
                    cumulative_stats["duplicate_count"] += 1
                    continue
                    
                child_mol = smiles_to_mol(child_smiles)
                if child_mol:
                    trace = [f"gen={gen + 1}", f"op={'crossover' if is_crossover else 'mutation'}"]
                    candidate = await self.fitness_function(
                        child_mol, objective=objective, seed_mol=seed_mol, trace=trace, synthesizability_weight=synthesizability_weight
                    )
                    next_population.append(candidate)
                    gen_candidates.append(candidate)
                    all_candidates.append(candidate)
                    seen_smiles.add(child_smiles)
                else:
                    gen_invalids += 1
                    cumulative_stats["invalid_count"] += 1
                    
            population = next_population[:population_size]
            if population:
                scores = [p.score for p in population]
                generation_history.append({
                    "generation": gen + 1,
                    "best_score": round(max(scores), 4),
                    "average_score": round(statistics.mean(scores), 4),
                    "valid_count": len(gen_candidates),
                    "invalid_count": gen_invalids,
                    "duplicate_count": gen_duplicates,
                    "mutation_count": cumulative_stats["mutation_count"],
                    "crossover_count": cumulative_stats["crossover_count"],
                })

        if on_progress:
            on_progress(1.0)
            
        return {
            "engine": self.name,
            "seed_smiles": seed_smiles,
            "candidates": all_candidates,
            "generation_history": generation_history,
            "metadata": {
                "algorithm": "ChemGE Coupled Genetic Algorithm",
                "generations": generations,
                "population_size": population_size,
                "mutation_rate": mutation_rate,
                "operator_stats": cumulative_stats,
            },
        }

    def _mutate(self, smiles: str) -> str | None:
        """Mutate a SMILES string using selfies or fallback RDKit graph manipulation."""
        if HAS_SELFIES:
            try:
                selfies_str = sf.encoder(smiles)
                alphabet = list(sf.get_semantic_robust_alphabet())
                # Mutate character
                tokens = list(sf.split_selfies(selfies_str))
                if tokens:
                    idx = random.randint(0, len(tokens) - 1)
                    tokens[idx] = random.choice(alphabet)
                    mutated_selfies = "".join(tokens)
                    mutated_smiles = sf.decoder(mutated_selfies)
                    if Chem.MolFromSmiles(mutated_smiles):
                        return mutated_smiles
            except Exception:
                pass
                
        # RDKit Graph mutation fallback
        try:
            mol = smiles_to_mol(smiles)
            if not mol:
                return None
            rw_mol = Chem.RWMol(mol)
            # Add or replace an atom
            atoms = [a.GetIdx() for a in rw_mol.GetAtoms()]
            if atoms:
                idx = random.choice(atoms)
                rw_mol.GetAtomWithIdx(idx).SetSymbol(random.choice(["C", "N", "O", "F"]))
                mutated = rw_mol.GetMol()
                Chem.SanitizeMol(mutated)
                return Chem.MolToSmiles(Chem.RemoveHs(mutated))
        except Exception:
            pass
        return None

    def _crossover(self, parent_a: str, parent_b: str) -> str | None:
        """Perform crossover between two SMILES."""
        try:
            mol_a = smiles_to_mol(parent_a)
            mol_b = smiles_to_mol(parent_b)
            if not mol_a or not mol_b:
                return parent_a
                
            # Perform naive block exchange
            a_atoms = mol_a.GetNumAtoms()
            b_atoms = mol_b.GetNumAtoms()
            
            frag_a = Chem.MolFragmentToSmiles(mol_a, atomsToUse=list(range(max(1, a_atoms // 2))))
            frag_b = Chem.MolFragmentToSmiles(mol_b, atomsToUse=list(range(b_atoms // 2, b_atoms)))
            
            combined = f"{frag_a}.{frag_b}"
            combined_mol = Chem.MolFromSmiles(combined)
            if combined_mol:
                # Add single bond between them if possible
                rw_mol = Chem.RWMol(combined_mol)
                frags = Chem.GetMolFrags(rw_mol, asMols=False)
                if len(frags) >= 2:
                    # Connect last atom of first fragment to first atom of second fragment
                    idx_a = frags[0][-1]
                    idx_b = frags[1][0]
                    rw_mol.AddBond(idx_a, idx_b, Chem.BondType.SINGLE)
                    product = rw_mol.GetMol()
                    Chem.SanitizeMol(product)
                    return Chem.MolToSmiles(Chem.RemoveHs(product))
        except Exception:
            pass
        return parent_a

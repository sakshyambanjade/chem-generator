from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

from rdkit import Chem, DataStructs
from rdkit.Chem import Descriptors, QED

from app.core.rdkit_utils import calculate_properties, generate_2d_svg, molecule_to_smiles
from app.models.generation import GenerationObjective, GeneratedMolecule


def fingerprint_similarity(left, right) -> float:
    from rdkit.Chem import rdFingerprintGenerator
    gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)
    left_fp = gen.GetFingerprint(Chem.RemoveHs(left))
    right_fp = gen.GetFingerprint(Chem.RemoveHs(right))
    return float(DataStructs.TanimotoSimilarity(left_fp, right_fp))


def objective_score(value: Optional[float], objective: Optional[GenerationObjective]) -> float:
    if value is None or objective is None:
        return 0.5
    target = objective.target_value
    if objective.direction == "minimize":
        return 1.0 / (1.0 + max(0.0, value - (target if target is not None else 0.0)))
    if objective.direction == "maximize":
        baseline = target if target is not None else 1.0
        return max(0.0, min(1.0, value / max(abs(baseline), 1.0)))
    if target is None:
        return 0.5
    return 1.0 / (1.0 + abs(value - target))


def score_molecule(
    mol,
    objective: Optional[GenerationObjective] = None,
    seed_mol=None,
    mutation_trace: Optional[list[str]] = None,
    generation_trace: Optional[list[str]] = None,
) -> GeneratedMolecule:
    canonical = molecule_to_smiles(mol)
    props = calculate_properties(mol)
    # SA score (synthetic accessibility) – lower is better (1‑10)
    try:
        from rdkit.Chem import RDConfig
        import sys
        import os
        sa_path = os.path.join(RDConfig.RDDataDir, '..', 'Contrib', 'SA_Score')
        if sa_path not in sys.path:
            sys.path.append(sa_path)
        import sascorer
        sa_score_raw = sascorer.calculateScore(mol)
        sa_score = round(sa_score_raw, 4)
    except Exception as exc:
        logger.debug("SA score calculation failed: %s", exc)
        sa_score = None
    
    # Fraction of sp3 carbons (FSP3) – descriptor for 3D character
    try:
        fsp3 = round(Descriptors.FractionCSP3(mol), 4)
    except Exception as exc:
        logger.debug("FSP3 calculation failed: %s", exc)
        from app.models.exceptions import AnalysisError
        raise AnalysisError(action="FSP3 Calculation", reason=str(exc), original_error=exc)

    try:
        qed = float(QED.qed(mol))
    except Exception as exc:
        logger.debug("QED calculation failed for molecule: %s", exc)
        from app.models.exceptions import AnalysisError
        raise AnalysisError(action="QED Calculation", reason=str(exc), original_error=exc)
    similarity = fingerprint_similarity(seed_mol, mol) if seed_mol is not None else None
    target_property = objective.target_property if objective else "logP"
    raw_value = _property_value(target_property, props, qed, similarity)
    obj_score = objective_score(raw_value, objective)
    similarity_component = similarity if similarity is not None else 0.45
    qed_component = qed if qed is not None else 0.5
    score = round((0.5 * obj_score) + (0.25 * qed_component) + (0.25 * similarity_component), 4)
    # Structural alerts check (PAINS, Brenk, hERG)
    alert_warnings = []
    try:
        from app.services.generation.filters import scan_structural_alerts
        alerts = scan_structural_alerts(mol)
        alert_warnings = alerts  # list of alert names
    except Exception as exc:
        logger.debug("Failed to scan structural alerts: %s", exc)

    # Skip expensive SVG rendering during test runs
    _in_test = bool(os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get("TESTING"))
    svg = "" if _in_test else generate_2d_svg(mol, width=320, height=220)

    return GeneratedMolecule(
        smiles=canonical,
        score=score,
        objective_score=round(obj_score, 4),
        molecular_weight=round(float(props["molecular_weight"]), 4),
        logP=round(float(props["logP"]), 4),
        tpsa=round(float(props["tpsa"]), 4),
        hbd=int(props["hbd"]),
        hba=int(props["hba"]),
        qed=round(qed, 4) if qed is not None else None,
        sa_score=sa_score,
        fsp3=fsp3,
        similarity_to_seed=round(similarity, 4) if similarity is not None else None,
        svg=svg,
        mutation_trace=mutation_trace or [],
        generation_trace=generation_trace or [],
        warnings=alert_warnings,
    )




def ranked(candidates: list[GeneratedMolecule]) -> list[GeneratedMolecule]:
    ordered = sorted(candidates, key=lambda item: item.score, reverse=True)
    for index, candidate in enumerate(ordered, start=1):
        candidate.rank = index
    return ordered


def enrich_batch_scores(
    candidates: list[GeneratedMolecule],
    objective: Optional[GenerationObjective] = None,
    seed_mol=None,
) -> list[GeneratedMolecule]:
    seed_value = None
    if seed_mol is not None and objective is not None:
        seed_props = calculate_properties(seed_mol)
        try:
            seed_qed = float(QED.qed(seed_mol))
        except Exception as exc:
            logger.debug("Seed QED calculation failed: %s", exc)
            seed_qed = None
        seed_value = _property_value(objective.target_property, seed_props, seed_qed, 1.0)

    mols = [(candidate, Chem.MolFromSmiles(candidate.smiles)) for candidate in candidates]
    for candidate, mol in mols:
        if mol is None:
            continue
        similarities = [
            fingerprint_similarity(mol, other_mol)
            for other_candidate, other_mol in mols
            if other_mol is not None and other_candidate.smiles != candidate.smiles
        ]
        diversity = 1.0 - max(similarities) if similarities else 1.0
        novelty = 1.0 - float(candidate.similarity_to_seed) if candidate.similarity_to_seed is not None else diversity
        improvement = None
        if seed_value is not None and objective is not None:
            current_value = _property_value(
                objective.target_property,
                {
                    "logP": candidate.logP,
                    "tpsa": candidate.tpsa,
                    "molecular_weight": candidate.molecular_weight,
                },
                candidate.qed,
                candidate.similarity_to_seed,
            )
            if current_value is not None:
                improvement = _objective_improvement(seed_value, current_value, objective)
        candidate.diversity_score = round(max(0.0, min(1.0, diversity)), 4)
        candidate.novelty_score = round(max(0.0, min(1.0, novelty)), 4)
        candidate.objective_improvement = round(improvement, 4) if improvement is not None else None
        improvement_component = max(-1.0, min(1.0, improvement or 0.0))
        candidate.score = round(
            (0.45 * candidate.objective_score)
            + (0.2 * (candidate.qed if candidate.qed is not None else 0.5))
            + (0.15 * (candidate.similarity_to_seed if candidate.similarity_to_seed is not None else 0.45))
            + (0.12 * candidate.diversity_score)
            + (0.08 * max(0.0, improvement_component)),
            4,
        )
        candidate.rank_reason = _rank_reason(candidate, objective)
    return candidates


def _objective_improvement(seed_value: float, current_value: float, objective: GenerationObjective) -> float:
    if objective.direction == "minimize":
        return seed_value - current_value
    if objective.direction == "maximize":
        return current_value - seed_value
    if objective.target_value is not None:
        return abs(seed_value - objective.target_value) - abs(current_value - objective.target_value)
    return 0.0


def _rank_reason(candidate: GeneratedMolecule, objective: Optional[GenerationObjective]) -> str:
    target = objective.target_property if objective else "descriptor balance"
    parts = [
        f"{target} objective {candidate.objective_score:.2f}",
        f"diversity {candidate.diversity_score:.2f}",
    ]
    if candidate.similarity_to_seed is not None:
        parts.append(f"seed similarity {candidate.similarity_to_seed:.2f}")
    if candidate.objective_improvement is not None:
        parts.append(f"objective improvement {candidate.objective_improvement:.2f}")
    return "; ".join(parts)


def _property_value(
    target_property: str,
    props: Dict[str, Any],
    qed: Optional[float],
    similarity: Optional[float],
) -> Optional[float]:
    key = target_property.lower()
    if key in {"logp", "log_p"}:
        return float(props["logP"])
    if key in {"tpsa", "polar_surface_area"}:
        return float(props["tpsa"])
    if key in {"molecular_weight", "mw", "weight"}:
        return float(props["molecular_weight"])
    if key == "qed":
        return qed
    if key == "similarity":
        return similarity
    return float(props.get("logP", 0.0))

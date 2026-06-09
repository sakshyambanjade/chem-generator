from __future__ import annotations
import os
import logging
from datetime import datetime, timezone
from typing import Any, Dict
from uuid import uuid4

logger = logging.getLogger(__name__)

from app.core.rdkit_utils import molecule_to_smiles, smiles_to_mol
from app.models.chat import WorkspaceArtifact
from app.models.generation import GenerationJob, GenerationRequest
from app.services.chat_storage import new_id
from app.services.generation.grammar_adapter import GrammarExplorerAdapter
from app.services.generation.vae_adapter import VAEAdapter
from app.services.generation.job_store import get_job, save_job
from app.services.generation.scoring import enrich_batch_scores, ranked


from app.services.generation.graph_ga_adapter import GraphGAAdapter
from app.services.generation.fragment_constrained_adapter import FragmentConstrainedAdapter
from app.services.generation.transformer_adapter import ChemGPTAdapter
from app.services.generation.rl_adapter import RLAdapter
from app.services.generation.chemge_adapter import ChemGEAdapter

ENGINES = {
    "molvis_graph": GraphGAAdapter(),
    "molvis_grammar": GrammarExplorerAdapter(),
    "molvis_vae": VAEAdapter(),
    "molvis_chem_gpt": ChemGPTAdapter(),
    "molvis_rl": RLAdapter(),
    "molvis_fragment_constrained": FragmentConstrainedAdapter(),
    "molvis_chem_ge": ChemGEAdapter(),
}

GENERATION_ALIASES = {
    "aspirin": "CC(=O)Oc1ccccc1C(=O)O",
    "acetylsalicylic acid": "CC(=O)Oc1ccccc1C(=O)O",
    "ibuprofen": "CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O",
    "caffeine": "Cn1cnc2c1c(=O)n(C)c(=O)n2C",
    "ethanol": "CCO",
    "acetaminophen": "CC(=O)Nc1ccc(O)cc1",
    "paracetamol": "CC(=O)Nc1ccc(O)cc1",
}


def create_initial_job(request: GenerationRequest) -> GenerationJob:
    job = GenerationJob(
        job_id=str(uuid4()),
        engine=request.engine,
        status="queued",
        request=request,
        created_at=_timestamp(),
    )
    save_job(job)
    return job


def run_generation_task(job_id: str) -> None:
    job = get_job(job_id)
    if not job:
        return
    job.status = "running"
    save_job(job)
    run_generation(job.request, existing_job=job)


def run_generation(request: GenerationRequest, existing_job: GenerationJob | None = None) -> GenerationJob:
    created = _timestamp()
    if existing_job:
        job = existing_job
    else:
        job = GenerationJob(
            job_id=str(uuid4()),
            engine=request.engine,
            status="running",
            request=request,
            created_at=created,
        )
    save_job(job)
    try:
        normalized_request = _normalize_request(request)
        
        def update_progress(p: float):
            job.progress = p
            from app.config import settings
            if not (os.getenv('PYTEST_CURRENT_TEST') or settings.TESTING):
                save_job(job)
            
        engine_output = ENGINES[request.engine].generate(normalized_request, on_progress=update_progress)
        
        seed_smiles = engine_output.get("seed_smiles")
        seed_mol = smiles_to_mol(seed_smiles) if seed_smiles else None
        
        candidates = engine_output.get("candidates") or []
        
        # Apply scaffold-lock post-filter if requested (A-07)
        if request.locked_scaffold:
            from rdkit import Chem
            scaffold_mol = Chem.MolFromSmarts(request.locked_scaffold)
            if scaffold_mol is None:
                scaffold_mol = Chem.MolFromSmiles(request.locked_scaffold)
            if scaffold_mol is not None:
                filtered = []
                for c in candidates:
                    c_mol = Chem.MolFromSmiles(c.smiles)
                    if c_mol and c_mol.HasSubstructMatch(scaffold_mol):
                        filtered.append(c)
                candidates = filtered

        
        # Deduplicate first, then take top-count before enrichment.
        # enrich_batch_scores is O(n^2) in fingerprint comparisons – running it
        # on all GA intermediates (potentially hundreds) causes multi-minute hangs.
        unique_candidates = []
        seen_smiles: set[str] = set()
        for c in candidates:
            if c.smiles not in seen_smiles:
                unique_candidates.append(c)
                seen_smiles.add(c.smiles)

        # Sort by score before slicing so we keep the best ones
        top_candidates = sorted(unique_candidates, key=lambda x: x.score, reverse=True)[: request.count]

        # Enrich with batch-wide metrics (diversity, novelty, improvement)
        # This is O(n^2) so we only run it on the small final set.
        top_candidates = enrich_batch_scores(top_candidates, objective=request.objective, seed_mol=seed_mol)

        job.candidates = ranked(top_candidates)[: request.count]
        job.status = "completed"
        job.progress = 1.0
        job.completed_at = _timestamp()
        
        job.artifacts = [
            artifact.model_dump()
            for artifact in build_generation_artifacts(
                job,
                invalid_count=engine_output.get("metadata", {}).get("operator_stats", {}).get("invalids", 0) or engine_output.get("metadata", {}).get("operator_stats", {}).get("invalid_count", 0),
                generation_history=engine_output.get("generation_history"),
                metadata=engine_output.get("metadata"),
            )
        ]
    except Exception as exc:
        import traceback
        tb_str = traceback.format_exc()
        logger.error(f"Generation job {job.job_id} failed: {tb_str}")
        job.status = "failed"
        job.errors = [tb_str]
        job.completed_at = _timestamp()
        job.artifacts = [build_generation_error(job, str(exc)).model_dump()]
    save_job(job)
    return job


def build_generation_artifacts(
    job: GenerationJob,
    invalid_count: int = 0,
    generation_history: list[dict[str, Any]] | None = None,
    metadata: dict[str, Any] | None = None,
) -> list[WorkspaceArtifact]:
    summary = {
        "requested": job.request.count,
        "generated": len(job.candidates) + invalid_count,
        "valid": len(job.candidates),
        "unique": len({candidate.smiles for candidate in job.candidates}),
        "invalid": invalid_count,
    }
    
    # Add operator stats to summary if available
    if metadata and "operator_stats" in metadata:
        summary.update(metadata["operator_stats"])

    seed = _resolved_seed(job.request.seed) if job.request.seed else None
    artifact = WorkspaceArtifact(
        id=new_id("artifact"),
        kind="generated_molecule_set",
        title=f"{_display_engine(job.engine)} descriptor-guided candidates",
        summary=f"Generated {summary['valid']} valid descriptor-guided candidates using {job.engine}.",
        data={
            "job_id": job.job_id,
            "engine": job.engine,
            "engine_label": _display_engine(job.engine),
            "seed_smiles": seed,
            "objective": job.request.objective.model_dump() if job.request.objective else None,
            "summary": summary,
            "candidates": [candidate.model_dump() for candidate in job.candidates],
            "generation_history": generation_history or [],
            "engine_metadata": metadata or {},
            "limitations": [
                "Descriptor-guided candidate generation only.",
                "MolVis Graph is GB_GA-inspired RDKit graph mutation; it is not a full GB_GA implementation.",
                "MolVis Grammar is ChemGE-inspired grammar/SMILES exploration; it is not a full ChemGE implementation.",
                "No docking, synthesis, toxicity, dosing, medical, or clinical claims are implied.",
            ],
        },
        provenance=["MolVis", "RDKit", _display_engine(job.engine)],
        warnings=["Generated candidates require expert review before any downstream use."],
        source_tool="generate_molecules",
        created_at=_timestamp(),
    )
    return [artifact]


def build_generation_error(job: GenerationJob, error: str) -> WorkspaceArtifact:
    return WorkspaceArtifact(
        id=new_id("artifact"),
        kind="generation_error",
        title="Generation failed",
        summary=error,
        data={"job_id": job.job_id, "engine": job.engine, "error": error},
        provenance=["MolVis"],
        warnings=["No generated molecules were produced."],
        source_tool="generate_molecules",
        created_at=_timestamp(),
    )


def _normalize_request(request: GenerationRequest) -> Dict[str, Any]:
    seed = _resolved_seed(request.seed) if request.seed else None
    return {
        "engine": request.engine,
        "seed": seed,
        "count": request.count,
        "objective": request.objective.model_dump() if request.objective else None,
        "constraints": request.constraints,
        "locked_scaffold": request.locked_scaffold,
    }


def _resolved_seed(seed: str | None) -> str:
    if not seed:
        return ""
    candidate = seed.strip()
    resolved = GENERATION_ALIASES.get(candidate.lower(), candidate)
    return molecule_to_smiles(smiles_to_mol(resolved))


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _display_engine(engine: str) -> str:
    if engine == "molvis_graph":
        return "MolVis Graph"
    if engine == "molvis_grammar":
        return "MolVis Grammar"
    return "MolVis Generation"

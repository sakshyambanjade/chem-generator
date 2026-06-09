from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


GenerationEngineName = Literal["molvis_graph", "molvis_grammar", "molvis_transformer", "molvis_fragment_constrained", "molvis_chem_ge"]
GenerationDirection = Literal["minimize", "maximize", "target"]


class GenerationObjective(BaseModel):
    target_property: str = "logP"
    direction: GenerationDirection = "target"
    target_value: Optional[float] = None


class GenerationRequest(BaseModel):
    engine: GenerationEngineName = "molvis_graph"
    seed: Optional[str] = None
    count: int = Field(default=25, ge=1, le=200)
    objective: Optional[GenerationObjective] = None
    constraints: Dict[str, Any] = Field(default_factory=dict)
    locked_scaffold: Optional[str] = None



class GeneratedMolecule(BaseModel):
    rank: int = 0
    smiles: str
    score: float = 0.0
    objective_score: float = 0.0
    diversity_score: float = 0.0
    novelty_score: float = 0.0
    objective_improvement: Optional[float] = None
    molecular_weight: float = 0.0
    logP: float = 0.0
    tpsa: float = 0.0
    hbd: int = 0
    hba: int = 0
    qed: Optional[float] = None
    sa_score: Optional[float] = None
    fsp3: Optional[float] = None
    similarity_to_seed: Optional[float] = None
    svg: str = ""
    valid: bool = True
    mutation_trace: List[str] = Field(default_factory=list)
    generation_trace: List[str] = Field(default_factory=list)
    rank_reason: str = ""
    warnings: List[str] = Field(default_factory=list)


class GenerationJob(BaseModel):
    job_id: str
    engine: GenerationEngineName
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    progress: float = 0.0
    request: GenerationRequest
    candidates: List[GeneratedMolecule] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    artifacts: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: str
    completed_at: Optional[str] = None


class GenerationJobResponse(BaseModel):
    job: GenerationJob

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from uuid import uuid4

from app.models.generation import GenerationObjective
from app.services.generation.rl_adapter import RL_JOBS, RLGenerationTask

router = APIRouter(prefix="/generation/rl", tags=["rl_generation"])

class StartRLRequest(BaseModel):
    prior_engine: str = "molvis_grammar"
    objective: Optional[GenerationObjective] = None
    iterations: int = 15
    batch_size: int = 20
    learning_rate: float = 0.05

class RLStatusResponse(BaseModel):
    job_id: str
    status: str
    history: List[Dict[str, Any]]
    top_candidates: List[Any]

@router.post("/start", response_model=Dict[str, str])
async def start_rl(request: StartRLRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid4())
    task = RLGenerationTask(
        job_id=job_id,
        prior_engine=request.prior_engine,
        objective=request.objective,
        iterations=request.iterations,
        batch_size=request.batch_size,
        learning_rate=request.learning_rate
    )
    RL_JOBS[job_id] = task
    background_tasks.add_task(task.run)
    return {"job_id": job_id, "status": "started"}

@router.get("/status", response_model=RLStatusResponse)
async def get_rl_status(job_id: str):
    task = RL_JOBS.get(job_id)
    if not task:
        raise HTTPException(status_code=404, detail="RL generation job not found.")
    return {
        "job_id": job_id,
        "status": task.status,
        "history": task.history,
        "top_candidates": [c.model_dump() for c in task.top_candidates]
    }

@router.post("/stop", response_model=Dict[str, str])
async def stop_rl(job_id: str):
    task = RL_JOBS.get(job_id)
    if not task:
        raise HTTPException(status_code=404, detail="RL generation job not found.")
    task.stop()
    return {"job_id": job_id, "status": "stopping"}

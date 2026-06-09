from __future__ import annotations
from app.config import settings
import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.core.celery_app import enqueue_job, redis_url as REDIS_URL
import urllib.parse

from app.models.generation import GenerationJobResponse, GenerationRequest
from app.services.generation.generation_runner import create_initial_job, run_generation_task
from app.services.generation.job_store import get_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/generation", tags=["generation"])


@router.post("/jobs", response_model=GenerationJobResponse)
async def create_generation_job(
    request: GenerationRequest,
    background_tasks: BackgroundTasks
) -> GenerationJobResponse:
    job = create_initial_job(request)
    
    # Check if we should fall back to running the generation task inside the FastAPI process:
    # 1. If Redis is pointing to localhost in a production Cloud Run environment (no active Redis container)
    # 2. Or if enqueuing via Celery/Redis throws a connection error
    parsed_redis = urllib.parse.urlparse(REDIS_URL)
    is_local_redis = parsed_redis.hostname in ("localhost", "127.0.0.1", None)
    is_prod = settings.K_SERVICE is not None or settings.PORT is not None
    
    if is_local_redis and is_prod:
        logger.info("Local Redis URL detected in container/prod environment. Executing generation job %s in-process via BackgroundTasks.", job.job_id)
        background_tasks.add_task(run_generation_task, job.job_id)
    else:
        try:
            await enqueue_job(job.job_id)
        except Exception as exc:
            logger.warning("Failed to enqueue generation job %s via Celery/Redis. Falling back to BackgroundTasks: %s", job.job_id, exc)
            background_tasks.add_task(run_generation_task, job.job_id)
            
    return GenerationJobResponse(job=job)


@router.get("/jobs/{job_id}", response_model=GenerationJobResponse)
async def read_generation_job(job_id: str) -> GenerationJobResponse:
    try:
        return GenerationJobResponse(job=get_job(job_id))
    except FileNotFoundError as exc:
        logger.exception("Generation job not found")
        raise HTTPException(status_code=404, detail="Generation job not found") from exc


@router.get("/jobs/{job_id}/candidates")
async def read_generation_candidates(job_id: str) -> Dict[str, Any]:
    try:
        job = get_job(job_id)
    except FileNotFoundError as exc:
        logger.exception("Generation job not found")
        raise HTTPException(status_code=404, detail="Generation job not found") from exc
    return {"job_id": job.job_id, "candidates": [candidate.model_dump() for candidate in job.candidates]}


@router.get("/jobs/{job_id}/events")
async def stream_generation_events(job_id: str):
    """
    Stream generation progress updates via Server-Sent Events (SSE).
    """
    import asyncio
    import json
    from fastapi.responses import StreamingResponse

    async def event_generator():
        last_progress = -1.0
        last_status = None
        
        while True:
            try:
                loop = asyncio.get_running_loop()
                job = await loop.run_in_executor(None, get_job, job_id)
            except FileNotFoundError:
                logger.exception("Generation job not found in stream")
                yield f"event: error\ndata: {json.dumps({'detail': 'Job not found'})}\n\n"
                break
            except Exception:
                logger.exception("Generation streaming error")
                yield f"event: error\ndata: {json.dumps({'detail': 'Stream interrupted. Please retry.'})}\n\n"
                break

            if job.progress != last_progress or job.status != last_status:
                last_progress = job.progress
                last_status = job.status
                event_data = {
                    "job_id": job.job_id,
                    "status": job.status,
                    "progress": job.progress,
                    "candidates_count": len(job.candidates),
                }
                yield f"event: progress\ndata: {json.dumps(event_data)}\n\n"

            if job.status in ("completed", "failed"):
                final_data = {
                    "job_id": job.job_id,
                    "status": job.status,
                    "progress": job.progress,
                    "candidates": [c.model_dump() for c in job.candidates],
                    "errors": job.errors,
                }
                yield f"event: result\ndata: {json.dumps(final_data)}\n\n"
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")



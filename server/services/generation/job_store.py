from __future__ import annotations

import uuid
from app.models.generation import GenerationJob
from app.models.generation_job import GenerationJobORM
from app.models.base import SessionLocal


COLLECTION = "generation_jobs"


def save_job(job: GenerationJob) -> GenerationJob:
    """Persist a GenerationJob using SQLAlchemy ORM.
    If the job already exists, it will be merged/updated.
    """
    with SessionLocal() as session:
        # Convert Pydantic model to dict for ORM storage
        job_dict = job.model_dump()
        # Convert job_id to uuid.UUID for compatibility with SQLite
        db_id = uuid.UUID(job.job_id) if isinstance(job.job_id, str) else job.job_id
        job_dict["job_id"] = db_id
        
        orm_obj = session.get(GenerationJobORM, db_id)
        if orm_obj:
            for key, value in job_dict.items():
                setattr(orm_obj, key, value)
        else:
            orm_obj = GenerationJobORM(**job_dict)
            session.add(orm_obj)
        session.commit()
    return job

def get_job(job_id: str) -> GenerationJob:
    """Retrieve a GenerationJob from the database.
    Raises FileNotFoundError if not found.
    """
    with SessionLocal() as session:
        # Convert job_id string to uuid.UUID for SQLAlchemy UUID type mapping compatibility
        db_id = uuid.UUID(job_id) if isinstance(job_id, str) else job_id
        orm_obj = session.get(GenerationJobORM, db_id)

        if not orm_obj:
            raise FileNotFoundError(f"{COLLECTION}:{job_id} not found")
        # Convert ORM object back to Pydantic model
        data = {
            "job_id": str(orm_obj.job_id),
            "engine": orm_obj.engine,
            "status": orm_obj.status,
            "progress": orm_obj.progress,
            "request": orm_obj.request,
            "candidates": orm_obj.candidates or [],
            "errors": orm_obj.errors or [],
            "artifacts": orm_obj.artifacts or [],
            "created_at": orm_obj.created_at,
            "completed_at": orm_obj.completed_at,
        }
        return GenerationJob(**data)
    


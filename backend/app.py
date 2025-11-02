# app.py
from fastapi import FastAPI
from contextlib import asynccontextmanager
from sqlmodel import SQLModel
from src.db import engine
from src.models import Document, Requirement, TestCase, ReviewEvent, GenerationEvent
from src.routers import (
    files_router,
    extraction_router,
    generate_router,
    testcases_router,
    review_router,
    requirements_router,
    export_router,
    rag_router,
    pipeline_router,
    judge_router,
    human_review_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    yield


app = FastAPI(
    title="AI Test Case Generator",
    description="Workflow-based test case generation with human-in-the-loop review",
    version="1.0.0",
    lifespan=lifespan,
)
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://storage.googleapis.com",
        "https://storage.googleapis.com/tcgen-ai-genaiexchange-frontend",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers in execution order
app.include_router(files_router.router, tags=["documents"])
app.include_router(extraction_router.router, tags=["extraction"])
app.include_router(rag_router.router, tags=["embeddings"])
app.include_router(generate_router.router, tags=["generation"])
app.include_router(judge_router.router, tags=["judge"])
app.include_router(human_review_router.router, tags=["review"])
app.include_router(export_router.router, tags=["export"])
app.include_router(testcases_router.router, tags=["testcases"])
app.include_router(review_router.router, tags=["requirements"])
app.include_router(requirements_router.router, tags=["requirements"])
app.include_router(pipeline_router.router, tags=["pipeline"])

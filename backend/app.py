# app.py
from fastapi import FastAPI
from contextlib import asynccontextmanager
from sqlmodel import SQLModel
from src.db import engine
from src.models import Document, Requirement, TestCase, ReviewEvent, GenerationEvent
from src.routers import files_router, extraction_router, generate_router, testcases_router, review_router, requirements_router, export_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    yield

app = FastAPI(lifespan=lifespan)
# CORS middleware (as we added earlier) - keep that
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173","https://storage.googleapis.com",
        "https://storage.googleapis.com/tcgen-ai-genaiexchange-frontend"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(files_router.router)
app.include_router(extraction_router.router)
app.include_router(generate_router.router)
app.include_router(testcases_router.router)
app.include_router(review_router.router)
app.include_router(requirements_router.router)
app.include_router(export_router.router)

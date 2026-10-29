"""FastAPI Application Entry Point for TripWise AI."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import get_db, get_retriever, router
from app.core.config import get_settings
from app.services.seed_service import ensure_seeded


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = get_db()
    retriever = get_retriever()
    ensure_seeded(db, retriever, force_reseed=False)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            "Source-grounded Travel Planning and Policy Assistant. "
            "Retrieves curated travel guides and policy documents via hybrid FAISS + BM25 search, "
            "validates policies, flags conflicting or outdated documents, and traces every factual policy claim to its citation."
        ),
        lifespan=lifespan,
    )

    allow_creds = "*" not in settings.CORS_ORIGINS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=allow_creds,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(router, prefix=settings.API_PREFIX)
    return app


app = create_app()

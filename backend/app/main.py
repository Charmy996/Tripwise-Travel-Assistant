"""FastAPI Application Entry Point for TripWise AI with centralized exception handling and request tracking."""
from contextlib import asynccontextmanager
import logging
import time
import uuid
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import get_db, get_retriever, router
from app.core.config import get_settings
from app.services.seed_service import ensure_seeded

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("tripwise")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing TripWise AI backend services...")
    db = get_db()
    retriever = get_retriever()
    # Seed sample documents and demo scenario once on startup
    ensure_seeded(db, retriever, force_reseed=False)
    logger.info("TripWise AI ready to handle requests.")
    yield
    logger.info("TripWise AI shutting down gracefully.")


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

    # Request ID and Timing Middleware
    @app.middleware("http")
    async def request_middleware(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or f"req-{uuid.uuid4().hex[:10]}"
        start_time = time.time()
        response = await call_next(request)
        process_time_ms = round((time.time() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = req_id
        response.headers["X-Process-Time-Ms"] = str(process_time_ms)
        return response

    # Centralized Exception Handlers
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        req_id = request.headers.get("X-Request-ID", "unknown")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "status_code": exc.status_code,
                "request_id": req_id,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        req_id = request.headers.get("X-Request-ID", "unknown")
        err_msgs = [f"{e.get('loc', ['field'])[-1]}: {e.get('msg', 'Invalid')}" for e in exc.errors()]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": "; ".join(err_msgs),
                "errors": exc.errors(),
                "status_code": 422,
                "request_id": req_id,
            },
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        req_id = request.headers.get("X-Request-ID", "unknown")
        logger.error(f"Unhandled Exception on [{request.method} {request.url.path}] (ReqID: {req_id}): {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": "An internal server error occurred while processing your request. Please try again.",
                "error_type": exc.__class__.__name__,
                "request_id": req_id,
            },
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(router, prefix=settings.API_PREFIX)
    return app


app = create_app()

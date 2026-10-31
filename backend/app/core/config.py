import os
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel


class Settings(BaseModel):
    APP_NAME: str = "TripWise AI — Travel Planning and Policy Assistant"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    SAMPLE_DOCS_DIR: Path = DATA_DIR / "sample_documents"
    UPLOAD_DOCS_DIR: Path = DATA_DIR / "uploaded_documents"
    DB_PATH: Path = DATA_DIR / "tripwise.db"

    MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB limit
    ALLOWED_EXTENSIONS: List[str] = [".pdf", ".txt", ".md"]

    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Configurable LLM settings (kept strictly on backend)
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "local_demo")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
    LLM_TIMEOUT_SECONDS: float = float(os.getenv("LLM_TIMEOUT_SECONDS", "15.0"))

    # Optional Live Information Verification Adapter configuration
    LIVE_VERIFICATION_ENABLED: bool = os.getenv("LIVE_VERIFICATION_ENABLED", "false").lower() == "true"
    LIVE_ADVISORY_ENDPOINT: str = os.getenv("LIVE_ADVISORY_ENDPOINT", "")
    LIVE_WEATHER_ENDPOINT: str = os.getenv("LIVE_WEATHER_ENDPOINT", "")
    LIVE_TIMEOUT_SECONDS: float = float(os.getenv("LIVE_TIMEOUT_SECONDS", "5.0"))

    # Embedding configuration
    EMBEDDING_MODEL_NAME: str = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
    USE_NEURAL_EMBEDDINGS: bool = os.getenv("USE_NEURAL_EMBEDDINGS", "true").lower() == "true"

    # Location Autocomplete Configuration
    LOCATION_PROVIDER: str = os.getenv("LOCATION_PROVIDER", "nominatim")
    LOCATION_API_TIMEOUT: float = float(os.getenv("LOCATION_API_TIMEOUT", "5.0"))
    LOCATION_CACHE_TTL: int = int(os.getenv("LOCATION_CACHE_TTL", "86400"))
    LOCATION_FALLBACK_ENABLED: bool = os.getenv("LOCATION_FALLBACK_ENABLED", "true").lower() == "true"

    @property
    def is_llm_configured(self) -> bool:
        return bool(self.LLM_API_KEY and self.LLM_API_KEY.strip() and self.LLM_PROVIDER != "local_demo")


def get_settings() -> Settings:
    settings = Settings(
        LLM_PROVIDER=os.getenv("LLM_PROVIDER", "local_demo"),
        LLM_API_KEY=os.getenv("LLM_API_KEY", ""),
        LLM_BASE_URL=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
        LLM_MODEL=os.getenv("LLM_MODEL", "gpt-4o-mini"),
        LLM_TIMEOUT_SECONDS=float(os.getenv("LLM_TIMEOUT_SECONDS", "15.0")),
        LIVE_VERIFICATION_ENABLED=os.getenv("LIVE_VERIFICATION_ENABLED", "false").lower() == "true",
        LIVE_ADVISORY_ENDPOINT=os.getenv("LIVE_ADVISORY_ENDPOINT", ""),
        LIVE_WEATHER_ENDPOINT=os.getenv("LIVE_WEATHER_ENDPOINT", ""),
        LIVE_TIMEOUT_SECONDS=float(os.getenv("LIVE_TIMEOUT_SECONDS", "5.0")),
        LOCATION_PROVIDER=os.getenv("LOCATION_PROVIDER", "nominatim"),
        LOCATION_API_TIMEOUT=float(os.getenv("LOCATION_API_TIMEOUT", "5.0")),
        LOCATION_CACHE_TTL=int(os.getenv("LOCATION_CACHE_TTL", "86400")),
        LOCATION_FALLBACK_ENABLED=os.getenv("LOCATION_FALLBACK_ENABLED", "true").lower() == "true",
    )
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    settings.SAMPLE_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    settings.UPLOAD_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    return settings

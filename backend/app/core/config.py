"""Core Configuration Settings for ORCA.

Loads from environment variables and .env file.
Owned by Dev 2 (Backend Platform).
"""


from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    APP_NAME: str = "ORCA"
    APP_ENV: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # Server
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,https://orca-qxx1.vercel.app"

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        if any(o == "*" for o in origins):
            raise ValueError("Wildcard CORS (*) is not safe. Specify precise origins.")
        return origins

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://orca_user:orca_password_placeholder@localhost:5432/orca_db"
    # Render supplies DATABASE_URL. Derive the synchronous SQLAlchemy URL
    # automatically unless a local/test override is explicitly provided.
    SYNC_DATABASE_URL: str = ""

    @model_validator(mode="after")
    def derive_sync_database_url(self) -> "Settings":
        if not self.SYNC_DATABASE_URL:
            if self.DATABASE_URL.startswith("postgresql+asyncpg://"):
                self.SYNC_DATABASE_URL = self.DATABASE_URL.replace(
                    "postgresql+asyncpg://", "postgresql+psycopg2://", 1
                )
            elif self.DATABASE_URL.startswith("postgresql://"):
                self.SYNC_DATABASE_URL = self.DATABASE_URL.replace(
                    "postgresql://", "postgresql+psycopg2://", 1
                )
            else:
                self.SYNC_DATABASE_URL = self.DATABASE_URL
        return self

    # Data Strategy
    DATA_MODE: str = "SNAPSHOT"  # LIVE | HYBRID | SNAPSHOT (offline-first local demo default)

    @property
    def validated_data_mode(self) -> str:
        mode = self.DATA_MODE.upper()
        if mode not in ("LIVE", "HYBRID", "SNAPSHOT"):
            raise ValueError(f"Invalid DATA_MODE: {mode}. Must be LIVE, HYBRID, or SNAPSHOT.")
        return mode

    DATA_FIXTURES_PATH: str = "./data/fixtures"

    # External APIs
    INCOIS_API_BASE_URL: str = "https://incois.gov.in/portal/rest/placeholder"
    INCOIS_API_KEY: str = ""
    IMD_API_BASE_URL: str = "https://mausam.imd.gov.in/api/placeholder"
    IMD_API_KEY: str = ""
    MOSDAC_API_BASE_URL: str = "https://mosdac.gov.in/api/placeholder"
    MOSDAC_API_KEY: str = ""
    OPEN_METEO_BASE_URL: str = "https://marine-api.open-meteo.com/v1/marine"
    OPEN_METEO_CACHE_TTL_SECONDS: int = 3600
    SARVAM_API_KEY: str = ""
    SACHET_API_BASE_URL: str = "https://sachet.ndma.gov.in/api/v1/cap/placeholder"
    SACHET_API_KEY: str = ""

    # Rate Limiting
    RATE_LIMIT_CHAT_PER_MINUTE: int = 60
    RATE_LIMIT_VOICE_PER_MINUTE: int = 20

    # LLM Settings
    GROQ_API_KEY: str = ""
    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_MODE: str = "auto"  # auto | deterministic | fake | provider
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_TEMPERATURE: float = 0.1
    LLM_REQUEST_TIMEOUT_SECONDS: int = 25


settings = Settings()

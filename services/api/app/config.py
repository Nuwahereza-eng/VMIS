"""Application configuration.

Values come from environment variables (prefix ``VMIS_``) so that no secret
is ever hardcoded. See ``.env.example`` at the repo root.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VMIS_", extra="ignore")

    secret_key: str = "insecure-dev-key-override-in-production"
    access_token_ttl_minutes: int = 60

    # Default to SQLite for zero-config local runs and tests. Production sets
    # VMIS_DATABASE_URL to a PostgreSQL DSN (the system of record).
    database_url: str = "sqlite+pysqlite:///./vmis_dev.db"

    pii_retention_days: int = 365
    # Run PII retention enforcement automatically at application start.
    retention_enforce_on_start: bool = True

    # Alert thresholds (build prompt section 4.1, Alerts). Hours a stay may run
    # past its ticket expiry before it counts as an overstay, and hours an open
    # visit may sit before it is flagged as a probably-missed exit.
    overstay_grace_hours: int = 6
    missing_exit_hours: int = 48
    # Hours of remaining ticket time at or below which an advance expiry-warning
    # alert is raised, so staff and the visitor get notice before the ticket
    # lapses rather than only at the moment of expiry (build prompt section 4.1).
    expiry_warning_hours: int = 3

    bootstrap_admin_username: str | None = None
    bootstrap_admin_password: str | None = None

    # Comma-separated list of browser origins allowed to call the API via CORS.
    # Needed when the PWA is hosted on a different origin than the API (e.g. the
    # frontend on Vercel and the API on Render). Defaults to "*" (any origin);
    # tighten to your deployed frontend URL(s) in production. Auth uses Bearer
    # tokens, not cookies, so credentialed CORS is not required.
    cors_allow_origins: str = "*"

    @property
    def cors_origins(self) -> list[str]:
        raw = (self.cors_allow_origins or "").strip()
        if raw in ("", "*"):
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

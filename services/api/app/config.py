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

    bootstrap_admin_username: str | None = None
    bootstrap_admin_password: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()

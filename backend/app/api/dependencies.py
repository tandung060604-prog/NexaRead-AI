from app.core.config import get_settings


def get_current_owner_id() -> str:
    return get_settings().default_owner_id

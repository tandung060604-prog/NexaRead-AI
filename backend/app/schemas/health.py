from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["healthy"]
    service: str


class ReadinessResponse(BaseModel):
    status: Literal["healthy", "unhealthy"]
    service: str
    checks: dict[str, Literal["healthy", "unhealthy"]]

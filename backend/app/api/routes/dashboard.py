from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_owner_id
from app.db.session import get_database_session
from app.schemas.dashboard import DashboardResponse
from app.services.dashboard import get_dashboard

router = APIRouter(tags=["dashboard"])


@router.get("/api/dashboard", response_model=DashboardResponse)
async def personal_dashboard(
    session: Annotated[AsyncSession, Depends(get_database_session)],
    owner_id: Annotated[str, Depends(get_current_owner_id)],
) -> DashboardResponse:
    return await get_dashboard(session, owner_id)

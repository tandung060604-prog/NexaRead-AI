from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_owner_id
from app.db.session import get_database_session
from app.schemas.personalization import (
    AnalyticsPreferenceUpdate,
    OnboardingResponse,
    OnboardingUpdate,
    ReadingAnalyticsResponse,
)
from app.services.personalization import (
    complete_onboarding,
    get_onboarding,
    get_reading_analytics,
    set_analytics_enabled,
    skip_onboarding,
)

router = APIRouter(prefix="/api/users/me", tags=["personalization"])
SessionDependency = Annotated[AsyncSession, Depends(get_database_session)]
OwnerDependency = Annotated[str, Depends(get_current_owner_id)]


@router.get("/onboarding", response_model=OnboardingResponse)
async def onboarding(
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> OnboardingResponse:
    return await get_onboarding(session, owner_id)


@router.put("/onboarding", response_model=OnboardingResponse)
async def save_onboarding(
    payload: OnboardingUpdate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> OnboardingResponse:
    return await complete_onboarding(session, owner_id, payload)


@router.post("/onboarding/skip", response_model=OnboardingResponse)
async def skip_user_onboarding(
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> OnboardingResponse:
    return await skip_onboarding(session, owner_id)


@router.get("/reading-analytics", response_model=ReadingAnalyticsResponse)
async def reading_analytics(
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> ReadingAnalyticsResponse:
    return await get_reading_analytics(session, owner_id)


@router.put("/reading-analytics/preference", response_model=ReadingAnalyticsResponse)
async def update_reading_analytics_preference(
    payload: AnalyticsPreferenceUpdate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> ReadingAnalyticsResponse:
    return await set_analytics_enabled(session, owner_id, payload.enabled)

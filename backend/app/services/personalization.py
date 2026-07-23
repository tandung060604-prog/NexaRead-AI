from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import (
    ReadingDailySummary,
    ReadingProgress,
    UserReadingPreference,
)
from app.models.auth import UserPersonalization
from app.schemas.personalization import (
    OnboardingResponse,
    OnboardingUpdate,
    ReadingAnalyticsResponse,
)

_DISPLAY_DEFAULTS: dict[str, dict[str, object]] = {
    "BOOK": {
        "theme": "sepia",
        "font_family": "serif",
        "reading_mode": "book",
        "reading_width": 720,
    },
    "CLEAN": {
        "theme": "light",
        "font_family": "sans",
        "reading_mode": "clean",
        "reading_width": 760,
    },
    "STUDY": {
        "theme": "light",
        "font_family": "sans",
        "reading_mode": "study",
        "reading_width": 820,
    },
}


async def _personalization(
    session: AsyncSession,
    user_id: str,
) -> UserPersonalization | None:
    result = await session.scalars(
        select(UserPersonalization).where(UserPersonalization.user_id == user_id)
    )
    return result.one_or_none()


async def _preferences(
    session: AsyncSession,
    user_id: str,
) -> UserReadingPreference | None:
    result = await session.scalars(
        select(UserReadingPreference).where(UserReadingPreference.user_id == user_id)
    )
    return result.one_or_none()


def _onboarding_response(
    profile: UserPersonalization | None,
    preferences: UserReadingPreference | None,
) -> OnboardingResponse:
    if profile is None:
        status = "NOT_STARTED"
    elif profile.onboarding_completed_at is not None:
        status = "COMPLETED"
    elif profile.onboarding_skipped_at is not None:
        status = "SKIPPED"
    else:
        status = "NOT_STARTED"
    return OnboardingResponse(
        status=status,
        reading_types=profile.reading_types if profile else [],
        reading_goal=profile.reading_goal if profile else None,
        display_preference=profile.display_preference if profile else None,
        analytics_enabled=preferences.analytics_enabled if preferences else False,
        completed_at=profile.onboarding_completed_at if profile else None,
        skipped_at=profile.onboarding_skipped_at if profile else None,
    )


async def get_onboarding(
    session: AsyncSession,
    user_id: str,
) -> OnboardingResponse:
    return _onboarding_response(
        await _personalization(session, user_id),
        await _preferences(session, user_id),
    )


async def complete_onboarding(
    session: AsyncSession,
    user_id: str,
    payload: OnboardingUpdate,
) -> OnboardingResponse:
    profile = await _personalization(session, user_id)
    if profile is None:
        profile = UserPersonalization(user_id=user_id, reading_types=[])
        session.add(profile)
    profile.reading_types = list(payload.reading_types)
    profile.reading_goal = payload.reading_goal
    profile.display_preference = payload.display_preference
    profile.onboarding_completed_at = datetime.now(UTC)
    profile.onboarding_skipped_at = None

    preferences = await _preferences(session, user_id)
    if preferences is None:
        preferences = UserReadingPreference(user_id=user_id)
        session.add(preferences)
    preferences.analytics_enabled = payload.analytics_enabled
    preferences.use_document_type_defaults = payload.display_preference == "AUTO"
    display_defaults = _DISPLAY_DEFAULTS.get(payload.display_preference)
    if display_defaults:
        for name, value in display_defaults.items():
            setattr(preferences, name, value)
    await session.commit()
    await session.refresh(profile)
    await session.refresh(preferences)
    return _onboarding_response(profile, preferences)


async def skip_onboarding(
    session: AsyncSession,
    user_id: str,
) -> OnboardingResponse:
    profile = await _personalization(session, user_id)
    if profile is None:
        profile = UserPersonalization(user_id=user_id, reading_types=[])
        session.add(profile)
    profile.onboarding_skipped_at = datetime.now(UTC)
    profile.onboarding_completed_at = None
    await session.commit()
    await session.refresh(profile)
    return _onboarding_response(profile, await _preferences(session, user_id))


async def set_analytics_enabled(
    session: AsyncSession,
    user_id: str,
    enabled: bool,
) -> ReadingAnalyticsResponse:
    preferences = await _preferences(session, user_id)
    if preferences is None:
        preferences = UserReadingPreference(user_id=user_id)
        session.add(preferences)
    preferences.analytics_enabled = enabled
    if not enabled:
        await session.execute(
            delete(ReadingDailySummary).where(ReadingDailySummary.user_id == user_id)
        )
        await session.execute(
            update(ReadingProgress)
            .where(ReadingProgress.user_id == user_id)
            .values(reading_seconds=0)
        )
    await session.commit()
    return await get_reading_analytics(session, user_id)


def _reading_streak(active_dates: set[date], today: date) -> int:
    if not active_dates:
        return 0
    cursor = today if today in active_dates else today - timedelta(days=1)
    streak = 0
    while cursor in active_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


async def get_reading_analytics(
    session: AsyncSession,
    user_id: str,
) -> ReadingAnalyticsResponse:
    preferences = await _preferences(session, user_id)
    if preferences is None or not preferences.analytics_enabled:
        return ReadingAnalyticsResponse(
            enabled=False,
            total_reading_seconds=0,
            reading_streak_days=0,
            documents_started=0,
            documents_completed=0,
            source_pages_reached=0,
            active_dates=[],
        )
    progress_items = list(
        await session.scalars(
            select(ReadingProgress).where(
                ReadingProgress.user_id == user_id,
                ReadingProgress.progress_percent > 0,
            )
        )
    )
    active_dates = set(
        await session.scalars(
            select(ReadingDailySummary.activity_date).where(
                ReadingDailySummary.user_id == user_id
            )
        )
    )
    total_seconds = int(
        await session.scalar(
            select(func.sum(ReadingDailySummary.reading_seconds)).where(
                ReadingDailySummary.user_id == user_id
            )
        )
        or 0
    )
    return ReadingAnalyticsResponse(
        enabled=True,
        total_reading_seconds=total_seconds,
        reading_streak_days=_reading_streak(active_dates, datetime.now(UTC).date()),
        documents_started=len(progress_items),
        documents_completed=sum(item.progress_percent >= 100 for item in progress_items),
        source_pages_reached=sum(item.page_number for item in progress_items),
        active_dates=sorted(active_dates, reverse=True)[:31],
    )

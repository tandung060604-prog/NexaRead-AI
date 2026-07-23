from time import perf_counter

import pytest

from app.models.document import Document
from tests.conftest import TEST_OWNER_ID, ApiTestContext


@pytest.mark.anyio
async def test_library_handles_500_metadata_records_with_bounded_latency(
    api_context: ApiTestContext,
) -> None:
    assert api_context.session_factory is not None
    async with api_context.session_factory() as session:
        session.add_all(
            [
                Document(
                    owner_id=TEST_OWNER_ID,
                    title=f"Performance document {index:03d}",
                    original_filename=f"performance-{index:03d}.pdf",
                    source_type="pdf",
                    mime_type="application/pdf",
                    file_size=2_048 + index,
                    status="AI_READY",
                )
                for index in range(500)
            ]
        )
        await session.commit()

    started_at = perf_counter()
    response = await api_context.client.get(
        "/api/documents?limit=100&offset=400&sort=title"
    )
    duration = perf_counter() - started_at

    assert response.status_code == 200
    assert response.json()["total"] == 500
    assert response.json()["limit"] == 100
    assert response.json()["offset"] == 400
    assert len(response.json()["items"]) == 100
    assert duration < 3

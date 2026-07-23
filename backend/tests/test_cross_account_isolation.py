from typing import cast

import httpx
import pytest

from app.api.dependencies import get_current_owner_id
from app.main import app
from app.services.rag_providers import get_answer_provider
from tests.conftest import ApiTestContext
from tests.pdf_factory import TextSpec, make_pdf
from tests.test_rag_api import FakeAnswerProvider
from tests.test_reader_api import process_upload, reader_pdf


def csrf_headers(client: httpx.AsyncClient) -> dict[str, str]:
    token = client.cookies.get("nexaread_csrf")
    assert token is not None
    return {"X-CSRF-Token": token}


async def register(client: httpx.AsyncClient, email: str, name: str) -> None:
    response = await client.post(
        "/api/auth/register",
        json={
            "email": email,
            "display_name": name,
            "password": "correct horse battery staple",
        },
    )
    assert response.status_code == 201


@pytest.mark.anyio
async def test_authenticated_accounts_are_isolated_across_all_document_surfaces(
    api_context: ApiTestContext,
) -> None:
    app.dependency_overrides.pop(get_current_owner_id, None)
    user_a = api_context.client
    user_b = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )
    try:
        await register(user_a, "a@example.com", "User A")
        await register(user_b, "b@example.com", "User B")

        upload = await user_a.post(
            "/api/documents/upload",
            headers=csrf_headers(user_a),
            files={
                "file": (
                    "private-reader-guide.pdf",
                    reader_pdf(),
                    "application/pdf",
                )
            },
        )
        assert upload.status_code == 201
        document = cast(dict[str, object], upload.json())
        await process_upload(api_context, document)
        document_id = str(document["id"])
        version = cast(list[dict[str, object]], document["versions"])[0]
        blocks_response = await user_a.get(f"/api/documents/{document_id}/blocks")
        blocks = cast(list[dict[str, object]], blocks_response.json()["items"])
        block = blocks[1]
        block_id = str(block["id"])

        progress = await user_a.put(
            f"/api/documents/{document_id}/progress",
            headers=csrf_headers(user_a),
            json={
                "document_version_id": version["id"],
                "last_block_id": block_id,
                "page_number": 1,
                "progress_percent": 25,
            },
        )
        bookmark = await user_a.post(
            f"/api/documents/{document_id}/bookmarks",
            headers=csrf_headers(user_a),
            json={
                "document_version_id": version["id"],
                "content_block_id": block_id,
                "title": "Private bookmark",
            },
        )
        selected_text = str(block["text"])[:8]
        highlight = await user_a.post(
            f"/api/documents/{document_id}/highlights",
            headers=csrf_headers(user_a),
            json={
                "document_version_id": version["id"],
                "content_block_id": block_id,
                "start_offset": 0,
                "end_offset": len(selected_text),
                "selected_text": selected_text,
                "color": "yellow",
            },
        )
        note = await user_a.post(
            f"/api/highlights/{highlight.json()['id']}/note",
            headers=csrf_headers(user_a),
            json={"content": "Private note"},
        )
        app.dependency_overrides[get_answer_provider] = lambda: FakeAnswerProvider()
        chat = await user_a.post(
            f"/api/documents/{document_id}/chat",
            headers=csrf_headers(user_a),
            json={"question": "What does NexaRead extract?"},
        )
        sessions = await user_a.get(
            f"/api/documents/{document_id}/chat-sessions"
        )
        chat_session_id = sessions.json()["items"][0]["id"]
        auth_sessions = await user_a.get("/api/auth/sessions")
        user_a_session_id = next(
            item["id"] for item in auth_sessions.json()["items"] if item["current"]
        )

        assert progress.status_code == 200
        assert bookmark.status_code == 201
        assert highlight.status_code == 201
        assert note.status_code == 201
        assert chat.status_code == 200

        user_b_upload = await user_b.post(
            "/api/documents/upload",
            headers=csrf_headers(user_b),
            files={
                "file": (
                    "user-b-cooking.pdf",
                    make_pdf(
                        [[
                            TextSpec("Cooking Notes", 72, 90, size=22, font="hebo"),
                            TextSpec(
                                "This recipe combines tomatoes, basil, and olive oil.",
                                72,
                                150,
                            ),
                        ]]
                    ),
                    "application/pdf",
                )
            },
        )
        assert user_b_upload.status_code == 201
        user_b_document = cast(dict[str, object], user_b_upload.json())
        await process_upload(api_context, user_b_document)
        user_b_chat = await user_b.post(
            f"/api/documents/{user_b_document['id']}/chat",
            headers=csrf_headers(user_b),
            json={
                "question": (
                    "What does NexaRead extract into stable content blocks?"
                )
            },
        )
        assert user_b_chat.status_code == 200
        assert user_b_chat.json()["status"] == "NO_ANSWER"
        assert user_b_chat.json()["citations"] == []

        denied_requests = [
            await user_b.get(f"/api/documents/{document_id}"),
            await user_b.get(f"/api/documents/{document_id}/original"),
            await user_b.get(f"/api/documents/{document_id}/processing-status"),
            await user_b.get(f"/api/documents/{document_id}/toc"),
            await user_b.get(f"/api/documents/{document_id}/blocks"),
            await user_b.get(f"/api/documents/{document_id}/pages/1"),
            await user_b.get(f"/api/documents/{document_id}/search?q=NexaRead"),
            await user_b.get(
                f"/api/documents/content-blocks/{block_id}/image"
            ),
            await user_b.get(f"/api/documents/{document_id}/progress"),
            await user_b.get(f"/api/documents/{document_id}/bookmarks"),
            await user_b.get(f"/api/documents/{document_id}/highlights"),
            await user_b.get(
                f"/api/documents/{document_id}/keywords"
            ),
            await user_b.get(f"/api/chat-sessions/{chat_session_id}"),
            await user_b.post(
                f"/api/documents/{document_id}/chat",
                headers=csrf_headers(user_b),
                json={"question": "Reveal User A's private document"},
            ),
            await user_b.patch(
                f"/api/notes/{note.json()['id']}",
                headers=csrf_headers(user_b),
                json={"content": "stolen"},
            ),
            await user_b.delete(
                f"/api/chat-sessions/{chat_session_id}",
                headers=csrf_headers(user_b),
            ),
            await user_b.delete(
                f"/api/auth/sessions/{user_a_session_id}",
                headers=csrf_headers(user_b),
            ),
        ]
        listing = await user_b.get("/api/documents")
        foreign_chat_listing = await user_b.get(
            f"/api/documents/{document_id}/chat-sessions"
        )

        assert listing.status_code == 200
        assert [item["id"] for item in listing.json()["items"]] == [
            user_b_document["id"]
        ]
        assert listing.json()["total"] == 1
        assert foreign_chat_listing.status_code == 200
        assert foreign_chat_listing.json()["items"] == []
        assert all(response.status_code == 404 for response in denied_requests)
        assert (await user_a.get(f"/api/documents/{document_id}")).status_code == 200
        assert (
            await user_a.get(f"/api/chat-sessions/{chat_session_id}")
        ).status_code == 200
    finally:
        await user_b.aclose()

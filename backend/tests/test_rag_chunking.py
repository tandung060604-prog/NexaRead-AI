from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.models.rag import Chunk
from app.services.rag_chunking import ChunkBlock, build_chunk_specs, index_document_version
from app.services.rag_providers import LocalEmbeddingProvider
from tests.conftest import ApiTestContext
from tests.test_reader_api import process_upload, upload_document


def block(
    sequence: int,
    block_type: str,
    text: str,
    *,
    page: int = 1,
) -> ChunkBlock:
    return ChunkBlock(
        id=uuid4(),
        sequence_number=sequence,
        block_type=block_type,
        text=text,
        page_number=page,
        content_hash=f"hash-{sequence}",
    )


def test_structure_aware_chunking_is_deterministic_and_traceable() -> None:
    version_id = uuid4()
    blocks = [
        block(1, "HEADING_1", "Retrieval"),
        block(2, "PARAGRAPH", "Lexical retrieval finds exact terminology."),
        block(3, "CODE", "SELECT * FROM chunks;"),
        block(4, "HEADING_2", "Citation"),
        block(5, "PARAGRAPH", "Citations preserve source block identifiers.", page=2),
    ]

    first = build_chunk_specs(version_id, blocks)
    second = build_chunk_specs(version_id, blocks)

    assert first == second
    assert [item.content_hash for item in first] == [item.content_hash for item in second]
    assert any(item.metadata["block_types"] == ["CODE"] for item in first)
    assert all(item.content_block_ids for item in first)
    assert first[-1].page_end == 2


@pytest.mark.anyio
async def test_index_retry_does_not_duplicate_chunks(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context)
    await process_upload(api_context, payload)
    versions = payload["versions"]
    assert isinstance(versions, list)
    version_id = UUID(str(versions[0]["id"]))
    document_id = UUID(str(payload["id"]))
    assert api_context.session_factory is not None

    async with api_context.session_factory() as session:
        before = await session.scalar(
            select(func.count()).select_from(Chunk).where(Chunk.document_version_id == version_id)
        )
        indexed = await index_document_version(
            session,
            document_id=document_id,
            document_version_id=version_id,
            embedding_provider=LocalEmbeddingProvider(),
        )
        await session.commit()
        after = await session.scalar(
            select(func.count()).select_from(Chunk).where(Chunk.document_version_id == version_id)
        )
        chunks = list(
            (
                await session.scalars(
                    select(Chunk).where(Chunk.document_version_id == version_id)
                )
            ).all()
        )

    assert before == indexed == after
    assert all(chunk.embedding is not None for chunk in chunks)
    assert all(chunk.content_block_ids_json for chunk in chunks)

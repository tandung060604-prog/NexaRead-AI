import asyncio
from uuid import UUID, uuid4

import pytest

from app.models.rag import Chunk
from app.services.rag_providers import LocalEmbeddingProvider
from app.services.rag_retrieval import (
    fuse_candidates,
    lexical_relevance,
    reciprocal_rank_fusion,
    retrieve_document_sources,
)
from tests.conftest import ApiTestContext
from tests.test_reader_api import process_upload, upload_document


def make_chunk(text: str, embedding: list[float]) -> Chunk:
    return Chunk(
        id=uuid4(),
        document_id=uuid4(),
        document_version_id=uuid4(),
        section_block_id=None,
        text=text,
        token_count=8,
        page_start=1,
        page_end=1,
        content_block_ids_json=[],
        embedding=embedding,
        chunk_metadata={},
        content_hash=uuid4().hex,
    )


def test_lexical_vector_and_fusion_rank_relevant_evidence() -> None:
    relevant = make_chunk("Hybrid retrieval combines lexical and vector evidence.", [1.0, 0.0])
    irrelevant = make_chunk("Cooking recipes and garden notes.", [0.0, 1.0])

    ranked = fuse_candidates(
        [irrelevant, relevant],
        "hybrid lexical retrieval",
        [1.0, 0.0],
        top_k=2,
    )

    assert lexical_relevance("hybrid retrieval", relevant.text) > lexical_relevance(
        "hybrid retrieval", irrelevant.text
    )
    assert ranked[0].chunk.id == relevant.id
    assert reciprocal_rank_fusion([relevant.id], [relevant.id])[relevant.id] > 0


@pytest.mark.anyio
async def test_evidence_threshold_and_reranker_timeout_fallback(
    api_context: ApiTestContext,
) -> None:
    payload = await upload_document(api_context)
    await process_upload(api_context, payload)
    assert api_context.session_factory is not None

    async def slow_reranker(query: str, candidates: list[object]) -> list[object]:
        del query
        await asyncio.sleep(1)
        return candidates

    async with api_context.session_factory() as session:
        result = await retrieve_document_sources(
            session,
            user_id="local-user",
            document_id=UUID(str(payload["id"])),
            query="unique lexical phrase",
            embedding_provider=LocalEmbeddingProvider(),
            reranker=slow_reranker,  # type: ignore[arg-type]
        )
        no_evidence = await retrieve_document_sources(
            session,
            user_id="local-user",
            document_id=UUID(str(payload["id"])),
            query="quasar zebrafish unobtainium",
            embedding_provider=LocalEmbeddingProvider(),
            evidence_threshold=0.99,
        )

    assert result.sources
    assert result.rerank_fallback is True
    assert no_evidence.evidence_sufficient is False

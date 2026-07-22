from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import TypedDict, cast
from uuid import NAMESPACE_URL, UUID, uuid5

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models.rag import Chunk  # noqa: E402
from app.services.rag_chat import is_unsafe_question  # noqa: E402
from app.services.rag_providers import (  # noqa: E402
    AnswerSource,
    LocalEmbeddingProvider,
    LocalExtractiveAnswerProvider,
)
from app.services.rag_retrieval import fuse_candidates, lexical_relevance  # noqa: E402


class GoldenBlock(TypedDict):
    id: str
    type: str
    page: int
    text: str


class GoldenDocument(TypedDict):
    id: str
    blocks: list[GoldenBlock]


class GoldenCase(TypedDict):
    id: str
    document_id: str
    category: str
    question: str
    expected_behavior: str
    expected_source_blocks: list[str]
    must_cite: bool
    should_refuse: bool
    difficulty: str
    notes: str


class Dataset(TypedDict):
    dataset_version: str
    documents: list[GoldenDocument]
    cases: list[GoldenCase]


def stable_uuid(value: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"nexaread-evaluation:{value}")


async def evaluate(dataset: Dataset) -> dict[str, object]:
    provider = LocalEmbeddingProvider()
    answer_provider = LocalExtractiveAnswerProvider()
    documents = {document["id"]: document for document in dataset["documents"]}
    recalls: list[float] = []
    precisions: list[float] = []
    citation_hits: list[float] = []
    citation_coverage: list[float] = []
    faithfulness: list[float] = []
    answer_relevance: list[float] = []
    no_answer_hits: list[float] = []
    latencies: list[float] = []
    prompt_tokens = 0
    completion_tokens = 0
    case_results: list[dict[str, object]] = []

    for case in dataset["cases"]:
        started = time.perf_counter()
        blocks = documents[case["document_id"]]["blocks"]
        block_embedding = await provider.embed([block["text"] for block in blocks])
        query_embedding = await provider.embed([case["question"]])
        prompt_tokens += block_embedding.prompt_tokens + query_embedding.prompt_tokens
        chunks = [
            Chunk(
                id=stable_uuid(f"{case['document_id']}:{block['id']}"),
                document_id=stable_uuid(case["document_id"]),
                document_version_id=stable_uuid(f"{case['document_id']}:v1"),
                section_block_id=None,
                text=block["text"],
                token_count=max(1, len(block["text"].split())),
                page_start=block["page"],
                page_end=block["page"],
                content_block_ids_json=[block["id"]],
                embedding=vector,
                chunk_metadata={"block_type": block["type"]},
                content_hash=stable_uuid(block["id"]).hex,
            )
            for block, vector in zip(blocks, block_embedding.vectors, strict=True)
        ]
        unsafe = is_unsafe_question(case["question"])
        ranked = (
            []
            if unsafe
            else fuse_candidates(chunks, case["question"], query_embedding.vectors[0], top_k=3)
        )
        retrieved = [
            candidate.chunk.content_block_ids_json[0]
            for candidate in ranked
            if candidate.fused_score >= 0.08
        ]
        expected = set(case["expected_source_blocks"])
        predicted_no_answer = unsafe or not retrieved
        if expected:
            hits = len(expected.intersection(retrieved))
            recalls.append(hits / len(expected))
            precisions.append(hits / max(len(retrieved), 1))
            citation_hits.append(float(bool(retrieved and retrieved[0] in expected)))
            citation_coverage.append(float(bool(retrieved and retrieved[0] in expected)))
            if retrieved:
                source_by_block = {
                    candidate.chunk.content_block_ids_json[0]: candidate for candidate in ranked
                }
                answer_sources = [
                    AnswerSource(
                        label=f"S{index}",
                        text=source_by_block[block_id].chunk.text,
                        page_number=source_by_block[block_id].chunk.page_start,
                        section_title=None,
                    )
                    for index, block_id in enumerate(retrieved, start=1)
                ]
                answer = await answer_provider.answer(
                    question=case["question"], sources=answer_sources
                )
                prompt_tokens += answer.prompt_tokens
                completion_tokens += answer.completion_tokens
                grounded_text = answer.text.rsplit(" [S1]", maxsplit=1)[0]
                faithfulness.append(
                    float(answer_sources[0].text.startswith(grounded_text.rstrip(".")))
                )
                answer_relevance.append(lexical_relevance(case["question"], grounded_text))
        if case["should_refuse"]:
            no_answer_hits.append(float(predicted_no_answer))
        latency_ms = (time.perf_counter() - started) * 1000
        latencies.append(latency_ms)
        passed = (
            predicted_no_answer if case["should_refuse"] else bool(expected.intersection(retrieved))
        )
        case_results.append(
            {
                "id": case["id"],
                "passed": passed,
                "retrieved_source_blocks": retrieved,
                "latency_ms": round(latency_ms, 3),
            }
        )

    sorted_latency = sorted(latencies)
    p95_index = max(0, min(len(sorted_latency) - 1, round(0.95 * len(sorted_latency)) - 1))
    return {
        "dataset_version": dataset["dataset_version"],
        "generated_at": datetime.now(UTC).isoformat(),
        "provider": "local-hash-embedding-v1",
        "case_count": len(dataset["cases"]),
        "passed": sum(1 for result in case_results if result["passed"]),
        "metrics": {
            "retrieval_recall_at_3": round(statistics.fmean(recalls), 4),
            "context_precision_at_3": round(statistics.fmean(precisions), 4),
            "citation_accuracy": round(statistics.fmean(citation_hits), 4),
            "citation_coverage": round(statistics.fmean(citation_coverage), 4),
            "faithfulness": round(statistics.fmean(faithfulness), 4),
            "answer_relevance": round(statistics.fmean(answer_relevance), 4),
            "no_answer_accuracy": round(statistics.fmean(no_answer_hits), 4),
            "latency_p50_ms": round(statistics.median(latencies), 3),
            "latency_p95_ms": round(sorted_latency[p95_index], 3),
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "cost_microusd": 0,
        },
        "cases": case_results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run NexaRead's deterministic RAG baseline")
    parser.add_argument(
        "--dataset", type=Path, default=ROOT / "evaluation" / "rag_golden_dataset.json"
    )
    parser.add_argument("--output", type=Path, default=ROOT / "evaluation" / "rag_baseline.json")
    args = parser.parse_args()
    dataset = cast(Dataset, json.loads(args.dataset.read_text(encoding="utf-8")))
    report = asyncio.run(evaluate(dataset))
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report["metrics"], ensure_ascii=False))
    if report["passed"] != report["case_count"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

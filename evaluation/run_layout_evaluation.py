from __future__ import annotations

import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, TypedDict

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.document_layout.ai_repair import (  # noqa: E402
    LayoutRepairGroup,
    LayoutRepairProposal,
    LayoutRepairRequest,
)
from app.services.document_layout.pipeline import normalize_document_layout  # noqa: E402
from app.services.normalized_document import (  # noqa: E402
    BlockType,
    NormalizedDocument,
    ParsedBlock,
    ParsedPage,
    block_hash,
)


class EvaluationResult(TypedDict):
    id: str
    passed: bool
    checks: dict[str, bool]
    latency_ms: float


class EvaluationRepairProvider:
    provider_name = "evaluation-provider"
    model_name = "structure-only-fixture"

    def __init__(self, *, valid: bool, block_id: str) -> None:
        self.valid = valid
        self.block_id = block_id

    def repair_layout(self, request: LayoutRepairRequest) -> LayoutRepairProposal:
        proposed_id = self.block_id if self.valid else "unknown-block"
        return LayoutRepairProposal(
            ordered_block_ids=(proposed_id,),
            groups=(
                LayoutRepairGroup(
                    output_group_id="evaluation-group",
                    input_block_ids=(proposed_id,),
                    confidence=0.94,
                    reason="Fixture structure evidence.",
                    semantic_role="heading",
                    heading_level=2,
                ),
            ),
            confidence=0.94,
            reason="Fixture low-confidence structure.",
        )


def evaluate_case(case: dict[str, Any]) -> EvaluationResult:
    source = str(case["source_text"])
    block = ParsedBlock(
        sequence_number=1,
        block_type=BlockType.PARAGRAPH,
        text=source,
        page_number=1,
        chapter_index=None,
        section_index=None,
        paragraph_index=1,
        start_offset=0,
        end_offset=len(source),
        bounding_box=[72, 100, 500, 140],
        font_name="Noto Sans",
        font_size=11,
        is_bold=False,
        is_italic=False,
        confidence=0.98,
        metadata={},
        content_hash=block_hash(BlockType.PARAGRAPH, 1, source),
        parent_sequence_number=None,
        local_id=f"evaluation-{case['id']}",
    )
    page = ParsedPage(
        page_number=1,
        width=595,
        height=842,
        text=source,
        word_count=len(source.split()),
        blocks=[block],
    )
    document = NormalizedDocument(
        metadata={},
        page_count=1,
        outline=[],
        pages=[page],
    )
    started = time.perf_counter()
    normalized = normalize_document_layout(document, "pdf")
    output = normalized.blocks[0]
    checks = {
        "source_preserved": output.text == source,
        "display_text": (
            "expected_display_text" not in case
            or output.display_text == case["expected_display_text"]
        ),
        "language": (
            "expected_language" not in case
            or normalized.metadata["language"] == case["expected_language"]
        ),
        "role": (
            "expected_role" not in case
            or output.metadata["semantic_role"] == case["expected_role"]
        ),
        "heading_level": (
            "expected_heading_level" not in case
            or output.metadata["heading_level"] == case["expected_heading_level"]
        ),
        "indent_level": (
            "expected_indent_level" not in case
            or output.metadata["indent_level"] == case["expected_indent_level"]
        ),
        "review": (
            "expected_needs_review" not in case
            or output.needs_review is case["expected_needs_review"]
        ),
        "untrusted_not_executed": (
            not case.get("must_not_execute")
            or output.display_text == source
        ),
    }
    return {
        "id": case["id"],
        "passed": all(checks.values()),
        "checks": checks,
        "latency_ms": round((time.perf_counter() - started) * 1000, 3),
    }


def evaluate_ai_repair_case(case: dict[str, Any]) -> EvaluationResult:
    source = str(case["source_text"])
    block_id = f"evaluation-{case['id']}"
    block = ParsedBlock(
        sequence_number=1,
        block_type=BlockType.PARAGRAPH,
        text=source,
        page_number=1,
        chapter_index=None,
        section_index=None,
        paragraph_index=1,
        start_offset=0,
        end_offset=len(source),
        bounding_box=[72, 100, 500, 140],
        font_name="Noto Sans",
        font_size=11,
        is_bold=False,
        is_italic=False,
        confidence=0.45,
        metadata={},
        content_hash=block_hash(BlockType.PARAGRAPH, 1, source),
        parent_sequence_number=None,
        local_id=block_id,
        needs_review=True,
    )
    page = ParsedPage(
        page_number=1,
        width=595,
        height=842,
        text=source,
        word_count=len(source.split()),
        blocks=[block],
    )
    document = NormalizedDocument(
        metadata={},
        page_count=1,
        outline=[],
        pages=[page],
    )
    valid = case["mode"] == "valid"
    provider = EvaluationRepairProvider(valid=valid, block_id=block_id)
    started = time.perf_counter()
    normalized = normalize_document_layout(
        document,
        "pdf",
        ai_repair_enabled=True,
        repair_provider=provider,
    )
    deterministic = normalize_document_layout(document, "pdf")
    output = normalized.blocks[0]
    expected_status = "applied" if valid else "rejected"
    audit_json = json.dumps(
        normalized.metadata["layout_ai_repair_audits"],
        ensure_ascii=False,
    )
    checks = {
        "source_preserved": output.text == source,
        "anchor_preserved": output.source_anchor["parser_block_ids"] == [block_id],
        "block_preserved": len(normalized.blocks) == 1,
        "expected_status": (
            normalized.metadata["layout_ai_repair_status"] == expected_status
        ),
        "structure_or_fallback": (
            output.block_type == BlockType.HEADING_2
            if valid
            else normalized.pages == deterministic.pages
        ),
        "audit_omits_source": source not in audit_json,
    }
    return {
        "id": str(case["id"]),
        "passed": all(checks.values()),
        "checks": checks,
        "latency_ms": round((time.perf_counter() - started) * 1000, 3),
    }


def main() -> None:
    dataset_path = ROOT / "evaluation" / "layout_golden_dataset.json"
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    results = [evaluate_case(case) for case in dataset["cases"]]
    results.extend(
        evaluate_ai_repair_case(case) for case in dataset["ai_repair_cases"]
    )
    report = {
        "dataset_version": dataset["dataset_version"],
        "generated_at": datetime.now(UTC).isoformat(),
        "case_count": len(results),
        "passed": sum(bool(result["passed"]) for result in results),
        "source_fidelity_rate": round(
            sum(bool(result["checks"]["source_preserved"]) for result in results)
            / len(results),
            4,
        ),
        "cases": results,
    }
    output = ROOT / "evaluation" / "reports" / "layout-report.json"
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "passed": report["passed"],
                "case_count": report["case_count"],
                "source_fidelity_rate": report["source_fidelity_rate"],
            },
            ensure_ascii=False,
        )
    )
    raise SystemExit(0 if report["passed"] == report["case_count"] else 1)


if __name__ == "__main__":
    main()

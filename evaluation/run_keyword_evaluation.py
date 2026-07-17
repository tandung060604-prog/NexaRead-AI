from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import TypedDict, cast
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.keyword_detection import (  # noqa: E402
    BlockSpec,
    KeywordSpec,
    detect_keyword_candidates,
)


class KeywordRecord(TypedDict):
    number: int
    slug: str
    canonical_name: str
    aliases: list[str]
    required_any: list[str]


class CaseRecord(TypedDict):
    id: str
    group: str
    reader_level: str
    text: str
    expected_slugs: list[str]


def load_dataset(path: Path) -> tuple[str, list[KeywordRecord], list[CaseRecord]]:
    raw = cast(dict[str, object], json.loads(path.read_text(encoding="utf-8")))
    keywords: list[KeywordRecord] = []
    for item in cast(list[dict[str, object]], raw["keywords"]):
        keywords.append(
            {
                "number": int(cast(int, item["number"])),
                "slug": str(item["slug"]),
                "canonical_name": str(item["canonical_name"]),
                "aliases": [str(value) for value in cast(list[object], item.get("aliases", []))],
                "required_any": [
                    str(value) for value in cast(list[object], item.get("required_any", []))
                ],
            }
        )
    return str(raw["version"]), keywords, cast(list[CaseRecord], raw["cases"])


def evaluate(dataset_path: Path) -> dict[str, object]:
    version, keyword_records, cases = load_dataset(dataset_path)
    keyword_specs = [
        KeywordSpec(
            id=UUID(f"50000000-0000-0000-0000-{item['number']:012d}"),
            canonical_name=item["canonical_name"],
            aliases=tuple(item["aliases"]),
            ambiguity_required_any=tuple(item["required_any"]),
        )
        for item in keyword_records
    ]
    slug_by_id = {
        UUID(f"50000000-0000-0000-0000-{item['number']:012d}"): item["slug"]
        for item in keyword_records
    }
    true_positive = false_positive = false_negative = word_count = active_count = 0
    case_results: list[dict[str, object]] = []
    for index, case in enumerate(cases, start=1):
        block = BlockSpec(
            id=UUID(f"80000000-0000-0000-0000-{index:012d}"),
            text=case["text"],
            sequence_number=index,
            section_index=index,
        )
        matches = detect_keyword_candidates([block], keyword_specs)
        predicted = {slug_by_id[item.keyword_id] for item in matches if not item.is_suppressed}
        expected = set(case["expected_slugs"])
        tp = len(predicted & expected)
        fp = len(predicted - expected)
        fn = len(expected - predicted)
        true_positive += tp
        false_positive += fp
        false_negative += fn
        word_count += len(case["text"].split())
        active_count += len(predicted)
        case_results.append(
            {
                "id": case["id"],
                "group": case["group"],
                "expected": sorted(expected),
                "predicted": sorted(predicted),
                "passed": fp == 0 and fn == 0,
            }
        )
    predicted_total = true_positive + false_positive
    expected_total = true_positive + false_negative
    precision = true_positive / predicted_total if predicted_total else 1.0
    recall = true_positive / expected_total if expected_total else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    correction_rate = false_positive / predicted_total if predicted_total else 0.0
    metrics = {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "false_highlights_per_1000_words": round(false_positive / word_count * 1000, 4),
        "correction_rate": round(correction_rate, 4),
        "average_highlights_per_section": round(active_count / len(cases), 4),
    }
    gates = {
        "precision_at_least_0_90": precision >= 0.90,
        "recall_at_least_0_80": recall >= 0.80,
        "all_negative_cases_clean": all(
            result["passed"] for result in case_results if "negative" in str(result["group"])
        ),
    }
    return {
        "taxonomy_version": version,
        "generated_at": datetime.now(UTC).isoformat(),
        "dataset_cases": len(cases),
        "metrics": metrics,
        "gates": gates,
        "passed": all(gates.values()),
        "cases": case_results,
    }


if __name__ == "__main__":
    dataset = ROOT / "evaluation" / "keyword_detection_dataset.json"
    report = evaluate(dataset)
    output = ROOT / "evaluation" / "keyword_benchmark_report.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["metrics"], indent=2))
    raise SystemExit(0 if report["passed"] else 1)

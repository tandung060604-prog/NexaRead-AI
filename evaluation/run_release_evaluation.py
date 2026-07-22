from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "evaluation" / "reports"


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=ROOT, check=True)  # noqa: S603


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def git_commit() -> str:
    try:
        return subprocess.check_output(  # noqa: S603, S607
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the NexaRead release quality gate")
    parser.add_argument("--release", default="local")
    args = parser.parse_args()
    REPORTS.mkdir(parents=True, exist_ok=True)

    run(
        [
            sys.executable,
            "evaluation/run_rag_evaluation.py",
            "--output",
            "evaluation/reports/rag-report.json",
        ]
    )
    run([sys.executable, "evaluation/run_keyword_evaluation.py"])
    run([sys.executable, "evaluation/parser/run_parser_evaluation.py"])
    run([sys.executable, "evaluation/security/run_security_evaluation.py"])

    rag = read_json(REPORTS / "rag-report.json")
    keyword = read_json(ROOT / "evaluation" / "keyword_benchmark_report.json")
    parser_report = read_json(REPORTS / "parser-report.json")
    security = read_json(REPORTS / "security-report.json")
    rag_metrics = cast(dict[str, object], rag["metrics"])
    parser_metrics = cast(dict[str, object], parser_report["metrics"])
    gates = {
        "rag_cases": rag.get("passed") == rag.get("case_count"),
        "keyword": keyword.get("passed") is True,
        "parser_cases": parser_report.get("passed") == parser_report.get("case_count"),
        "security_cases": security.get("passed") == security.get("case_count"),
    }
    report = {
        "release": args.release,
        "commit": git_commit(),
        "dataset_versions": {
            "rag": rag.get("dataset_version"),
            "keywords": keyword.get("taxonomy_version"),
            "parser": parser_report.get("dataset_version"),
            "security": security.get("dataset_version"),
        },
        "model": "local-extractive-answer-v1",
        "embedding": rag.get("provider"),
        "parser": "nexaread-normalized-parser-v1",
        "metrics": {
            "rag": rag_metrics,
            "keywords": keyword.get("metrics"),
            "parser": parser_metrics,
            "security": security.get("metrics"),
            "product": "not_measured_without_staging_telemetry",
        },
        "latency": {
            "rag_p50_ms": rag_metrics.get("latency_p50_ms"),
            "rag_p95_ms": rag_metrics.get("latency_p95_ms"),
            "parser_p50_ms": parser_metrics.get("latency_p50_ms"),
            "parser_max_ms": parser_metrics.get("latency_max_ms"),
        },
        "cost": {
            "prompt_tokens": rag_metrics.get("prompt_tokens"),
            "completion_tokens": rag_metrics.get("completion_tokens"),
            "cost_microusd": rag_metrics.get("cost_microusd"),
        },
        "gates": gates,
        "passed": all(gates.values()),
        "known_limitations": [
            "OCR is not implemented for scanned PDFs.",
            "Complex document layout reconstruction remains heuristic.",
            "Product adoption metrics require staging or production telemetry.",
            "This report does not prove a production deployment occurred.",
        ],
        "timestamp": datetime.now(UTC).isoformat(),
    }
    output = REPORTS / "release-report.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": report["passed"], "gates": gates}, ensure_ascii=False))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()

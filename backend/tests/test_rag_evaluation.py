import json
import subprocess
import sys
from pathlib import Path


def test_golden_rag_dataset_runs_automatically(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[2]
    output = tmp_path / "rag-baseline.json"
    completed = subprocess.run(
        [
            sys.executable,
            str(root / "evaluation" / "run_rag_evaluation.py"),
            "--output",
            str(output),
        ],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )

    assert completed.returncode == 0, completed.stdout + completed.stderr
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["passed"] == report["case_count"]
    assert report["metrics"]["retrieval_recall_at_3"] >= 0.8
    assert report["metrics"]["no_answer_accuracy"] >= 0.8

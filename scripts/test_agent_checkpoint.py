"""Tests for the standard-library agent checkpoint utility."""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import agent_checkpoint


class AgentCheckpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        paths = agent_checkpoint.ensure_files(self.root)
        paths["checkpoint"].write_text("# Last Checkpoint\n", encoding="utf-8")
        paths["handoff"].write_text("# Current Handoff\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def run_command(self, *arguments: str) -> int:
        return agent_checkpoint.main(["--root", str(self.root), *arguments])

    def read_state(self) -> dict[str, object]:
        return json.loads(
            (self.root / ".agent" / "TASK_STATE.json").read_text(encoding="utf-8")
        )

    def test_full_checkpoint_lifecycle_preserves_logs(self) -> None:
        self.assertEqual(
            self.run_command(
                "start",
                "--phase",
                "PHASE_0",
                "--task-id",
                "NR-000",
                "--objective",
                "Create checkpoint infrastructure",
                "--branch",
                "main",
                "--commit",
                "abc123",
            ),
            0,
        )
        worklog = self.root / "docs" / "agent" / "WORKLOG.md"
        start_log = worklog.read_text(encoding="utf-8")

        self.assertEqual(
            self.run_command(
                "progress",
                "--objective",
                "Audit routes",
                "--changed-file",
                "docs/agent/BASELINE_REPORT.md",
                "--next-step",
                "Run checks",
                "--next-command",
                "npm run lint",
            ),
            0,
        )
        self.assertTrue(worklog.read_text(encoding="utf-8").startswith(start_log))

        self.assertEqual(
            self.run_command(
                "test",
                "--command",
                "npm run lint",
                "--working-directory",
                "frontend",
                "--exit-code",
                "0",
                "--passed-count",
                "1",
                "--failed-count",
                "0",
                "--summary",
                "ESLint passed",
            ),
            0,
        )
        self.assertEqual(
            self.run_command(
                "handoff",
                "--objective",
                "Resume Phase 0",
                "--migration-state",
                "Head is 20260722_0006",
                "--do-not-change",
                "Citation anchors",
            ),
            0,
        )
        self.assertEqual(self.run_command("validate"), 0)
        self.assertEqual(
            self.run_command(
                "complete",
                "--objective",
                "Complete NR-000",
                "--next-step",
                "Review Phase 1 scope",
            ),
            0,
        )

        state = self.read_state()
        self.assertEqual(state["status"], "complete")
        self.assertIn("NR-000", state["completed_tasks"])
        self.assertNotIn("NR-000", state["in_progress_tasks"])
        self.assertTrue(str(state["last_updated"]).endswith("+07:00"))
        self.assertIn(
            "docs/agent/BASELINE_REPORT.md",
            state["changed_files"],
        )

        test_log = (self.root / "docs" / "agent" / "TEST_LOG.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("- Exit code: `0`", test_log)
        self.assertIn("- Passed count: 1", test_log)
        self.assertIn("- Failed count: 0", test_log)

        handoff = (self.root / "docs" / "agent" / "HANDOFF.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("## Exact next three steps", handoff)
        self.assertIn("## Do not change", handoff)

    def test_validate_rejects_wrong_timezone(self) -> None:
        state_path = self.root / ".agent" / "TASK_STATE.json"
        state = self.read_state()
        state["last_updated"] = "2026-07-23T00:00:00+00:00"
        state_path.write_text(json.dumps(state), encoding="utf-8")

        self.assertEqual(self.run_command("validate"), 1)

    def test_validate_output_is_safe_for_non_ascii_repository_paths(self) -> None:
        unicode_root = self.root / "Thực Chiến"
        paths = agent_checkpoint.ensure_files(unicode_root)
        paths["checkpoint"].write_text("# Last Checkpoint\n", encoding="utf-8")
        paths["handoff"].write_text("# Current Handoff\n", encoding="utf-8")
        output = io.StringIO()

        with redirect_stdout(output):
            exit_code = agent_checkpoint.main(
                ["--root", str(unicode_root), "validate"]
            )

        self.assertEqual(exit_code, 0)
        self.assertEqual(
            output.getvalue(),
            "Checkpoint state is valid: .agent/TASK_STATE.json\n",
        )

if __name__ == "__main__":
    unittest.main()

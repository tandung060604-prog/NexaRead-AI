"""Maintain NexaRead's machine-readable checkpoint and append-only agent logs."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Sequence

PROJECT_NAME = "NexaRead AI Product Upgrade"
VIETNAM_TIMEZONE = timezone(timedelta(hours=7))
REQUIRED_STATE_KEYS = {
    "project",
    "current_phase",
    "current_task_id",
    "status",
    "branch",
    "last_commit",
    "last_updated",
    "completed_tasks",
    "in_progress_tasks",
    "blocked_tasks",
    "changed_files",
    "last_commands",
    "last_test_results",
    "known_failures",
    "assumptions",
    "next_exact_steps",
    "next_recommended_command",
    "safe_to_handoff",
}
LIST_STATE_KEYS = {
    "completed_tasks",
    "in_progress_tasks",
    "blocked_tasks",
    "changed_files",
    "last_commands",
    "last_test_results",
    "known_failures",
    "assumptions",
    "next_exact_steps",
}


class CheckpointError(RuntimeError):
    """Raised when checkpoint data is invalid or incomplete."""


def now_iso() -> str:
    return datetime.now(VIETNAM_TIMEZONE).isoformat(timespec="seconds")


def default_state() -> dict[str, Any]:
    return {
        "project": PROJECT_NAME,
        "current_phase": "PHASE_0",
        "current_task_id": "NR-000",
        "status": "in_progress",
        "branch": "",
        "last_commit": "",
        "last_updated": now_iso(),
        "completed_tasks": [],
        "in_progress_tasks": ["NR-000"],
        "blocked_tasks": [],
        "changed_files": [],
        "last_commands": [],
        "last_test_results": [],
        "known_failures": [],
        "assumptions": [],
        "next_exact_steps": [],
        "next_recommended_command": "",
        "safe_to_handoff": True,
    }


def paths_for(root: Path) -> dict[str, Path]:
    return {
        "state": root / ".agent" / "TASK_STATE.json",
        "checkpoint": root / ".agent" / "LAST_CHECKPOINT.md",
        "worklog": root / "docs" / "agent" / "WORKLOG.md",
        "handoff": root / "docs" / "agent" / "HANDOFF.md",
        "test_log": root / "docs" / "agent" / "TEST_LOG.md",
    }


def ensure_files(root: Path) -> dict[str, Path]:
    paths = paths_for(root)
    paths["state"].parent.mkdir(parents=True, exist_ok=True)
    paths["worklog"].parent.mkdir(parents=True, exist_ok=True)
    if not paths["state"].exists():
        write_state(paths["state"], default_state())
    if not paths["worklog"].exists():
        paths["worklog"].write_text(
            "# Agent Worklog\n\nThis file is append-only.\n\n", encoding="utf-8"
        )
    if not paths["test_log"].exists():
        paths["test_log"].write_text(
            "# Agent Test Log\n\nThis file is append-only.\n\n", encoding="utf-8"
        )
    return paths


def read_state(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CheckpointError(f"Cannot read valid JSON from {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise CheckpointError("TASK_STATE.json must contain a JSON object")
    validate_state(value)
    return value


def validate_state(state: dict[str, Any]) -> None:
    missing = sorted(REQUIRED_STATE_KEYS.difference(state))
    if missing:
        raise CheckpointError(f"TASK_STATE.json is missing keys: {', '.join(missing)}")
    for key in LIST_STATE_KEYS:
        if not isinstance(state[key], list):
            raise CheckpointError(f"TASK_STATE.json field {key!r} must be a list")
    if not isinstance(state["safe_to_handoff"], bool):
        raise CheckpointError("TASK_STATE.json field 'safe_to_handoff' must be boolean")
    if state["project"] != PROJECT_NAME:
        raise CheckpointError(f"TASK_STATE.json project must be {PROJECT_NAME!r}")
    try:
        timestamp = datetime.fromisoformat(str(state["last_updated"]))
    except ValueError as exc:
        raise CheckpointError("last_updated must be an ISO-8601 timestamp") from exc
    if timestamp.utcoffset() != timedelta(hours=7):
        raise CheckpointError("last_updated must use the +07:00 timezone")


def write_state(path: Path, state: dict[str, Any]) -> None:
    validate_state(state)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def add_unique(items: list[Any], values: Sequence[Any]) -> None:
    for value in values:
        if value not in items:
            items.append(value)


def replace_if_provided(state: dict[str, Any], key: str, values: Sequence[str]) -> None:
    if values:
        state[key] = list(values)


def append_markdown(path: Path, content: str) -> None:
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(content.rstrip() + "\n\n")


def bullets(values: Sequence[Any], empty: str = "None recorded.") -> str:
    if not values:
        return f"- {empty}"
    return "\n".join(f"- {value}" for value in values)


def record_worklog(
    path: Path,
    state: dict[str, Any],
    args: argparse.Namespace,
    event: str,
) -> None:
    test_status = getattr(args, "test_status", None)
    content = f"""## {now_iso()} — {state["current_task_id"]} — {event}

- Agent/model: {args.agent}
- Objective: {args.objective or event}
- Files read:
{bullets(args.read_file)}
- Files changed:
{bullets(args.changed_file)}
- Technical decisions:
{bullets(args.decision)}
- Commands run:
{bullets(args.ran_command)}
- Command results:
{bullets(args.result)}
- Test status: {test_status or "Not run for this entry"}
- New failures or risks:
{bullets(args.risk)}
- Next work:
{bullets(args.next_step)}
"""
    append_markdown(path, content)


def record_test(path: Path, state: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    status = "PASS" if args.exit_code == 0 else "FAIL"
    result = {
        "timestamp": now_iso(),
        "task_id": state["current_task_id"],
        "working_directory": args.working_directory,
        "command": args.command,
        "exit_code": args.exit_code,
        "status": status,
        "passed_count": args.passed_count,
        "failed_count": args.failed_count,
        "summary": args.summary,
        "errors": list(args.error),
    }
    content = f"""## {result["timestamp"]} — {state["current_task_id"]}

- Working directory: `{args.working_directory}`
- Command: `{args.command}`
- Exit code: `{args.exit_code}`
- Result: **{status}**
- Passed count: {args.passed_count if args.passed_count is not None else "Not reported"}
- Failed count: {args.failed_count if args.failed_count is not None else "Not reported"}
- Summary: {args.summary or "No summary provided"}
- Important errors:
{bullets(args.error)}
- Related task: `{state["current_task_id"]}`
"""
    append_markdown(path, content)
    return result


def checkpoint_text(state: dict[str, Any]) -> str:
    return f"""# Last Checkpoint

- Phase: `{state["current_phase"]}`
- Task: `{state["current_task_id"]}`
- Status: `{state["status"]}`
- Branch: `{state["branch"]}`
- Commit: `{state["last_commit"]}`
- Updated: `{state["last_updated"]}`
- Safe to handoff: `{str(state["safe_to_handoff"]).lower()}`

## Changed files

{bullets(state["changed_files"])}

## Known failures

{bullets(state["known_failures"])}

## Next exact steps

{bullets(state["next_exact_steps"])}

## Next command

`{state["next_recommended_command"] or "Not set"}`
"""


def handoff_text(state: dict[str, Any], args: argparse.Namespace) -> str:
    completed = [*state["completed_tasks"], *args.completed]
    current_files = args.current_file or state["changed_files"]
    checks = [
        f'{item.get("status", "UNKNOWN")}: {item.get("command", "unknown command")}'
        for item in state["last_test_results"]
        if isinstance(item, dict)
    ]
    return f"""# Current Handoff

## Current objective

{args.objective or f'Continue {state["current_task_id"]}.'}

## Current phase and task

`{state["current_phase"]}` / `{state["current_task_id"]}` (`{state["status"]}`)

## What is already completed

{bullets(completed)}

## What is partially completed

{bullets(args.partially_completed)}

## Files currently being modified

{bullets(current_files)}

## Database migration state

{args.migration_state or "Not recorded."}

## Commands already run

{bullets(state["last_commands"])}

## Last passing checks

{bullets(checks)}

## Current failures

{bullets(state["known_failures"])}

## Important architecture decisions

{bullets(args.architecture_decision)}

## Exact next three steps

{bullets(state["next_exact_steps"][:3])}

## Exact next command

`{state["next_recommended_command"] or "Not set"}`

## Do not change

{bullets(args.do_not_change)}

## Risks and assumptions

{bullets([*state["assumptions"], *args.risk])}
"""


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--agent", default="Codex (GPT-5)")
    parser.add_argument("--objective", default="")
    parser.add_argument("--read-file", action="append", default=[])
    parser.add_argument("--changed-file", action="append", default=[])
    parser.add_argument("--decision", action="append", default=[])
    parser.add_argument("--ran-command", action="append", default=[])
    parser.add_argument("--result", action="append", default=[])
    parser.add_argument("--risk", action="append", default=[])
    parser.add_argument("--next-step", action="append", default=[])
    parser.add_argument("--assumption", action="append", default=[])
    parser.add_argument("--next-command", default="")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root; primarily useful for isolated tests.",
    )
    common = argparse.ArgumentParser(add_help=False)
    add_common_arguments(common)
    subparsers = parser.add_subparsers(dest="command_name", required=True)

    start = subparsers.add_parser("start", parents=[common])
    start.add_argument("--phase", required=True)
    start.add_argument("--task-id", required=True)
    start.add_argument("--branch", default="")
    start.add_argument("--commit", default="")

    subparsers.add_parser("progress", parents=[common])

    test = subparsers.add_parser("test", parents=[common])
    test.add_argument("--command", required=True)
    test.add_argument("--working-directory", required=True)
    test.add_argument("--exit-code", required=True, type=int)
    test.add_argument("--passed-count", type=int)
    test.add_argument("--failed-count", type=int)
    test.add_argument("--summary", default="")
    test.add_argument("--error", action="append", default=[])

    blocked = subparsers.add_parser("blocked", parents=[common])
    blocked.add_argument("--reason", required=True)

    handoff = subparsers.add_parser("handoff", parents=[common])
    handoff.add_argument("--completed", action="append", default=[])
    handoff.add_argument("--partially-completed", action="append", default=[])
    handoff.add_argument("--current-file", action="append", default=[])
    handoff.add_argument("--migration-state", default="")
    handoff.add_argument("--architecture-decision", action="append", default=[])
    handoff.add_argument("--do-not-change", action="append", default=[])

    subparsers.add_parser("complete", parents=[common])
    subparsers.add_parser("validate")
    return parser


def apply_common_state(state: dict[str, Any], args: argparse.Namespace) -> None:
    add_unique(state["changed_files"], args.changed_file)
    add_unique(state["last_commands"], args.ran_command)
    add_unique(state["known_failures"], args.risk)
    add_unique(state["assumptions"], args.assumption)
    replace_if_provided(state, "next_exact_steps", args.next_step)
    if args.next_command:
        state["next_recommended_command"] = args.next_command
    state["last_updated"] = now_iso()


def run(args: argparse.Namespace) -> int:
    root = args.root.resolve()
    paths = ensure_files(root)
    state = read_state(paths["state"])

    if args.command_name == "validate":
        for name in ("checkpoint", "worklog", "handoff", "test_log"):
            if not paths[name].exists():
                raise CheckpointError(f"Required checkpoint file is missing: {paths[name]}")
        state_path = paths["state"].relative_to(root)
        print(f"Checkpoint state is valid: {state_path.as_posix()}")
        return 0

    apply_common_state(state, args)

    if args.command_name == "start":
        state["current_phase"] = args.phase
        state["current_task_id"] = args.task_id
        state["status"] = "in_progress"
        state["safe_to_handoff"] = True
        state["branch"] = args.branch
        state["last_commit"] = args.commit
        add_unique(state["in_progress_tasks"], [args.task_id])
        state["blocked_tasks"] = [
            task for task in state["blocked_tasks"] if task != args.task_id
        ]
        record_worklog(paths["worklog"], state, args, "START")

    elif args.command_name == "progress":
        state["status"] = "in_progress"
        state["safe_to_handoff"] = True
        record_worklog(paths["worklog"], state, args, "PROGRESS")

    elif args.command_name == "test":
        result = record_test(paths["test_log"], state, args)
        state["last_test_results"].append(result)
        state["last_commands"].append(args.command)
        args.ran_command.append(args.command)
        args.result.append(f'{result["status"]} (exit {args.exit_code}): {args.summary}')
        args.test_status = result["status"]
        if args.exit_code != 0:
            failure = f'{args.command} failed with exit code {args.exit_code}'
            add_unique(state["known_failures"], [failure, *args.error])
        record_worklog(paths["worklog"], state, args, "TEST")

    elif args.command_name == "blocked":
        state["status"] = "blocked"
        state["safe_to_handoff"] = True
        add_unique(state["blocked_tasks"], [state["current_task_id"]])
        add_unique(state["known_failures"], [args.reason])
        args.risk.append(args.reason)
        record_worklog(paths["worklog"], state, args, "BLOCKED")

    elif args.command_name == "handoff":
        state["safe_to_handoff"] = True
        paths["handoff"].write_text(handoff_text(state, args), encoding="utf-8")
        record_worklog(paths["worklog"], state, args, "HANDOFF")

    elif args.command_name == "complete":
        task_id = state["current_task_id"]
        state["status"] = "complete"
        state["safe_to_handoff"] = True
        add_unique(state["completed_tasks"], [task_id])
        state["in_progress_tasks"] = [
            task for task in state["in_progress_tasks"] if task != task_id
        ]
        state["blocked_tasks"] = [
            task for task in state["blocked_tasks"] if task != task_id
        ]
        record_worklog(paths["worklog"], state, args, "COMPLETE")

    write_state(paths["state"], state)
    paths["checkpoint"].write_text(checkpoint_text(state), encoding="utf-8")
    print(
        f'Checkpoint updated: {state["current_phase"]}/{state["current_task_id"]} '
        f'({state["status"]})'
    )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return run(args)
    except CheckpointError as exc:
        print(f"Checkpoint error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

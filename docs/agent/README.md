# Agent Checkpoint Guide

The checkpoint files let another coding agent resume the current task without rescanning the repository.

## Required takeover order

1. Read `AGENTS.md`.
2. Read `.agent/TASK_STATE.json`.
3. Read `.agent/LAST_CHECKPOINT.md`.
4. Read `docs/agent/HANDOFF.md`.
5. Read the end of `docs/agent/WORKLOG.md`.
6. Run `git status`.
7. Run `git diff --stat`.
8. Inspect the current migration head.
9. Run `next_recommended_command` from `TASK_STATE.json`.
10. Continue the current task.

## Commands

Run commands from the repository root. The script uses only the Python standard library and writes timestamps with a fixed `+07:00` offset.

```text
python scripts/agent_checkpoint.py start --phase PHASE_0 --task-id NR-000 --objective "Establish the product-upgrade baseline"
python scripts/agent_checkpoint.py progress --objective "Inventory routes and migrations" --changed-file docs/agent/BASELINE_REPORT.md --next-step "Run baseline checks"
python scripts/agent_checkpoint.py test --command "npm run lint" --working-directory frontend --exit-code 0 --passed-count 1 --failed-count 0 --summary "ESLint passed"
python scripts/agent_checkpoint.py blocked --reason "Database service is unavailable" --next-step "Start PostgreSQL"
python scripts/agent_checkpoint.py handoff --migration-state "Head is 20260722_0006" --do-not-change "Citation source anchors"
python scripts/agent_checkpoint.py complete --objective "Complete NR-000" --next-step "Review Phase 1 scope"
python scripts/agent_checkpoint.py validate
```

Most metadata flags are repeatable:

```text
--read-file PATH
--changed-file PATH
--decision TEXT
--ran-command COMMAND
--result TEXT
--risk TEXT
--next-step TEXT
--assumption TEXT
```

`test` additionally accepts `--passed-count`, `--failed-count`, and repeated `--error` values. Use the real exit code and exact working directory. Do not record a check as passing if it was skipped or could not run.

`handoff` regenerates `.agent/LAST_CHECKPOINT.md` and `docs/agent/HANDOFF.md` from the machine-readable state. `WORKLOG.md` and `TEST_LOG.md` are append-only; the script never truncates them.

For isolated verification, tests can redirect all outputs:

```text
python scripts/agent_checkpoint.py --root C:\temporary\checkpoint-test validate
```

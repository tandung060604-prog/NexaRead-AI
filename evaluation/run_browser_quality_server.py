"""Launch the disposable Phase 8 browser fixture API."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn


def main() -> None:
    repository_root = Path(__file__).resolve().parents[1]
    backend_root = repository_root / "backend"
    sys.path.insert(0, str(backend_root))
    sys.path.insert(0, str(repository_root))
    os.environ.setdefault("FRONTEND_URL", "http://127.0.0.1:3000")
    os.environ.setdefault("AUTH_RATE_LIMIT_PER_MINUTE", "0")
    if not os.environ.get("BROWSER_QUALITY_PASSWORD"):
        raise RuntimeError(
            "Set BROWSER_QUALITY_PASSWORD before starting the browser fixture"
        )
    uvicorn.run(
        "evaluation.browser_quality_server:app",
        host="127.0.0.1",
        port=8000,
    )


if __name__ == "__main__":
    main()

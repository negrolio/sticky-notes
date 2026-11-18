"""Shared helpers for the hooks. Standard library only."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

TEST_SUFFIXES = (".test.ts", ".test.tsx")


def read_event() -> dict:
    """The hook input is one JSON object on stdin."""
    try:
        return json.load(sys.stdin)
    except json.JSONDecodeError:
        return {}


def project_dir() -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()).resolve()


def bin_(name: str) -> str:
    return str(project_dir() / "node_modules" / ".bin" / name)


def run(cmd: list[str]) -> tuple[int, str]:
    proc = subprocess.run(cmd, cwd=project_dir(), capture_output=True, text=True, check=False)
    return proc.returncode, proc.stdout + proc.stderr


def git_files(*args: str) -> list[str]:
    _, out = run(["git", *args])
    return [line for line in out.splitlines() if line.endswith(TEST_SUFFIXES)]


def tracked_tests() -> list[str]:
    return git_files("ls-files", "--", "src")


def untracked_tests() -> list[str]:
    return git_files("ls-files", "--others", "--exclude-standard", "--", "src")


def tail(text: str, lines: int = 20) -> str:
    return "\n".join(text.rstrip().splitlines()[-lines:])


def refuse(message: str) -> None:
    """Exit 2 is the code the harness treats as a refusal; stderr goes to the agent."""
    sys.stderr.write(message.rstrip() + "\n")
    sys.exit(2)

"""PreToolUse. Refuse any edit to a test file that git tracks.

An untracked test file is the agent's own until it is committed. Once
committed it is part of the suite and read-only: a suite the agent can
edit proves nothing.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

from _common import TEST_SUFFIXES, project_dir, read_event, refuse

event = read_event()
tool_name = event.get("tool_name", "")
tool_input = event.get("tool_input", {})
root = project_dir()


def is_tracked_test(path_str: str) -> bool:
    if not path_str.endswith(TEST_SUFFIXES):
        return False
    path = Path(path_str) if Path(path_str).is_absolute() else root / path_str
    proc = subprocess.run(
        ["git", "ls-files", "--error-unmatch", str(path.resolve())],
        cwd=root, capture_output=True, check=False,
    )
    return proc.returncode == 0


if tool_name in {"Edit", "Write", "MultiEdit", "NotebookEdit"}:
    target = tool_input.get("file_path") or ""
    if is_tracked_test(target):
        refuse(f"Refused: {target} is a committed test file and is read-only. Add new tests in a new *.test.ts(x) file.")
    sys.exit(0)

if tool_name == "Bash":
    command = tool_input.get("command", "")
    # A heuristic, not a fence: a shell write that names a committed test file.
    if re.search(r"(?<![0-9&])>{1,2}(?!&)|\bsed\s+-i|\brm\b|\bmv\b|\bcp\b|\btee\b|\btruncate\b|git\s+(checkout|restore)\b", command):
        for name in re.findall(r"[\w./-]+\.test\.tsx?", command):
            if is_tracked_test(name):
                refuse(f"Refused: this shell command looks like it writes {name}. Committed tests are read-only.")
    sys.exit(0)

sys.exit(0)

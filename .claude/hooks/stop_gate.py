"""Stop. Refuse to end the turn while any check is red.

Typecheck runs on the app and build config only, and lint skips untracked test
files: a new test file is the agent's own and may stay red (even unresolved
imports) until the code exists. Vitest runs only the committed test files.
Once a test file is committed, every check enforces it.

Gives up after five refusals in a row so a stuck agent can hand back.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from _common import bin_, read_event, refuse, run, tail, tracked_tests, untracked_tests

MAX_REFUSALS = 5

event = read_event()
counter = Path(tempfile.gettempdir()) / f"sticky-stop-gate-{event.get('session_id', 'default')}.count"
refusals = int(counter.read_text()) if counter.exists() else 0

ignore = [arg for f in untracked_tests() for arg in ("--ignore-pattern", f)]
checks = {
    "typecheck": [bin_("tsc"), "-b", "tsconfig.app.json", "tsconfig.node.json"],
    "lint": [bin_("eslint"), "--max-warnings", "0", *ignore, "."],
}
tests = tracked_tests()
if tests:
    checks["test"] = [bin_("vitest"), "run", *tests]

failures = []
for name, cmd in checks.items():
    code, output = run(cmd)
    if code != 0:
        failures.append(f"[{name}]\n{tail(output)}")

if not failures:
    counter.unlink(missing_ok=True)
    sys.exit(0)

refusals += 1
counter.write_text(str(refusals))
if refusals > MAX_REFUSALS:
    sys.stderr.write(f"stop gate: still red after {MAX_REFUSALS} refusals, handing back.\n")
    sys.exit(0)

refuse(f"Not done: {len(failures)} check(s) red (refusal {refusals} of {MAX_REFUSALS}).\n" + "\n\n".join(failures))

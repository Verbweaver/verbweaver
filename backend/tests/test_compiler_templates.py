"""Compiler template system: every documented feature, exported to every format (issue #123).

The cases, fixture and checks are shared with the Playwright stress script; see compiler_harness.py.
Checks for features with an open bug are listed in KNOWN_FAILURES with their issue number: the check
is skipped in the per-case test, and test_known_failures_still_fail fails once the bug is fixed, so
the entry gets removed.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple

import pytest

from compiler_harness import (
    CASES, FORMATS, KNOWN_FAILURES, compile_case, formats_available, make_project, output_text, run_checks,
)


# ---------------------------------------------------------------------------------------------
# pytest
# ---------------------------------------------------------------------------------------------



@pytest.fixture(scope="module")
def project(tmp_path_factory) -> Path:
    return make_project(tmp_path_factory.mktemp("stress") / "project")


@pytest.fixture(scope="module")
def outputs(project, tmp_path_factory) -> Dict[Tuple[str, str], Tuple[int, str]]:
    """Compile every case in every available format once; tests then look up results."""
    cache: Dict[Tuple[str, str], Tuple[int, str]] = {}
    work = tmp_path_factory.mktemp("out")
    for case in CASES["cases"]:
        for fmt in formats_available():
            status, data = compile_case(project, case, fmt, CASES["defaultNodes"])
            text = output_text(fmt, data, work) if status == 200 else data.decode("utf-8", "replace")
            cache[(case["id"], fmt)] = (status, text)
    return cache


def _params():
    for case in CASES["cases"]:
        for fmt in FORMATS:
            yield pytest.param(case, fmt, id=f"{case['id']}-{fmt}")


@pytest.mark.parametrize("case,fmt", list(_params()))
def test_template_case(case, fmt, outputs, request):
    if fmt not in formats_available():
        pytest.skip(f"{fmt} needs pandoc" + (", a PDF engine and pdftotext" if fmt == "pdf" else ""))
    status, text = outputs[(case["id"], fmt)]
    known = {chk: issue for (cid, chk), issue in KNOWN_FAILURES.items() if cid == case["id"]}
    if case.get("expectStatus"):
        assert status == case["expectStatus"], f"expected HTTP {case['expectStatus']}, got {status}: {text[:300]}"
        assert case.get("expectError", "") in text, f"error message lacks {case.get('expectError')!r}: {text[:300]}"
        return
    if status != 200:
        if "compile" in known:
            pytest.xfail(f"{known['compile']}: compile fails ({status})")
        pytest.fail(f"compile returned {status}: {text[:500]}")
    failures = []
    unexpected_passes = []
    for check, ok, detail in run_checks(case, fmt, text):
        if check in known:
            if ok:
                unexpected_passes.append(f"{check} now passes; remove it from KNOWN_FAILURES ({known[check]})")
            continue
        if not ok:
            failures.append(f"{check}: {detail}")
    assert not unexpected_passes, "\n".join(unexpected_passes)
    assert not failures, "\n".join(failures) + f"\n--- output ---\n{text[:3000]}"


@pytest.mark.parametrize("case,check,issue", [
    pytest.param(cid, chk, issue, id=f"{cid}-{chk}") for (cid, chk), issue in KNOWN_FAILURES.items()
])
def test_known_failures_still_fail_in_markdown(case, check, issue, outputs):
    """Each KNOWN_FAILURES entry is a real, still-open bug (checked on Markdown output)."""
    status, text = outputs[(case, "markdown")]
    if check == "compile":
        assert status != 200, f"{issue} looks fixed: compile now succeeds"
        return
    spec = next(c for c in CASES["cases"] if c["id"] == case)
    results = {c: ok for c, ok, _ in run_checks(spec, "markdown", text)}
    assert check in results, f"unknown check {check}"
    assert not results[check], f"{issue} looks fixed: '{check}' passes now"



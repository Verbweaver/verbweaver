"""Shared harness for the Compiler template tests (issue #123); no pytest needed.

Compiler template system: every documented feature, exported to every format.

The cases live in <repo>/tests/compiler/cases.json and the fixture project in tests/compiler/fixture;
the Playwright stress script and specs use the same files. Each case is compiled through the real
POST /compiler/{project_id}/compile endpoint (with the project lookup stubbed), converted with real
Pandoc, turned into plain text, and checked.

Checks for features with an open bug are listed under "known" in cases.json, with the issue number.

Run `python tests/compiler_harness.py` from backend/ to print a case x format matrix, or
`python tests/compiler_harness.py --check-dir DIR` to check outputs saved by the stress script.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.api.v1.endpoints import compiler as compiler_ep  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.database import get_db  # noqa: E402

REPO = BACKEND.parent
CASES_FILE = REPO / "tests" / "compiler" / "cases.json"
FIXTURE = REPO / "tests" / "compiler" / "fixture"
SHIPPED_TEMPLATES = REPO / "assets" / "templates" / "compiler"
FORMATS = ["markdown", "html", "pdf", "docx", "odt", "epub"]


HAS_PANDOC = shutil.which("pandoc") is not None
HAS_PDF_ENGINE = any(shutil.which(t) for t in ("tectonic", "xelatex", "pdflatex"))
HAS_PDFTOTEXT = shutil.which("pdftotext") is not None


def load_cases() -> Dict[str, Any]:
    return json.loads(CASES_FILE.read_text(encoding="utf-8"))


CASES = load_cases()

# (case id, check) -> issue, from each case's "known" map in cases.json. A check is
# "expect:<text>", "absent:<text>", "regex:<pattern>", "count:<text>", or "compile".
KNOWN_FAILURES: Dict[Tuple[str, str], str] = {
    (c["id"], check): issue for c in CASES["cases"] for check, issue in (c.get("known") or {}).items()
}


# ---------------------------------------------------------------------------------------------
# Project and request setup
# ---------------------------------------------------------------------------------------------

def make_project(dest: Path) -> Path:
    """Copy the fixture project and install templates the way the desktop app seeds them:
    the shipped defaults per format, plus every fixture template in every format folder."""
    shutil.copytree(FIXTURE, dest)
    compiler_dir = dest / "templates" / "compiler"
    case_templates = compiler_dir / "markdown"
    staged = dest / ".case-templates"
    shutil.move(str(case_templates), str(staged))
    shutil.copytree(SHIPPED_TEMPLATES, compiler_dir, dirs_exist_ok=True)
    for fmt in FORMATS:
        target = compiler_dir / fmt
        target.mkdir(parents=True, exist_ok=True)
        for f in staged.iterdir():
            shutil.copy(f, target / f.name)
    shutil.rmtree(staged)
    return dest


def template_schema(project: Path, fmt: str, template: str) -> Dict[str, Any]:
    from app.services.template_service import TemplateService

    svc = TemplateService(str(project))
    rel = f"{fmt}/{template}"
    content = svc.process_includes_only(svc.get_template_content(rel) or "", rel)
    _ok, _custom, schema, _errors = svc.validate_template(content)
    return schema or {}


def ui_document_variables(schema: Dict[str, Any], overrides: Dict[str, Any]) -> Dict[str, Any]:
    """What the Compiler page sends as custom_variables: schema defaults (as the page initialises
    them when a template is chosen), overridden by what the user entered, minus empty values."""
    values: Dict[str, Any] = {}
    for name, d in (schema.get("variables") or {}).items():
        d = d or {}
        if d.get("compute"):
            continue  # computed by the compiler; the page doesn't send a value (#132)
        t = d.get("type")
        if t == "table":
            dflt = d.get("default") if isinstance(d.get("default"), dict) else {}
            values[name] = {
                "columns": list(d.get("columnsDefault") or ["Task"]),
                "types": dict(d.get("columnTypes") or {}),
                "rows": list(dflt.get("rows") or []),
            }
        elif t == "array":
            values[name] = list(d["default"]) if isinstance(d.get("default"), list) else []
        elif t == "number":
            values[name] = d["default"] if isinstance(d.get("default"), (int, float)) else ""
        elif t == "boolean":
            values[name] = d["default"] if isinstance(d.get("default"), bool) else False
        else:
            values[name] = d.get("default", "")
    values.update(overrides or {})
    return {k: v for k, v in values.items() if v is not None and v != ""}


def compile_case(project: Path, case: Dict[str, Any], fmt: str, nodes: List[str]) -> Tuple[int, bytes]:
    app = FastAPI()
    app.include_router(compiler_ep.router, prefix="/api/v1/compiler")

    project_row = SimpleNamespace(id="stress", name="Stress", git_config={"path": str(project)})

    class _Result:
        def scalar_one_or_none(self):
            return project_row

    class _Session:
        async def execute(self, *_a, **_k):
            return _Result()

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[get_db] = lambda: _Session()

    template = case.get("template")
    schema = template_schema(project, fmt, template) if template else {}
    settings_file = project / "verbweaver-settings.yaml"
    if case.get("projectDefault"):
        default = f"{fmt}/{case['projectDefault']}"
        settings_file.write_text(yaml.safe_dump({"compiler": {"defaultTemplates": {fmt: default}}}), encoding="utf-8")
        schema = template_schema(project, fmt, case["projectDefault"])
    elif settings_file.exists():
        settings_file.unlink()
    body = {
        "nodes": case.get("nodes") or nodes,
        "format": fmt,
        "template": f"{fmt}/{template}" if template else None,
        "custom_variables": ui_document_variables(schema, case.get("vars") or {}) or None,
        "node_variables": case.get("nodeVars") or None,
        "options": {"format": fmt, "includeMetadata": True, "includeToc": False,
                    "embedUploadedFiles": True, **(case.get("options") or {})},
    }
    resp = TestClient(app).post("/api/v1/compiler/stress/compile", json=body)
    return resp.status_code, resp.content


# ---------------------------------------------------------------------------------------------
# Output to text
# ---------------------------------------------------------------------------------------------

def output_text(fmt: str, data: bytes, workdir: Path) -> str:
    if fmt == "markdown":
        return data.decode("utf-8", errors="replace")
    ext = {"html": "html", "pdf": "pdf", "docx": "docx", "odt": "odt", "epub": "epub"}[fmt]
    f = workdir / f"out.{ext}"
    f.write_bytes(data)
    if fmt == "pdf":
        assert data.startswith(b"%PDF"), "not a PDF"
        out = subprocess.run(["pdftotext", "-layout", str(f), "-"], capture_output=True, text=True)
        return out.stdout
    out = subprocess.run(["pandoc", str(f), "-t", "plain", "--wrap=none"], capture_output=True, text=True)
    if out.returncode != 0:
        raise AssertionError(f"pandoc could not read the {fmt} output: {out.stderr[:300]}")
    return out.stdout


def normalise(text: str) -> str:
    # Collapse runs of whitespace (PDF layout, wrapped lines) so checks don't depend on line breaks
    return re.sub(r"[ \t ]+", " ", text).replace(" \n", "\n")


def run_checks(case: Dict[str, Any], fmt: str, text: str) -> List[Tuple[str, bool, str]]:
    """Returns (check id, passed, detail) for every check that applies to this format."""
    t = normalise(text)
    if fmt == "markdown":
        # Pandoc's Markdown writer escapes punctuation such as [ ] | $; compare the unescaped text
        t = re.sub(r"\\([\\`*_{}\[\]()#+\-.!|<>$~^'\"])", r"\1", t)
    flat = re.sub(r"\s+", " ", t)
    results: List[Tuple[str, bool, str]] = []
    groups = [case]
    if fmt == "markdown" and case.get("mdOnly"):
        groups.append(case["mdOnly"])
    for g in groups:
        for s in g.get("expect", []):
            ok = s in t or s in flat
            results.append((f"expect:{s}", ok, "" if ok else "missing"))
        for s in g.get("absent", []):
            ok = s not in t
            results.append((f"absent:{s}", ok, "" if ok else "present"))
        for p in g.get("regex", []):
            ok = re.search(p, flat) is not None
            results.append((f"regex:{p}", ok, "" if ok else "no match"))
        for s, n in (g.get("count") or {}).items():
            got = flat.count(s)
            results.append((f"count:{s}", got == n, f"expected {n}, got {got}"))
    return results


def formats_available() -> List[str]:
    fmts = ["markdown"]
    if HAS_PANDOC:
        fmts += ["html", "docx", "odt", "epub"]
        if HAS_PDF_ENGINE and HAS_PDFTOTEXT:
            fmts.append("pdf")
    return fmts


# ---------------------------------------------------------------------------------------------
# Matrix (python tests/test_compiler_templates.py)
# ---------------------------------------------------------------------------------------------

def main() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        project_dir = make_project(Path(tmp) / "project")
        work = Path(tmp) / "out"
        work.mkdir()
        fmts = [f for f in formats_available() if not os.environ.get("FMTS") or f in os.environ["FMTS"].split(",")]
        only = set(filter(None, os.environ.get("ONLY", "").split(",")))
        print("| case | " + " | ".join(fmts) + " |")
        print("|---|" + "---|" * len(fmts))
        details: List[str] = []
        for case in CASES["cases"]:
            if only and case["id"] not in only:
                continue
            row = []
            for fmt in fmts:
                status, data = compile_case(project_dir, case, fmt, CASES["defaultNodes"])
                if case.get("expectStatus"):
                    msg = data.decode("utf-8", "replace")
                    ok = status == case["expectStatus"] and case.get("expectError", "") in msg
                    row.append("ok" if ok else f"HTTP {status}")
                    if not ok:
                        details.append(f"{case['id']}/{fmt}: HTTP {status}: {msg[:300]}")
                    continue
                if status != 200:
                    row.append(f"HTTP {status}")
                    details.append(f"{case['id']}/{fmt}: HTTP {status}: {data[:300]!r}")
                    continue
                try:
                    text = output_text(fmt, data, work)
                except AssertionError as e:
                    row.append("unreadable")
                    details.append(f"{case['id']}/{fmt}: {e}")
                    continue
                bad = [f"{c} ({d})" for c, ok, d in run_checks(case, fmt, text) if not ok]
                row.append("ok" if not bad else f"{len(bad)} fail")
                for b in bad:
                    details.append(f"{case['id']}/{fmt}: {b}")
                if fmt == "markdown" and os.environ.get("SHOW_MD"):
                    details.append(f"--- {case['id']} markdown ---\n{text}")
            print(f"| {case['id']} | " + " | ".join(row) + " |")
        print("\nFailures:")
        print("\n".join(details) or "none")


def check_dir(out_dir: str) -> int:
    """Check outputs saved by scripts/compiler-stress/stress.mjs (<case>__<fmt>.out/.status).
    Prints the case x format matrix and returns the number of failing cells."""
    import tempfile

    out = Path(out_dir)
    fmts = [f for f in FORMATS if any(out.glob(f"*__{f}.status"))]
    print("| case | " + " | ".join(fmts) + " |")
    print("|---|" + "---|" * len(fmts))
    details: List[str] = []
    failing = 0
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for case in CASES["cases"]:
            if not any(out.glob(f"{case['id']}__*.status")):
                continue
            row = []
            for fmt in fmts:
                sf = out / f"{case['id']}__{fmt}.status"
                if not sf.exists():
                    row.append("-")
                    continue
                status = sf.read_text().strip()
                data = (out / f"{case['id']}__{fmt}.out").read_bytes()
                cell = "ok"
                if case.get("expectStatus"):
                    msg = data.decode("utf-8", "replace")
                    if status != str(case["expectStatus"]) or case.get("expectError", "") not in msg:
                        cell = f"HTTP {status}"
                        details.append(f"{case['id']}/{fmt}: HTTP {status}: {msg[:300]}")
                elif status != "200":
                    cell = "UI error" if status == "ui-error" else f"HTTP {status}"
                    details.append(f"{case['id']}/{fmt}: {cell}: {data[:300].decode('utf-8', 'replace')}")
                else:
                    known = case.get("known") or {}
                    try:
                        text = output_text(fmt, data, work)
                        results = run_checks(case, fmt, text)
                        bad = [f"{c} ({d})" for c, ok, d in results if not ok and c not in known]
                        known_bad = sorted({known[c] for c, ok, _ in results if not ok and c in known})
                    except AssertionError as e:
                        bad, known_bad = [str(e)], []
                    if bad:
                        cell = f"{len(bad)} fail"
                        details += [f"{case['id']}/{fmt}: {b}" for b in bad]
                    elif known_bad:
                        cell = "known " + ", ".join(known_bad)
                if cell != "ok" and not cell.startswith("known"):
                    failing += 1
                row.append(cell)
            print(f"| {case['id']} | " + " | ".join(row) + " |")
    print("\nFailures:")
    print("\n".join(details) or "none")
    return failing


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--check-dir":
        check_dir(sys.argv[2])
    else:
        main()

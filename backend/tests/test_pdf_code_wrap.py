"""PDF export must soft-wrap long code-block lines and inline code spans (issue #42)."""

import os
import shutil
import subprocess
from types import SimpleNamespace

import pytest

from app.services import template_service as ts
from app.services.template_service import (
    PDF_CODE_WRAP_HEADER,
    PDF_INLINE_CODE_WRAP_FILTER,
    TemplateService,
)

LONG_CODE_MD = (
    "# Title\n\n"
    "```python\n"
    "print('" + "a" * 150 + "')\n"
    "```\n\n"
    "```\n"
    "plain_" + "b" * 150 + "\n"
    "```\n"
)


def _flag_arg(cmd, flag):
    return next((a for a in cmd if a.startswith(f"{flag}=")), None)


def _header_arg(cmd):
    return _flag_arg(cmd, "--include-in-header")


def _filter_arg(cmd):
    return _flag_arg(cmd, "--lua-filter")


def _filter_args(cmd):
    return [a for a in cmd if a.startswith("--lua-filter=")]


class FakeRun:
    """Stand-in for subprocess.run that records pandoc invocations."""

    def __init__(self, fail_first_pdf=False):
        self.pandoc_cmds = []
        self.header_contents = []
        self.filter_contents = []
        self.fail_first_pdf = fail_first_pdf

    def __call__(self, cmd, *args, **kwargs):
        if cmd[0] == "tectonic":
            return SimpleNamespace(returncode=1, stdout="", stderr="")
        if cmd[:2] == ["pandoc", "--version"]:
            return SimpleNamespace(returncode=0, stdout="pandoc 3.0", stderr="")
        self.pandoc_cmds.append(list(cmd))
        header = _header_arg(cmd)
        if header:
            path = header.split("=", 1)[1]
            with open(path, encoding="utf-8") as f:
                self.header_contents.append(f.read())
        # Every Lua filter (the font filter (#52) runs for all formats but Markdown)
        for lua in _filter_args(cmd):
            with open(lua.split("=", 1)[1], encoding="utf-8") as f:
                self.filter_contents.append(f.read())
        if self.fail_first_pdf and len(self.pandoc_cmds) == 1:
            return SimpleNamespace(returncode=43, stdout="", stderr="xelatex not found")
        return SimpleNamespace(returncode=0, stdout="", stderr="")


def _convert(tmp_path, monkeypatch, fmt, fake):
    monkeypatch.setattr(ts.subprocess, "run", fake)
    out = str(tmp_path / f"out.{fmt}")
    ok, msg = TemplateService(str(tmp_path)).convert_with_pandoc(
        LONG_CODE_MD, fmt, out, str(tmp_path)
    )
    assert ok, msg


def test_pdf_export_includes_code_wrap_header(tmp_path, monkeypatch):
    fake = FakeRun()
    _convert(tmp_path, monkeypatch, "pdf", fake)

    assert len(fake.pandoc_cmds) == 1
    header = _header_arg(fake.pandoc_cmds[0])
    assert header is not None
    assert "fvextra" in fake.header_contents[0]
    assert "breaklines" in fake.header_contents[0]
    # Temporary header file is cleaned up
    assert not os.path.exists(header.split("=", 1)[1])


def test_pdf_export_includes_inline_code_wrap_filter(tmp_path, monkeypatch):
    fake = FakeRun()
    _convert(tmp_path, monkeypatch, "pdf", fake)

    luas = _filter_args(fake.pandoc_cmds[0])
    assert luas
    assert PDF_INLINE_CODE_WRAP_FILTER in fake.filter_contents
    assert not any(os.path.exists(lua.split("=", 1)[1]) for lua in luas)


@pytest.mark.parametrize("fmt", ["docx", "html", "epub", "odt"])
def test_non_pdf_exports_do_not_get_latex_header(tmp_path, monkeypatch, fmt):
    fake = FakeRun()
    _convert(tmp_path, monkeypatch, fmt, fake)
    assert _header_arg(fake.pandoc_cmds[0]) is None
    assert PDF_INLINE_CODE_WRAP_FILTER not in fake.filter_contents


def test_pdflatex_fallback_keeps_original_options(tmp_path, monkeypatch):
    fake = FakeRun(fail_first_pdf=True)
    _convert(tmp_path, monkeypatch, "pdf", fake)

    assert len(fake.pandoc_cmds) == 2
    retry = fake.pandoc_cmds[1]
    assert "--pdf-engine=pdflatex" in retry
    assert not any(a.startswith("--pdf-engine=") and a != "--pdf-engine=pdflatex" for a in retry)
    assert "-f" in retry
    assert "--resource-path" in retry
    assert _header_arg(retry) is not None
    assert _filter_arg(retry) is not None
    assert fake.filter_contents.count(PDF_INLINE_CODE_WRAP_FILTER) == 2
    assert "breaklines" in fake.header_contents[1]


needs_pandoc = pytest.mark.skipif(shutil.which("pandoc") is None, reason="pandoc not installed")


@needs_pandoc
def test_header_makes_pandoc_latex_use_breaklines(tmp_path):
    header = tmp_path / "header.tex"
    header.write_text(PDF_CODE_WRAP_HEADER, encoding="utf-8")
    result = subprocess.run(
        ["pandoc", "-s", "-t", "latex", "-H", str(header)],
        input=LONG_CODE_MD,
        capture_output=True,
        text=True,
        check=True,
    )
    latex = result.stdout
    assert "\\usepackage{fvextra}" in latex
    # Our redefinition must come after pandoc's own Highlighting definition
    ours = latex.rindex("{Highlighting}{Verbatim}{breaklines")
    pandocs = latex.index("\\DefineVerbatimEnvironment{Highlighting}")
    assert ours > pandocs
    # Highlighted tokens (macro arguments) must be breakable too, and be wrapped
    # after pandoc defines them
    assert latex.rindex("\\FancyVerbBreakStart") > latex.index("\\newcommand{\\StringTok}")


def _latex_with_filter(tmp_path, markdown):
    lua = tmp_path / "wrap.lua"
    lua.write_text(PDF_INLINE_CODE_WRAP_FILTER, encoding="utf-8")
    result = subprocess.run(
        ["pandoc", "-t", "latex", "--wrap=none", f"--lua-filter={lua}"],
        input=markdown,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


@needs_pandoc
def test_filter_adds_break_points_inside_inline_code(tmp_path):
    latex = _latex_with_filter(tmp_path, "See `abcdefgh` here.\n")
    # Breaks only after >=2 leading chars and before >=3 trailing chars
    assert latex.strip() == (
        "See \\texttt{ab}\\penalty50{}\\texttt{c}\\penalty50{}"
        "\\texttt{d}\\penalty50{}\\texttt{e}\\penalty50{}\\texttt{fgh} here."
    )


@needs_pandoc
def test_filter_leaves_short_inline_code_whole(tmp_path):
    latex = _latex_with_filter(tmp_path, "Short `abcd` and `ab`.\n")
    assert "\\penalty" not in latex
    assert "\\texttt{abcd}" in latex


@needs_pandoc
def test_filter_keeps_pandoc_escaping_of_special_characters(tmp_path):
    latex = _latex_with_filter(tmp_path, "Run `a_b\\c{x}%$#&~^z` now.\n")
    for escaped in ("\\_", "\\textbackslash{}", "\\{", "\\}", "\\%", "\\$", "\\#", "\\&",
                    "\\textasciitilde{}", "\\^{}"):
        assert escaped in latex, escaped


@needs_pandoc
def test_filter_keeps_heading_pdf_bookmark_text_clean(tmp_path):
    latex = _latex_with_filter(tmp_path, "## Using `config_value`\n")
    # Breaks go in the typeset title, but the PDF bookmark text stays plain
    assert "\\penalty50{}" in latex
    assert "}{Using config\\_value}}" in latex

"""Hidden notes: `::: hidden` text stays in the node but is left out of every export (#156)."""

import asyncio
import shutil
import subprocess

import pytest

from app.api.v1.endpoints.preview import PreviewRequest, preview_markdown
from app.services.template_service import TemplateService

needs_pandoc = pytest.mark.skipif(shutil.which("pandoc") is None, reason="pandoc not installed")

SECRET = "ZZSECRETNOTEZZ"
DOC = (
    "# Chapter\n\n"
    "Visible opening words.\n\n"
    f"::: hidden\nFirst {SECRET} paragraph with **bold**.\n\nSecond {SECRET} paragraph.\n:::\n\n"
    '::: {font="Caladea"}\nStyled closing words.\n\n'
    f"::: hidden\nNested {SECRET}.\n:::\n:::\n"
)


def _convert(tmp_path, fmt):
    out = tmp_path / f"out.{fmt}"
    ok, msg = TemplateService(str(tmp_path)).convert_with_pandoc(DOC, fmt, str(out), str(tmp_path), {})
    assert ok, msg
    return out


def _plain(path):
    result = subprocess.run(["pandoc", str(path), "-t", "plain"], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result.stdout


@needs_pandoc
@pytest.mark.parametrize("fmt", ["markdown", "html"])
def test_hidden_text_absent_from_text_exports(tmp_path, fmt):
    text = _convert(tmp_path, fmt).read_text(encoding="utf-8")
    assert SECRET not in text
    assert "Visible opening words." in text
    assert "Styled closing words." in text
    assert "hidden" not in text


@needs_pandoc
@pytest.mark.parametrize("fmt", ["docx", "odt", "epub"])
def test_hidden_text_absent_from_document_exports(tmp_path, fmt):
    out = _convert(tmp_path, fmt)
    assert SECRET.encode() not in out.read_bytes()  # epub/docx/odt are zips; also check text
    text = _plain(out)
    assert SECRET not in text
    assert "Visible opening words." in text


@needs_pandoc
def test_hidden_text_absent_from_pdf(tmp_path):
    if not (shutil.which("tectonic") or shutil.which("xelatex") or shutil.which("pdflatex")):
        pytest.skip("no PDF engine")
    if shutil.which("pdftotext") is None:
        pytest.skip("pdftotext not installed")
    out = tmp_path / "out.pdf"
    ok, msg = TemplateService(str(tmp_path)).convert_with_pandoc(DOC, "pdf", str(out), str(tmp_path), {})
    if not ok:
        pytest.skip(f"PDF engine failed locally: {msg[:200]}")
    text = subprocess.run(["pdftotext", str(out), "-"], capture_output=True, text=True).stdout
    assert SECRET not in text
    assert "Visible opening words." in text


@needs_pandoc
def test_preview_shows_hidden_text_dimmed():
    response = asyncio.run(preview_markdown(PreviewRequest(markdown_text=DOC)))
    html = response.body.decode("utf-8")
    assert SECRET in html
    assert 'class="vw-hidden-note"' in html
    assert 'class="hidden"' not in html
    assert "Hidden from compile" in html

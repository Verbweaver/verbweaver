"""Fonts in Compiler exports: node text, template default and the Compiler's Font (#52)."""

import os
import re
import shutil
import subprocess
import zipfile

import pytest

from app.services import font_service
from app.services.font_service import (
    check_pdf_fonts,
    font_filter,
    fonts_used_in,
    friendly_font_error,
    pdf_font_spec,
    pdf_is_complete,
    front_matter_mainfont,
    is_valid_font_name,
    list_installed_fonts,
)
from app.services.template_service import TemplateService, font_variable_args

needs_pandoc = pytest.mark.skipif(shutil.which("pandoc") is None, reason="pandoc not installed")

DOC = (
    "---\ntitle: Fonts\nmainfont: Georgia\n---\n\n# Heading\n\n"
    'Plain and [fancy **bold**]{font="Comfortaa"} words.\n\n'
    '::: {font="Caladea"}\nA whole paragraph.\n:::\n'
)


@pytest.mark.parametrize("name", ["Georgia", "Times New Roman", "Noto Sans CJK JP", "Source Code Pro-1.2", "C059"])
def test_valid_font_names(name):
    assert is_valid_font_name(name)


@pytest.mark.parametrize(
    "name",
    ["", " Georgia", "X\\input{/etc/passwd}", 'a"b', "a'b", "a;b", "<b>", "{x}", "a&b", "x" * 101, None, 3],
)
def test_invalid_font_names(name):
    assert not is_valid_font_name(name)


def test_compiler_font_reaches_pdf_and_html_only():
    assert font_variable_args({"layoutFont": "Georgia"}, "pdf") == ["-V", "mainfont=Georgia"]
    assert font_variable_args({"layoutFont": " Georgia "}, "html") == ["-V", "mainfont=Georgia"]
    for fmt in ("epub", "docx", "odt", "markdown"):
        assert font_variable_args({"layoutFont": "Georgia"}, fmt) == []


@pytest.mark.parametrize("value", ["", None, "X\\input{y}", 'a"b'])
def test_empty_or_unsafe_compiler_font_sends_nothing(value):
    assert font_variable_args({"layoutFont": value}, "pdf") == []


def test_front_matter_mainfont():
    assert front_matter_mainfont(DOC) == "Georgia"
    assert front_matter_mainfont("---\ntitle: $title$\n---\n\nx") is None
    assert front_matter_mainfont("---\nmainfont: $font$\n---\n") is None
    assert front_matter_mainfont("---\nmainfont: 'bad\\\\name'\n---\n") is None
    assert front_matter_mainfont("No front matter\nmainfont: Georgia\n") is None


def test_friendly_font_errors():
    msg = friendly_font_error('! Package fontspec Error: The font "Nope" cannot be found.')
    assert msg and "'Nope' isn't installed" in msg
    assert "variable" in (friendly_font_error('warning: PS OpenType but no "CFF " table.. Maybe variable font?') or "")
    assert friendly_font_error("some other error") is None


def test_installed_fonts_listed_sorted_and_cached(monkeypatch):
    monkeypatch.setattr(font_service, "_font_cache", None)
    monkeypatch.setattr(font_service, "_fonts_from_fc_list", lambda: ["b Font", "A Font", ".Hidden"])
    assert list_installed_fonts() == ["A Font", "b Font"]  # sorted, hidden fonts dropped
    monkeypatch.setattr(font_service, "_fonts_from_fc_list", lambda: ["Other"])
    assert list_installed_fonts() == ["A Font", "b Font"]  # cached
    assert list_installed_fonts(refresh=True) == ["Other"]


def test_installed_fonts_fall_back_to_font_files(monkeypatch):
    monkeypatch.setattr(font_service, "_font_cache", None)
    monkeypatch.setattr(font_service, "_fonts_from_fc_list", lambda: None)
    monkeypatch.setattr(font_service, "_fonts_from_files", lambda: ["From Files"])
    assert list_installed_fonts() == ["From Files"]


@pytest.mark.skipif(shutil.which("fc-list") is None, reason="fontconfig not installed")
def test_real_installed_fonts(monkeypatch):
    monkeypatch.setattr(font_service, "_font_cache", None)
    fonts = list_installed_fonts()
    assert fonts and fonts == sorted(fonts, key=str.casefold)


def test_font_files_scan_reads_family_names(monkeypatch):
    pytest.importorskip("fontTools")
    dirs = [d for d in ["/usr/share/fonts", "/System/Library/Fonts", r"C:\Windows\Fonts"] if os.path.isdir(d)]
    if not dirs:
        pytest.skip("no system font folder")
    monkeypatch.setattr(font_service, "_font_dirs", lambda: dirs)
    names = font_service._fonts_from_files()
    assert names and all(isinstance(n, str) and n for n in names)


# --- Real Pandoc runs ---------------------------------------------------------


def _convert(tmp_path, fmt, options=None, md=DOC):
    out = tmp_path / f"out.{fmt}"
    ok, msg = TemplateService(str(tmp_path)).convert_with_pandoc(md, fmt, str(out), str(tmp_path), options or {})
    assert ok, msg
    return out


@needs_pandoc
def test_html_fonts(tmp_path):
    html = _convert(tmp_path, "html").read_text(encoding="utf-8")
    assert "font-family: Georgia;" in html
    assert '<span style="font-family: &#39;Comfortaa&#39;">fancy' in html
    assert '<div style="font-family: &#39;Caladea&#39;">' in html
    assert "data-font" not in html


@needs_pandoc
def test_html_compiler_font_beats_template(tmp_path):
    html = _convert(tmp_path, "html", {"layoutFont": "Carlito"}).read_text(encoding="utf-8")
    assert "font-family: Carlito;" in html
    assert "font-family: Georgia;" not in html


@needs_pandoc
def test_latex_filter(tmp_path):
    lua = tmp_path / "f.lua"
    lua.write_text(font_filter(), encoding="utf-8")
    tex = subprocess.run(
        ["pandoc", "-f", "markdown", "-t", "latex", f"--lua-filter={lua}"],
        input=DOC + '\n[x]{font="bad\\\\name"}\n', capture_output=True, text=True, check=True,
    ).stdout
    assert "\\fontspec{Comfortaa}" in tex
    assert "\\begingroup\\ifcsname fontspec\\endcsname\\fontspec{Caladea}" in tex
    assert "\\endgroup" in tex
    assert "\\fontspec{bad" not in tex


@needs_pandoc
def test_epub_fonts(tmp_path):
    with zipfile.ZipFile(_convert(tmp_path, "epub")) as z:
        css = "".join(z.read(n).decode() for n in z.namelist() if n.endswith(".css"))
        xhtml = "".join(z.read(n).decode() for n in z.namelist() if n.endswith(".xhtml"))
    assert "font-family: 'Georgia', serif" in css
    assert "font-family: Menlo" in css  # Pandoc's default stylesheet is kept
    assert "font-family: &#39;Comfortaa&#39;" in xhtml


@needs_pandoc
def test_docx_fonts(tmp_path):
    with zipfile.ZipFile(_convert(tmp_path, "docx", {"layoutFont": "Carlito"})) as z:
        theme = z.read("word/theme/theme1.xml").decode()
        styles = z.read("word/styles.xml").decode()
    assert re.findall(r'<a:(?:major|minor)Font>\s*<a:latin typeface="([^"]*)"', theme) == ["Carlito", "Carlito"]
    span = re.search(r'<w:style w:type="character"[^>]*>(?:(?!</w:style>).)*Font Comfortaa(?:(?!</w:style>).)*</w:style>', styles, re.S)
    # Blocks give each paragraph's text the font's character style
    block = re.search(r'<w:style w:type="character"[^>]*>(?:(?!</w:style>).)*Font Caladea(?:(?!</w:style>).)*</w:style>', styles, re.S)
    assert span and 'w:ascii="Comfortaa"' in span.group(0)
    assert block and 'w:ascii="Caladea"' in block.group(0)


@needs_pandoc
def test_odt_fonts(tmp_path):
    with zipfile.ZipFile(_convert(tmp_path, "odt")) as z:
        assert z.namelist()[0] == "mimetype"
        assert z.getinfo("mimetype").compress_type == zipfile.ZIP_STORED
        styles = z.read("styles.xml").decode()
    assert '<style:font-face style:name="Georgia"' in styles
    used = set(re.findall(r'style:font-name="([^"]*)"', styles))
    assert "Georgia" in used and "Times New Roman" not in used and "Arial" not in used
    assert "Courier New" in used  # code keeps its monospace font
    assert re.search(r'<style:style style:name="Font Comfortaa" style:family="text">.*?style:font-name="Comfortaa"', styles)
    assert re.search(r'<style:style style:name="Font Caladea" style:family="text">.*?style:font-name="Caladea"', styles)


@needs_pandoc
def test_markdown_keeps_font_attributes(tmp_path):
    md = _convert(tmp_path, "markdown").read_text(encoding="utf-8")
    assert '{font="Comfortaa"}' in md


@needs_pandoc
def test_no_fonts_leaves_office_files_alone(tmp_path):
    out = _convert(tmp_path, "docx", md="---\ntitle: Plain\n---\n\nHello.\n")
    with zipfile.ZipFile(out) as z:
        theme = z.read("word/theme/theme1.xml").decode()
    assert "Carlito" not in theme and "Georgia" not in theme



# --- Variable fonts and unreadable PDFs ------------------------------------------

CANTARELL = [
    ("Cantarell", "regular", False, "/fonts/static/Cantarell-Regular.otf"),
    ("Cantarell", "bold", False, "/fonts/static/Cantarell-Bold.otf"),
    # The variable file also lists its named styles as non-variable faces
    ("Cantarell", "bold", False, "/fonts/vf/Cantarell-VF.otf"),
    ("Cantarell", "regular", False, "/fonts/vf/Cantarell-VF.otf"),
    ("Cantarell", "", True, "/fonts/vf/Cantarell-VF.otf"),
    ("OnlyVar", "", True, "/fonts/vf/OnlyVar[wght].ttf"),
    ("OnlyVar", "bold", False, "/fonts/vf/OnlyVar[wght].ttf"),
    ("Plain", "regular", False, "/fonts/Plain.ttf"),
]


@pytest.fixture
def fake_font_files(monkeypatch):
    monkeypatch.setattr(font_service, "_font_files", lambda refresh=False: CANTARELL)


def test_static_files_preferred_over_variable_font(fake_font_files):
    assert pdf_font_spec("Cantarell") == {
        "file": "Cantarell-Regular.otf",
        "options": ["Path=/fonts/static/", "BoldFont=Cantarell-Bold.otf"],
    }
    assert pdf_font_spec("OnlyVar") == {"variable_only": True}
    assert pdf_font_spec("Plain") is None
    assert pdf_font_spec("Not Installed") is None
    variable_only, specs = check_pdf_fonts(["Cantarell", "OnlyVar", "Plain"])
    assert variable_only == ["OnlyVar"] and list(specs) == ["Cantarell"]


def test_filter_loads_font_files_in_latex(fake_font_files, tmp_path):
    if shutil.which("pandoc") is None:
        pytest.skip("pandoc not installed")
    _, specs = check_pdf_fonts(["Cantarell"])
    lua = tmp_path / "f.lua"
    lua.write_text(font_filter(None, specs), encoding="utf-8")
    tex = subprocess.run(
        ["pandoc", "-f", "markdown", "-t", "latex", f"--lua-filter={lua}"],
        input='[x]{font="Cantarell"} [y]{font="Plain"}', capture_output=True, text=True, check=True,
    ).stdout
    assert "\\fontspec[Path=/fonts/static/,BoldFont=Cantarell-Bold.otf]{Cantarell-Regular.otf}" in tex
    assert "\\fontspec{Plain}" in tex


def test_pdf_main_font_loaded_from_static_files(fake_font_files, tmp_path, monkeypatch):
    from types import SimpleNamespace
    from app.services import template_service as ts

    cmds = []

    def fake_run(cmd, *a, **k):
        if cmd[0] == "tectonic" or cmd[:2] == ["pandoc", "--version"]:
            return SimpleNamespace(returncode=0, stdout="pandoc 3", stderr="")
        cmds.append(cmd)
        with open(cmd[cmd.index("-o") + 1], "wb") as f:
            f.write(b"%PDF-1.7\n" + b"0" * 300 + b"\n%%EOF\n")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(ts.subprocess, "run", fake_run)
    ok, msg = TemplateService(str(tmp_path)).convert_with_pandoc(
        "# Hi\n", "pdf", str(tmp_path / "o.pdf"), str(tmp_path), {"layoutFont": "Cantarell"})
    assert ok, msg
    cmd = cmds[0]
    assert "mainfont=Cantarell" not in cmd
    assert "mainfont=Cantarell-Regular.otf" in cmd
    assert "mainfontoptions=Path=/fonts/static/" in cmd
    assert "mainfontoptions=BoldFont=Cantarell-Bold.otf" in cmd
    assert cmd[cmd.index("mainfont=Cantarell-Regular.otf") - 1] == "-V"


def _fake_stub_pdf(monkeypatch, stderr):
    from types import SimpleNamespace
    from app.services import template_service as ts

    def fake_run(cmd, *a, **k):
        if cmd[0] == "tectonic" or cmd[:2] == ["pandoc", "--version"]:
            return SimpleNamespace(returncode=0, stdout="pandoc 3", stderr="")
        with open(cmd[cmd.index("-o") + 1], "wb") as f:
            f.write(b"%PDF-1.7\n%\xe4\xf0\xed\xf8\n")  # what MiKTeX leaves behind
        return SimpleNamespace(returncode=0, stdout="", stderr=stderr)

    monkeypatch.setattr(ts.subprocess, "run", fake_run)


def test_unreadable_pdf_is_an_error_naming_variable_fonts(fake_font_files, tmp_path, monkeypatch):
    _fake_stub_pdf(monkeypatch, "dvipdfmx:fatal: Invalid font: -1 (0)\nNo output PDF file written.")
    ok, msg = TemplateService(str(tmp_path)).convert_with_pandoc(
        "# Hi\n", "pdf", str(tmp_path / "o.pdf"), str(tmp_path), {"layoutFont": "OnlyVar"})
    assert not ok
    assert "'OnlyVar'" in msg and "variable" in msg


def test_unreadable_pdf_is_an_error_without_known_cause(tmp_path, monkeypatch):
    monkeypatch.setattr(font_service, "_font_files", lambda refresh=False: [])
    _fake_stub_pdf(monkeypatch, "something odd")
    ok, msg = TemplateService(str(tmp_path)).convert_with_pandoc(
        "# Hi\n", "pdf", str(tmp_path / "o.pdf"), str(tmp_path), {})
    assert not ok
    assert "didn't finish the PDF" in msg and "something odd" in msg


def test_pdf_is_complete(tmp_path):
    good, stub, missing = tmp_path / "g.pdf", tmp_path / "s.pdf", tmp_path / "m.pdf"
    good.write_bytes(b"%PDF-1.7\n" + b"0" * 300 + b"\n%%EOF\n")
    stub.write_bytes(b"%PDF-1.7\n%\xe4\xf0\xed\xf8\n")
    assert pdf_is_complete(str(good))
    assert not pdf_is_complete(str(stub))
    assert not pdf_is_complete(str(missing))


def test_fonts_used_in():
    assert fonts_used_in(DOC + '[a]{font="Comfortaa"} [b]{font="bad\\\\x"}') == ["Comfortaa", "Caladea"]


# --- Metadata font --------------------------------------------------------------

META_DOC = (
    "---\ntitle: Meta\n---\n\n## Page\n\nBody.\n\n"
    "::: {.metadata}\n### Metadata\n\n```yaml\nid: 1\ntask:\n  status: done\n```\n:::\n"
)


@needs_pandoc
def test_metadata_font_in_html(tmp_path):
    html = _convert(tmp_path, "html", {"metadataFont": "Comfortaa"}, md=META_DOC).read_text(encoding="utf-8")
    section = re.search(r'<section[^>]*class="metadata"[^>]*>.*?</section>', html, re.S).group(0)
    assert "font-family: &#39;Comfortaa&#39;" in section
    # The YAML is shown as plain lines in the chosen font, keeping its indentation
    assert "<pre" not in section and "status: done" in section and "\u00a0\u00a0status" in section


@needs_pandoc
def test_metadata_font_from_template_front_matter(tmp_path):
    md = META_DOC.replace("title: Meta\n", "title: Meta\nmetadatafont: Carlito\n")
    html = _convert(tmp_path, "html", md=md).read_text(encoding="utf-8")
    assert "font-family: &#39;Carlito&#39;" in html


@needs_pandoc
def test_no_metadata_font_keeps_code_block(tmp_path):
    html = _convert(tmp_path, "html", md=META_DOC).read_text(encoding="utf-8")
    assert "<pre" in html


@needs_pandoc
def test_metadata_font_in_docx_and_odt(tmp_path):
    with zipfile.ZipFile(_convert(tmp_path, "docx", {"metadataFont": "Comfortaa"}, md=META_DOC)) as z:
        doc = z.read("word/document.xml").decode()
        styles = z.read("word/styles.xml").decode()
    assert doc.count('<w:rStyle w:val="FontComfortaa" />') >= 2  # heading and lines
    assert 'w:ascii="Comfortaa"' in styles
    with zipfile.ZipFile(_convert(tmp_path, "odt", {"metadataFont": "Comfortaa"}, md=META_DOC)) as z:
        content = z.read("content.xml").decode()
    assert re.search(r'<text:h[^>]*>.*?<text:span text:style-name="Font Comfortaa">', content)


@needs_pandoc
def test_markdown_export_drops_metadata_wrapper(tmp_path):
    md = _convert(tmp_path, "markdown", {"metadataFont": "Comfortaa"}, md=META_DOC).read_text(encoding="utf-8")
    assert ":::" not in md and "metadata}" not in md
    assert "### Metadata" in md and "status: done" in md


def test_page_details_wrapped_for_metadata_font():
    from app.api.v1.endpoints.compiler import ContentAggregator

    svc = ContentAggregator.__new__(ContentAggregator)
    out = svc._clean_content("---\nid: 1\n---\n\n# Title\n\nBody\n", True)
    assert out.startswith("::: {.metadata}\n### Metadata\n\n```yaml\nid: 1\n```\n:::")
    assert "::: {.metadata}" not in svc._clean_content("---\nid: 1\n---\n\nBody\n", False)


def _pdf_engine():
    return shutil.which("tectonic") or shutil.which("xelatex")


@pytest.mark.skipif(shutil.which("pandoc") is None or _pdf_engine() is None or shutil.which("fc-list") is None,
                    reason="needs pandoc, a PDF engine and fontconfig")
def test_real_pdf_with_font_that_also_has_a_variable_file(tmp_path, monkeypatch):
    """The bug from #52 testing: Cantarell gave MiKTeX a variable font and a 15-byte PDF."""
    monkeypatch.setattr(font_service, "_font_files_cache", None)
    candidates = [f for f in list_installed_fonts() if "file" in (pdf_font_spec(f) or {})]
    if not candidates:
        pytest.skip("no installed font has both static and variable files")
    font = candidates[0]
    out = _convert(tmp_path, "pdf", {"layoutFont": font}, md="---\ntitle: T\n---\n\n# Head\n\nHello **bold**.\n")
    assert pdf_is_complete(str(out))
    if shutil.which("pdffonts"):
        fonts = subprocess.run(["pdffonts", str(out)], capture_output=True, text=True).stdout
        assert font.replace(" ", "") in fonts.replace(" ", "")

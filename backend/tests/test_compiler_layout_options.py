"""The Compiler's page size, font size, margin and line spacing options reach Pandoc (#143)."""

import shutil
import subprocess

import pytest

from app.services.template_service import TemplateService, layout_variable_args

ALL_DEFAULT = {
    "layoutPageSize": "default",
    "layoutFontSize": "default",
    "layoutMargins": "default",
    "layoutLineSpacing": "default",
}


def _vars(args):
    """['-V', 'a=1', '-V', 'b=2'] -> ['a=1', 'b=2']"""
    assert args[::2] == ["-V"] * (len(args) // 2)
    return args[1::2]


@pytest.mark.parametrize(
    "key,value,expected",
    [
        ("layoutPageSize", "a4", ["papersize=a4"]),
        ("layoutPageSize", "letter", ["papersize=letter"]),
        ("layoutPageSize", "a5", ["papersize=a5"]),
        ("layoutFontSize", "small", ["fontsize=10pt"]),
        ("layoutFontSize", "medium", ["fontsize=11pt"]),
        ("layoutFontSize", "large", ["fontsize=12pt"]),
        ("layoutMargins", "narrow", ["geometry:margin=1.5cm"]),
        ("layoutMargins", "normal", ["geometry:margin=2.5cm"]),
        ("layoutMargins", "wide", ["geometry:margin=3.5cm"]),
        ("layoutLineSpacing", "single", ["linestretch=1"]),
        ("layoutLineSpacing", "1.5", ["linestretch=1.5"]),
        ("layoutLineSpacing", "double", ["linestretch=2"]),
    ],
)
def test_pdf_values(key, value, expected):
    assert _vars(layout_variable_args({**ALL_DEFAULT, key: value}, "pdf")) == expected


def test_html_values():
    opts = {
        "layoutPageSize": "a5",  # no page size in HTML
        "layoutFontSize": "large",
        "layoutMargins": "wide",
        "layoutLineSpacing": "double",
    }
    assert _vars(layout_variable_args(opts, "html")) == [
        "fontsize=19px",
        "margin-left=90px",
        "margin-right=90px",
        "margin-top=90px",
        "margin-bottom=90px",
        "linestretch=2",
    ]


@pytest.mark.parametrize("fmt", ["docx", "odt", "epub", "markdown"])
def test_formats_without_layout_get_nothing(fmt):
    opts = {
        "layoutPageSize": "a4",
        "layoutFontSize": "large",
        "layoutMargins": "wide",
        "layoutLineSpacing": "double",
    }
    assert layout_variable_args(opts, fmt) == []


@pytest.mark.parametrize(
    "opts",
    [
        None,
        {},
        ALL_DEFAULT,
        # Unknown values (including attempts to smuggle extra arguments) are dropped
        {"layoutPageSize": "b5", "layoutFontSize": "--lua-filter=x.lua", "layoutMargins": 3},
        # The old, never-shown option keys are ignored, so saved configurations keep their output
        {"pageSize": "A4", "fontSize": "medium", "margins": "normal", "lineSpacing": "1.5"},
    ],
)
def test_default_and_unknown_values_send_nothing(opts):
    assert layout_variable_args(opts, "pdf") == []


def test_values_are_case_insensitive():
    assert _vars(layout_variable_args({"layoutPageSize": "A4"}, "pdf")) == ["papersize=a4"]


@pytest.mark.skipif(shutil.which("pandoc") is None, reason="pandoc not installed")
def test_html_export_uses_layout(tmp_path):
    service = TemplateService(str(tmp_path))
    out = tmp_path / "out.html"
    ok, msg = service.convert_with_pandoc(
        "---\ntitle: Layout\n---\n\nHello.\n",
        "html",
        str(out),
        str(tmp_path),
        {"layoutFontSize": "large", "layoutLineSpacing": "double", "layoutMargins": "narrow"},
    )
    assert ok, msg
    html = out.read_text(encoding="utf-8")
    assert "font-size: 19px;" in html
    assert "line-height: 2;" in html
    assert "padding-left: 20px;" in html


@pytest.mark.skipif(shutil.which("pandoc") is None, reason="pandoc not installed")
def test_layout_choice_overrides_template_front_matter(tmp_path):
    service = TemplateService(str(tmp_path))
    out = tmp_path / "out.html"
    md = "---\ntitle: Layout\nfontsize: 30px\nlinestretch: 3\n---\n\nHello.\n"
    ok, msg = service.convert_with_pandoc(
        md, "html", str(out), str(tmp_path), {"layoutFontSize": "small"}
    )
    assert ok, msg
    html = out.read_text(encoding="utf-8")
    assert "font-size: 14px;" in html  # the Compiler's choice wins
    assert "line-height: 3;" in html  # "Template default" keeps the template's value


@pytest.mark.skipif(
    shutil.which("pandoc") is None
    or shutil.which("pdfinfo") is None
    or not (shutil.which("tectonic") or shutil.which("xelatex")),
    reason="pandoc, a PDF engine and pdfinfo are needed",
)
def test_pdf_export_uses_page_size(tmp_path):
    service = TemplateService(str(tmp_path))
    out = tmp_path / "out.pdf"
    ok, msg = service.convert_with_pandoc(
        "---\ntitle: Layout\n---\n\nHello.\n",
        "pdf",
        str(out),
        str(tmp_path),
        {"layoutPageSize": "a5", "layoutFontSize": "large", "layoutMargins": "narrow"},
    )
    assert ok, msg
    info = subprocess.run(["pdfinfo", str(out)], capture_output=True, text=True).stdout
    # A5 is 419.53 x 595.28 pt
    assert "419.5" in info and "595.2" in info, info


# The shipped example templates set their own page layout in front matter, and the
# Compiler's Layout settings override it.

SHIPPED_LAYOUTS = {
    "simple.md": {"papersize": "a4", "fontsize": "11pt", "geometry": "margin=2.5cm", "linestretch": 1.2},
    "academic.md": {"papersize": "a4", "fontsize": "12pt", "geometry": "margin=2.5cm", "linestretch": 1.5},
    "technical-report.md": {
        "papersize": "a4", "fontsize": "11pt", "geometry": "margin=2cm", "linestretch": 1.15,
    },
}


@pytest.mark.parametrize("name,layout", SHIPPED_LAYOUTS.items())
def test_shipped_templates_declare_layout(name, layout):
    import yaml

    from tests.compiler_harness import SHIPPED_TEMPLATES

    text = (SHIPPED_TEMPLATES / "markdown" / name).read_text(encoding="utf-8")
    front = yaml.safe_load(text.split("---")[1])
    assert {k: front.get(k) for k in layout} == layout


@pytest.fixture(scope="module")
def shipped_project(tmp_path_factory):
    from tests.compiler_harness import make_project

    return make_project(tmp_path_factory.mktemp("layout") / "project")


def _compile_shipped(project, fmt, template, options=None):
    from tests.compiler_harness import compile_case

    case = {"template": template, "options": {"title": "Layout", "author": "A", **(options or {})}}
    status, body = compile_case(project, case, fmt, ["nodes/Intro.md"])
    assert status == 200, body[:500]
    return body


@pytest.mark.skipif(shutil.which("pandoc") is None, reason="pandoc not installed")
def test_shipped_template_layout_reaches_html(shipped_project):
    html = _compile_shipped(shipped_project, "html", "academic.md").decode("utf-8")
    assert "font-size: 12pt;" in html
    assert "line-height: 1.5;" in html
    # The Compiler's choice wins over the template's
    html = _compile_shipped(
        shipped_project, "html", "academic.md", {"layoutLineSpacing": "double"}
    ).decode("utf-8")
    assert "line-height: 2;" in html
    assert "font-size: 12pt;" in html


@pytest.mark.skipif(
    shutil.which("pandoc") is None
    or shutil.which("pdfinfo") is None
    or not (shutil.which("tectonic") or shutil.which("xelatex")),
    reason="pandoc, a PDF engine and pdfinfo are needed",
)
def test_shipped_template_layout_reaches_pdf(shipped_project, tmp_path):
    def page_size(pdf_bytes):
        f = tmp_path / "out.pdf"
        f.write_bytes(pdf_bytes)
        return subprocess.run(["pdfinfo", str(f)], capture_output=True, text=True).stdout

    info = page_size(_compile_shipped(shipped_project, "pdf", "simple.md"))
    assert "595.2" in info and "841.8" in info, info  # A4 from the template
    info = page_size(_compile_shipped(shipped_project, "pdf", "simple.md", {"layoutPageSize": "a5"}))
    assert "419.5" in info and "595.2" in info, info  # A5 from the Compiler

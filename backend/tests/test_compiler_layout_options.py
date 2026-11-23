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

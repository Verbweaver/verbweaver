"""
Fonts for Compiler exports (#52).

- Lists the fonts installed on the machine that runs the export (the user's computer
  in the desktop app, the server for web/Docker).
- Validates font names before they reach Pandoc, LaTeX, CSS or XML.
- Provides the Lua filter that turns `[text]{font="Name"}` spans and
  `::: {font="Name"}` divs into each output format's own font mechanism.
- Applies the document font and span/div fonts to Word and OpenDocument files after
  Pandoc writes them, since Pandoc has no font setting for those formats.
"""

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import zipfile
from typing import Dict, List, Optional, Set, Tuple
from xml.sax.saxutils import escape as _xml_escape

import yaml

logger = logging.getLogger(__name__)

# Letters, digits, spaces and . _ + - only. This keeps names safe inside LaTeX
# arguments, quoted CSS strings and XML attributes. Names outside this set (rare)
# are ignored and the text keeps the default font.
_FONT_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,99}$")

# Formats the font filter and the Compiler's Font setting apply to.
FONT_FORMATS = ("pdf", "html", "epub", "docx", "odt")

# Suffix for the Word/OpenDocument style made for a `::: {font="X"}` block, so it
# doesn't clash with the character style made for `[text]{font="X"}`.
_BLOCK_STYLE_SUFFIX = " Paragraph"


def is_valid_font_name(name: object) -> bool:
    return isinstance(name, str) and bool(_FONT_NAME_RE.match(name.strip())) and name == name.strip()


def clean_font_name(name: object) -> Optional[str]:
    """The font name with surrounding spaces removed, or None if it isn't usable."""
    if not isinstance(name, str):
        return None
    name = name.strip()
    return name if is_valid_font_name(name) else None


def front_matter_mainfont(markdown: str) -> Optional[str]:
    """The `mainfont` from a document's or template's leading YAML block, if valid."""
    return front_matter_font(markdown, "mainfont")


def front_matter_font(markdown: str, key: str) -> Optional[str]:
    """A font named in a document's or template's leading YAML block (e.g. `metadatafont`)."""
    if not markdown:
        return None
    text = markdown.lstrip("\ufeff")
    m = re.match(r"^---[ \t]*\r?\n(.*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)", text, re.S)
    if not m:
        return None
    try:
        data = yaml.safe_load(m.group(1))
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    value = data.get(key)
    if isinstance(value, str) and "$" in value:
        return None  # unresolved template placeholder
    return clean_font_name(value)


# ---------------------------------------------------------------------------
# Installed fonts
# ---------------------------------------------------------------------------

_font_cache: Optional[List[str]] = None
_font_lock = threading.Lock()


def _fonts_from_fc_list() -> Optional[List[str]]:
    exe = shutil.which("fc-list")
    if not exe:
        return None
    try:
        result = subprocess.run([exe, ":", "family"], capture_output=True, text=True, timeout=30)
    except Exception as e:
        logger.warning(f"fc-list failed: {e}")
        return None
    if result.returncode != 0:
        return None
    names: Set[str] = set()
    for line in result.stdout.splitlines():
        # One font can list several family names ("Cantarell,Cantarell Light"):
        # the first is the main family, the rest are style-specific aliases.
        first = line.split(",")[0].strip()
        if first:
            names.add(first)
    return sorted(names, key=str.casefold)


def _font_dirs() -> List[str]:
    home = os.path.expanduser("~")
    if sys.platform.startswith("win"):
        windir = os.environ.get("WINDIR", r"C:\Windows")
        local = os.environ.get("LOCALAPPDATA", os.path.join(home, "AppData", "Local"))
        return [os.path.join(windir, "Fonts"), os.path.join(local, "Microsoft", "Windows", "Fonts")]
    if sys.platform == "darwin":
        return ["/System/Library/Fonts", "/Library/Fonts", os.path.join(home, "Library", "Fonts")]
    return [os.path.join(home, ".local", "share", "fonts"), os.path.join(home, ".fonts"),
            "/usr/share/fonts", "/usr/local/share/fonts"]


def _fonts_from_files() -> List[str]:
    try:
        from fontTools.ttLib import TTCollection, TTFont
    except Exception:
        logger.warning("fontTools is not available; cannot list installed fonts")
        return []
    names: Set[str] = set()
    for root_dir in _font_dirs():
        if not os.path.isdir(root_dir):
            continue
        for dirpath, _dirs, files in os.walk(root_dir):
            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext not in (".ttf", ".otf", ".ttc", ".otc"):
                    continue
                path = os.path.join(dirpath, fname)
                try:
                    fonts = (TTCollection(path, lazy=True).fonts if ext in (".ttc", ".otc")
                             else [TTFont(path, lazy=True, fontNumber=0)])
                    for font in fonts:
                        name_table = font["name"]
                        family = name_table.getDebugName(16) or name_table.getDebugName(1)
                        if family and family.strip():
                            names.add(family.strip())
                except Exception:
                    continue
    return sorted(names, key=str.casefold)


def list_installed_fonts(refresh: bool = False) -> List[str]:
    """Font family names installed on this machine, sorted, cached until refresh."""
    global _font_cache
    with _font_lock:
        if refresh:
            global _font_files_cache
            _font_files_cache = None
        if _font_cache is None or refresh:
            fonts = _fonts_from_fc_list()
            if not fonts:
                fonts = _fonts_from_files()
            # Hidden system fonts on macOS start with "." and can't be used by name.
            _font_cache = sorted({f for f in fonts if not f.startswith(".")}, key=str.casefold)
        return list(_font_cache)


# ---------------------------------------------------------------------------
# Font files for PDF (variable fonts)
# ---------------------------------------------------------------------------
#
# The PDF writer used by xelatex and tectonic (xdvipdfmx) can't embed variable
# fonts. Some fonts are installed both as static files and as one variable file
# (e.g. Cantarell on Fedora), and fontconfig may hand LaTeX the variable one. With
# MiKTeX that silently produces a 15-byte, unreadable PDF. When fontconfig can tell
# us the files, we point LaTeX at the static files instead.

_SAFE_PATH_RE = re.compile(r"^[A-Za-z0-9 /._+-]+$")
_STYLE_ROLES = {
    "UprightFont": ("regular", "book", "normal", "roman", "medium"),
    "BoldFont": ("bold",),
    "ItalicFont": ("italic", "oblique"),
    "BoldItalicFont": ("bold italic", "bold oblique", "bolditalic"),
}

_font_files_cache: Optional[List[tuple]] = None


def _font_files(refresh: bool = False) -> List[tuple]:
    """(family, style, is_variable, file) for every installed font face, via fontconfig."""
    global _font_files_cache
    with _font_lock:
        if _font_files_cache is not None and not refresh:
            return _font_files_cache
        rows: List[tuple] = []
        exe = shutil.which("fc-list")
        if exe:
            try:
                out = subprocess.run(
                    [exe, "--format", "%{family[0]}\t%{style[0]}\t%{variable}\t%{file}\n"],
                    capture_output=True, text=True, timeout=30,
                ).stdout
                for line in out.splitlines():
                    parts = line.split("\t")
                    if len(parts) == 4 and parts[0]:
                        family, style, variable, path = parts
                        rows.append((family.strip(), style.strip().lower(), variable.strip() in ("True", "1"), path))
            except Exception as e:
                logger.warning(f"fc-list failed: {e}")
        _font_files_cache = rows
        return rows


def pdf_font_spec(name: str) -> Optional[Dict[str, object]]:
    """How LaTeX should load `name` when its default lookup could pick a variable font.

    Returns None when nothing special is needed (or fontconfig isn't available),
    {"variable_only": True} when the font only exists as a variable font, or
    {"file": "Name-Regular.otf", "options": ["Path=/dir/", "BoldFont=...", ...]}.
    """
    faces = [r for r in _font_files() if r[0].casefold() == name.casefold()]
    if not faces or not any(r[2] for r in faces):
        return None
    # A variable file also lists its named styles (Bold, Light, ...) as separate,
    # non-variable faces, so leave out every face from a file that is variable.
    variable_files = {r[3] for r in faces if r[2]}
    static = [r for r in faces if r[3] not in variable_files and r[3].lower().endswith((".otf", ".ttf"))]
    if not static:
        return {"variable_only": True}

    def pick(role: str) -> Optional[str]:
        for wanted in _STYLE_ROLES[role]:
            for _fam, style, _var, path in static:
                if style == wanted:
                    return path
        return None

    upright = pick("UprightFont") or static[0][3]
    folder = os.path.dirname(upright)
    if not _SAFE_PATH_RE.match(upright):
        return None
    options = [f"Path={folder}/"]
    for role in ("BoldFont", "ItalicFont", "BoldItalicFont"):
        path = pick(role)
        if path and os.path.dirname(path) == folder and _SAFE_PATH_RE.match(path):
            options.append(f"{role}={os.path.basename(path)}")
    return {"file": os.path.basename(upright), "options": options}


def variable_only_error(fonts: List[str]) -> str:
    names = ", ".join(f"'{f}'" for f in fonts)
    return (f"The PDF couldn't be made because {names} is only installed as a \"variable\" font, "
            "which the PDF engine can't always use. Pick another font, or install the font's "
            "standard (static) version. See Help \u2192 Fonts.")


def check_pdf_fonts(names: List[str]) -> Tuple[List[str], Dict[str, Dict[str, object]]]:
    """(variable-only fonts, {font: file spec}) for the fonts a PDF export will use.

    Variable-only fonts aren't refused up front: some work and some don't, depending
    on the font and the PDF engine. They're named if the PDF comes out unreadable.
    """
    variable_only: List[str] = []
    specs: Dict[str, Dict[str, object]] = {}
    for name in names:
        spec = pdf_font_spec(name)
        if spec is None:
            continue
        if spec.get("variable_only"):
            variable_only.append(name)
        else:
            specs[name] = spec
    return variable_only, specs


def variable_only_fonts() -> List[str]:
    """Installed fonts that exist only as variable fonts (may not work in PDFs)."""
    families = {r[0] for r in _font_files()}
    return sorted((f for f in families if (pdf_font_spec(f) or {}).get("variable_only")), key=str.casefold)


def latex_fontspec(name: str, specs: Dict[str, Dict[str, object]]) -> str:
    """`[options]{file}` or `{name}` for \\fontspec."""
    spec = specs.get(name)
    if spec:
        return "[" + ",".join(spec["options"]) + "]{" + str(spec["file"]) + "}"  # type: ignore[arg-type]
    return "{" + name + "}"


def pdf_is_complete(path: str) -> bool:
    """True if `path` looks like a whole PDF (starts with %PDF and ends with %%EOF)."""
    try:
        size = os.path.getsize(path)
        if size < 200:
            return False
        with open(path, "rb") as f:
            head = f.read(5)
            f.seek(max(0, size - 2048))
            tail = f.read()
        return head == b"%PDF-" and b"%%EOF" in tail
    except OSError:
        return False


FONT_ATTR_RE = re.compile(r"""\bfont\s*=\s*"([^"\n]*)\"""")


def fonts_used_in(markdown: str) -> List[str]:
    """Valid font names used by `{font="..."}` attributes in the document."""
    names = []
    for raw in FONT_ATTR_RE.findall(markdown or ""):
        name = clean_font_name(raw)
        if name and name not in names:
            names.append(name)
    return names


# ---------------------------------------------------------------------------
# Lua filter for [text]{font="X"} and ::: {font="X"}
# ---------------------------------------------------------------------------

FONT_FILTER = r"""
local SUFFIX = '__SUFFIX__'
-- Set by font_filter(): the metadata font (or nil), and \fontspec arguments for
-- fonts that must be loaded from their files in PDFs.
local METADATA_FONT = __METADATA_FONT__
local LATEX_SPECS = __LATEX_SPECS__

local function take_font(el)
  local f = el.attributes['font']
  if f == nil then return nil end
  el.attributes['font'] = nil
  f = f:match('^%s*(.-)%s*$')
  if #f == 0 or #f > 100 or not f:match('^[%w][%w ._+%-]*$') then return false end
  return f
end

local function add_style(el, f)
  local decl = "font-family: '" .. f .. "'"
  local s = el.attributes['style']
  if s ~= nil and s ~= '' then
    el.attributes['style'] = s:gsub(';%s*$', '') .. '; ' .. decl
  else
    el.attributes['style'] = decl
  end
end

local function latex_font(f)
  local arg = LATEX_SPECS[f] or ('{' .. f .. '}')
  return '\\ifcsname fontspec\\endcsname\\fontspec' .. arg .. '\\fi{}'
end

function Span(el)
  local f = take_font(el)
  if not f then return f == false and el or nil end
  if FORMAT:match('latex') then
    local out = { pandoc.RawInline('latex', '{' .. latex_font(f)) }
    for _, x in ipairs(el.content) do out[#out + 1] = x end
    out[#out + 1] = pandoc.RawInline('latex', '}')
    el.content = out
  elseif FORMAT:match('html') or FORMAT:match('epub') then
    add_style(el, f)
  elseif FORMAT == 'docx' or FORMAT == 'odt' then
    el.attributes['custom-style'] = 'Font ' .. f
  end
  return el
end

-- A code block's text as plain lines, so it takes the surrounding font.
-- Leading spaces become no-break spaces to keep YAML indentation.
local function as_lines(code)
  local lines = {}
  for line in (code.text .. '\n'):gmatch('(.-)\r?\n') do
    local indent, rest = line:match('^( *)(.*)$')
    local inl = pandoc.Inlines(rest)
    if #indent > 0 then inl:insert(1, pandoc.Str(string.rep('\u{00A0}', #indent))) end
    lines[#lines + 1] = inl
  end
  return pandoc.LineBlock(lines)
end

function Div(el)
  -- The page details ("Metadata") section, when a metadata font is chosen
  if METADATA_FONT and el.classes:includes('metadata') and el.attributes['font'] == nil then
    el.attributes['font'] = METADATA_FONT
    el.content = el.content:walk({ CodeBlock = as_lines })
  end
  local f = take_font(el)
  if not f then return f == false and el or nil end
  if FORMAT:match('latex') then
    table.insert(el.content, 1, pandoc.RawBlock('latex', '\\begingroup' .. latex_font(f)))
    el.content[#el.content + 1] = pandoc.RawBlock('latex', '\\endgroup')
  elseif FORMAT:match('html') or FORMAT:match('epub') then
    add_style(el, f)
  elseif FORMAT == 'docx' or FORMAT == 'odt' then
    -- Word and ODT don't apply a block's paragraph style to headings or line
    -- blocks, so give the text of each paragraph, heading and line the font's
    -- character style instead. Code blocks keep their own font.
    local function wrap(inlines)
      return { pandoc.Span(inlines, pandoc.Attr('', {}, { { 'custom-style', 'Font ' .. f } })) }
    end
    local function wrap_content(b) b.content = wrap(b.content); return b end
    el.content = el.content:walk({
      Para = wrap_content,
      Plain = wrap_content,
      Header = wrap_content,
      LineBlock = function(b)
        for i, line in ipairs(b.content) do b.content[i] = wrap(line) end
        return b
      end,
    })
  end
  return el
end
""".replace("__SUFFIX__", _BLOCK_STYLE_SUFFIX)

# Markdown exports keep font notes, but drop the wrapper Verbweaver puts around
# the page details section.
MARKDOWN_METADATA_UNWRAP_FILTER = r"""
function Div(el)
  if el.classes:includes('metadata') and #el.classes == 1 and #el.attributes == 0 then
    return el.content
  end
end
"""


def _lua_string(value: str) -> str:
    return json.dumps(value)  # values are ASCII-safe (validated), so JSON quoting is valid Lua


def font_filter(metadata_font: Optional[str] = None,
                latex_specs: Optional[Dict[str, Dict[str, object]]] = None) -> str:
    """The font Lua filter, set up with the metadata font and PDF font files."""
    entries = ", ".join(
        f"[{_lua_string(name)}] = {_lua_string(latex_fontspec(name, latex_specs or {}))}"
        for name in sorted(latex_specs or {})
    )
    return (FONT_FILTER
            .replace("__METADATA_FONT__", _lua_string(metadata_font) if metadata_font else "nil")
            .replace("__LATEX_SPECS__", "{" + entries + "}"))


def epub_font_css(mainfont: str) -> str:
    return f"body {{ font-family: '{mainfont}', serif; }}\n"


def friendly_font_error(stderr: str) -> Optional[str]:
    """A plain-language message when LaTeX couldn't find a font, else None."""
    stderr = stderr or ""
    m = re.search(r'The font "([^"]+)" cannot be found', stderr)
    if m:
        return (f"The font '{m.group(1)}' isn't installed on this computer. "
                "Install it, or pick another font. See Help \u2192 Fonts.")
    # xdvipdfmx (tectonic/xelatex) can't embed variable fonts
    if "Maybe variable font" in stderr or "Invalid font" in stderr:
        return ("A font in this document can't be used in PDFs because it is a \"variable\" font. "
                "Pick another font, or install the font's standard (static) version. See Help \u2192 Fonts.")
    return None


# ---------------------------------------------------------------------------
# Word and OpenDocument post-processing
# ---------------------------------------------------------------------------

def _attr(value: str) -> str:
    return _xml_escape(value, {'"': "&quot;", "'": "&apos;"})


def _style_font(style_name: str) -> Optional[str]:
    """The font named by a `Font X` / `Font X Paragraph` style, if valid."""
    if not style_name.startswith("Font "):
        return None
    name = style_name[len("Font "):]
    if name.endswith(_BLOCK_STYLE_SUFFIX):
        name = name[: -len(_BLOCK_STYLE_SUFFIX)]
    return clean_font_name(name)


def _docx_rfonts(font: str) -> str:
    f = _attr(font)
    return f'<w:rFonts w:ascii="{f}" w:hAnsi="{f}" w:cs="{f}" w:eastAsia="{f}" />'


def _patch_docx(files: Dict[str, bytes], mainfont: Optional[str]) -> None:
    if mainfont and "word/theme/theme1.xml" in files:
        theme = files["word/theme/theme1.xml"].decode("utf-8")
        theme = re.sub(
            r'(<a:(?:major|minor)Font>\s*<a:latin\s+typeface=")[^"]*(")',
            lambda m: m.group(1) + _attr(mainfont) + m.group(2),
            theme,
        )
        files["word/theme/theme1.xml"] = theme.encode("utf-8")

    if "word/styles.xml" in files:
        styles = files["word/styles.xml"].decode("utf-8")

        def fix_style(m: "re.Match[str]") -> str:
            block = m.group(0)
            name = re.search(r'<w:name\s+w:val="([^"]*)"', block)
            font = _style_font(name.group(1)) if name else None
            if not font or "<w:rFonts" in block:
                return block
            if "<w:rPr>" in block:
                return block.replace("<w:rPr>", "<w:rPr>" + _docx_rfonts(font), 1)
            return block.replace("</w:style>", f"<w:rPr>{_docx_rfonts(font)}</w:rPr></w:style>")

        styles = re.sub(r"<w:style\b[^>]*>.*?</w:style>", fix_style, styles, flags=re.S)
        files["word/styles.xml"] = styles.encode("utf-8")


def _odt_font_face(font: str) -> str:
    return (f'<style:font-face style:name="{_attr(font)}" '
            f'svg:font-family="&apos;{_attr(font)}&apos;" style:font-pitch="variable" />')


def _patch_odt(files: Dict[str, bytes], mainfont: Optional[str]) -> None:
    content = files.get("content.xml", b"").decode("utf-8")
    styles = files.get("styles.xml", b"").decode("utf-8")
    if not styles:
        return

    # Styles referenced by [text]{font="X"} (text) and ::: {font="X"} (paragraph)
    wanted: Dict[str, str] = {}  # style name -> family
    for tag, name in re.findall(r'<text:(span|p|h)\b[^>]*\btext:style-name="([^"]*)"', content):
        if _style_font(_unescape_attr(name)):
            wanted[name] = "text" if tag == "span" else "paragraph"
    fonts: Set[str] = {_style_font(_unescape_attr(n)) for n in wanted}  # type: ignore[misc]
    if mainfont:
        fonts.add(mainfont)

    # Declare the fonts
    declared = set(re.findall(r'<style:font-face\s[^>]*style:name="([^"]*)"', styles))
    new_faces = "".join(_odt_font_face(f) for f in sorted(fonts) if _attr(f) not in declared)
    if new_faces:
        if "</office:font-face-decls>" in styles:
            styles = styles.replace("</office:font-face-decls>", new_faces + "</office:font-face-decls>", 1)
        else:
            styles = styles.replace("<office:styles>",
                                    f"<office:font-face-decls>{new_faces}</office:font-face-decls><office:styles>", 1)

    if mainfont:
        # Swap every proportional font (body text, headings) for the main font.
        # Fixed-pitch fonts (code) and symbol fonts (list bullets) stay as they are.
        variable = set(re.findall(
            r'<style:font-face\b(?=[^>]*style:font-pitch="variable")[^>]*style:name="([^"]*)"', styles))
        variable.discard(_attr(mainfont))
        for name in variable:
            styles = styles.replace(f'style:font-name="{name}"', f'style:font-name="{_attr(mainfont)}"')

    defined = set(re.findall(r'<style:style\b[^>]*style:name="([^"]*)"', styles))
    new_styles = []
    for name, family in sorted(wanted.items()):
        if name in defined:
            continue
        font = _attr(_style_font(_unescape_attr(name)) or "")
        parent = ' style:parent-style-name="Text_20_body"' if family == "paragraph" else ""
        new_styles.append(
            f'<style:style style:name="{name}" style:family="{family}"{parent}>'
            f'<style:text-properties style:font-name="{font}" style:font-name-complex="{font}" '
            f'style:font-name-asian="{font}" /></style:style>'
        )
    if new_styles:
        styles = styles.replace("</office:styles>", "".join(new_styles) + "</office:styles>", 1)
    files["styles.xml"] = styles.encode("utf-8")


def _unescape_attr(value: str) -> str:
    return (value.replace("&quot;", '"').replace("&apos;", "'").replace("&#39;", "'")
            .replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&"))


def apply_fonts_to_office_file(path: str, output_format: str, mainfont: Optional[str]) -> None:
    """Give a Pandoc-made .docx/.odt its main font and the fonts of `Font X` styles."""
    if output_format not in ("docx", "odt") or not os.path.isfile(path):
        return
    with zipfile.ZipFile(path) as zin:
        infos = zin.infolist()
        files = {i.filename: zin.read(i.filename) for i in infos}
    before = dict(files)
    if output_format == "docx":
        _patch_docx(files, mainfont)
    else:
        _patch_odt(files, mainfont)
    if files == before:
        return
    fd, tmp = tempfile.mkstemp(suffix="." + output_format, dir=os.path.dirname(path))
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, "w") as zout:
            for info in infos:
                # ODF requires `mimetype` first and uncompressed; keep each entry's
                # original compression and order.
                zout.writestr(info, files[info.filename], compress_type=info.compress_type)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

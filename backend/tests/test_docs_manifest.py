"""Per-platform Help docs (docs/help-docs.json) and link integrity of the bundled docs (issue #75)."""

import json
import os
import re

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import docs

DOCS_URL = "/api/v1/docs"


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(docs.router, prefix=DOCS_URL)
    return TestClient(app)


def _write_docs(tmp_path, manifest=None):
    (tmp_path / "README.md").write_text("# Home\n", encoding="utf-8")
    (tmp_path / "guide.md").write_text("# Guide\n", encoding="utf-8")
    (tmp_path / "desktop-only.md").write_text("# Desktop Only\n", encoding="utf-8")
    if manifest is not None:
        (tmp_path / "help-docs.json").write_text(manifest, encoding="utf-8")


def test_docs_hidden_on_web_are_not_listed_or_served(tmp_path, monkeypatch):
    _write_docs(tmp_path, json.dumps({"hiddenOn": {"web": ["Desktop-Only.md"], "desktop": ["guide.md"]}}))
    monkeypatch.setattr(docs, "DOCS_DIR", str(tmp_path))
    client = _client()

    names = [d["name"] for d in client.get(DOCS_URL).json()]

    assert names == ["README.md", "guide.md"]
    assert client.get(f"{DOCS_URL}/desktop-only.md").status_code == 404
    assert client.get(f"{DOCS_URL}/guide.md").status_code == 200


def test_missing_or_broken_manifest_hides_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(docs, "DOCS_DIR", str(tmp_path))
    _write_docs(tmp_path)
    assert len(_client().get(DOCS_URL).json()) == 3

    (tmp_path / "help-docs.json").write_text("{not json", encoding="utf-8")
    assert len(_client().get(DOCS_URL).json()) == 3
    assert _client().get(f"{DOCS_URL}/desktop-only.md").status_code == 200


# --- The real docs folder ---------------------------------------------------------------

REPO_DOCS = os.path.abspath(docs.DOCS_DIR)
_LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
_FENCE_RE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$")


def _prose_lines(text):
    """Lines outside fenced code blocks."""
    fence = None
    for line in text.splitlines():
        m = _FENCE_RE.match(line)
        if m:
            marker = m.group(1)
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence):
                fence = None
            continue
        if fence is None:
            yield line


def _slug(heading):
    """Matches slugify() in frontend/src/pages/Help.tsx for plain and lightly formatted headings."""
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", heading)  # [text](link) -> text
    text = re.sub(r"[`*]", "", text)
    text = re.sub(r"[^\w\s-]|_", "", text.strip().lower())
    return re.sub(r"\s+", "-", text)


def _doc_text(name):
    with open(os.path.join(REPO_DOCS, name), encoding="utf-8") as f:
        return f.read()


def _anchors(name):
    return {_slug(m.group(1)) for line in _prose_lines(_doc_text(name)) if (m := _HEADING_RE.match(line))}


def _hidden():
    with open(os.path.join(REPO_DOCS, "help-docs.json"), encoding="utf-8") as f:
        hidden_on = json.load(f)["hiddenOn"]
    return {platform: {n.lower() for n in names} for platform, names in hidden_on.items()}


def test_manifest_lists_only_existing_docs():
    existing = {n.lower() for n in os.listdir(REPO_DOCS) if n.endswith(".md")}
    for platform, names in _hidden().items():
        assert names <= existing, f"{platform}: {sorted(names - existing)} not in docs/"


def test_links_in_bundled_docs_resolve_and_respect_platforms():
    """Every relative link points at an existing doc, heading or image, and a doc shown on a
    platform never links to a doc hidden there (it would render as dead text in Help)."""
    hidden = _hidden()
    problems = []
    md_files = sorted(n for n in os.listdir(REPO_DOCS) if n.endswith(".md"))
    for name in md_files:
        for line in _prose_lines(_doc_text(name)):
            for target in _LINK_RE.findall(line):
                if re.match(r"^[a-z]+:", target):
                    continue  # http:, https:, mailto:
                path, _, anchor = target.partition("#")
                path = path.removeprefix("./")
                if not path:
                    if anchor and anchor not in _anchors(name):
                        problems.append(f"{name}: no heading for #{anchor}")
                    continue
                if not os.path.exists(os.path.join(REPO_DOCS, path)):
                    problems.append(f"{name}: missing {path}")
                    continue
                if path.endswith(".md"):
                    if anchor and anchor not in _anchors(path):
                        problems.append(f"{name}: {path} has no heading for #{anchor}")
                    for platform, names in hidden.items():
                        if name.lower() not in names and path.lower() in names:
                            problems.append(f"{name}: links to {path}, which is hidden on {platform}")
    assert not problems, "\n".join(problems)

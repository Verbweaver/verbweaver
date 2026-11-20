"""Help view lists documentation pages by their first H1, README first (issue #70)."""

import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import docs
from app.api.v1.endpoints.docs import _extract_doc_title


@pytest.mark.parametrize(
    "content, expected",
    [
        ("# Getting Started\n\nBody", "Getting Started"),
        ("Intro line\n\n# Later Title\n", "Later Title"),
        ("---\ntitle: meta\n# not a heading in yaml\n---\n# Real Title\n", "Real Title"),
        ("```bash\n# a shell comment\n```\n# After Fence\n", "After Fence"),
        ("~~~\n# tilde fenced\n~~~\n# After Tilde\n", "After Tilde"),
        ("# Closed Heading ##\n", "Closed Heading"),
        ("   # Indented Heading\n", "Indented Heading"),
        ("## Only a Subheading\n", "fallback.md"),
        ("#NoSpace\n", "fallback.md"),
        ("", "fallback.md"),
        ("Plain text only\n", "fallback.md"),
    ],
)
def test_extract_doc_title(content, expected):
    assert _extract_doc_title(content, "fallback.md") == expected


DOCS_URL = "/api/v1/docs"  # bare FastAPI() serves Swagger UI at /docs


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(docs.router, prefix=DOCS_URL)
    return TestClient(app)


def test_list_uses_titles_with_readme_first_and_filename_fallback(tmp_path, monkeypatch):
    (tmp_path / "zeta.md").write_text("# Alpha Guide\n", encoding="utf-8")
    (tmp_path / "README.md").write_text("# Zulu Overview\n", encoding="utf-8")
    (tmp_path / "beta.md").write_text("# bravo lowercase\n", encoding="utf-8")
    (tmp_path / "no-heading.md").write_text("Just text\n", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("# Ignored\n", encoding="utf-8")
    (tmp_path / "images").mkdir()
    monkeypatch.setattr(docs, "DOCS_DIR", str(tmp_path))

    resp = _client().get(DOCS_URL)

    assert resp.status_code == 200
    assert [(d["name"], d["title"]) for d in resp.json()] == [
        ("README.md", "Zulu Overview"),
        ("zeta.md", "Alpha Guide"),
        ("beta.md", "bravo lowercase"),
        ("no-heading.md", "no-heading.md"),
    ]
    assert all(d["path"] == d["name"] and d["type"] == "file" for d in resp.json())


def test_bundled_docs_are_listed_by_their_h1():
    """Every shipped doc in <repo>/docs is titled by its own first H1."""
    resp = _client().get(DOCS_URL)
    assert resp.status_code == 200
    entries = resp.json()
    assert entries, "expected bundled docs"
    assert entries[0]["name"] == "README.md"
    rest_titles = [d["title"].casefold() for d in entries[1:]]
    assert rest_titles == sorted(rest_titles)
    for d in entries:
        with open(os.path.join(docs.DOCS_DIR, d["name"]), encoding="utf-8") as f:
            first_h1 = next(line[2:].strip() for line in f if line.startswith("# "))
        assert d["title"] == first_h1


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def _docs_with_image(tmp_path, monkeypatch):
    (tmp_path / "images").mkdir()
    (tmp_path / "images" / "graph.png").write_bytes(PNG_BYTES)
    (tmp_path / "secret.png").write_bytes(PNG_BYTES)  # outside images/
    (tmp_path / "images" / "notes.txt").write_text("not an image", encoding="utf-8")
    monkeypatch.setattr(docs, "DOCS_DIR", str(tmp_path))


def test_image_is_served_with_its_media_type(tmp_path, monkeypatch):
    _docs_with_image(tmp_path, monkeypatch)

    resp = _client().get(f"{DOCS_URL}/images/graph.png")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert resp.content == PNG_BYTES


@pytest.mark.parametrize(
    "name, status",
    [
        ("missing.png", 404),
        ("notes.txt", 400),  # not an image type
        ("..%5Csecret.png", 400),  # backslash traversal out of images/
    ],
)
def test_image_route_rejects_missing_and_non_images(tmp_path, monkeypatch, name, status):
    _docs_with_image(tmp_path, monkeypatch)

    resp = _client().get(f"{DOCS_URL}/images/{name}")

    assert resp.status_code == status


@pytest.mark.parametrize("name", ["..%2Fsecret.png", "%2E%2E%2Fsecret.png", "../secret.png"])
def test_image_route_never_serves_files_outside_images(tmp_path, monkeypatch, name):
    _docs_with_image(tmp_path, monkeypatch)

    resp = _client().get(f"{DOCS_URL}/images/{name}")

    assert resp.status_code >= 400
    assert resp.content != PNG_BYTES

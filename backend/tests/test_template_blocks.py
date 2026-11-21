"""Nested $if$/$for$ block rendering in compiler templates (issue #135)."""

import pytest

from app.services.template_service import _item_or, _render_blocks, _resolve_dotted

DATA = {
    "yes": True,
    "no": False,
    "empty": "",
    "words": ["a", "b", "c"],
    "people": [
        {"name": "Ann", "skills": ["x", "y"], "lead": True},
        {"name": "Ben", "skills": [], "lead": False},
    ],
    "meta": {"k1": "v1", "k2": "v2"},
}


def render(text, data=DATA, defer=lambda kind, expr: False, unresolved_loop=None):
    return _render_blocks(text, _item_or(lambda e: _resolve_dotted(e, data)), defer, unresolved_loop)


@pytest.mark.parametrize("template, expected", [
    # nesting and $else$ at every level
    ("$if(yes)$A$if(no)$B$else$C$if(yes)$D$endif$$endif$E$endif$", "ACDE"),
    ("$if(no)$X$if(yes)$Y$endif$$else$Z$endif$", "Z"),
    ("$ifnot(no)$1$ifnot(yes)$2$else$3$endif$4$endif$", "134"),
    # truthiness: empty string and missing values are false
    ("$if(empty)$E$else$not-empty$endif$|$if(missing.path)$M$else$none$endif$", "not-empty|none"),
    # loops, $sep$, and loops inside loops
    ("$for(words)$$it$$sep$-$endfor$", "a-b-c"),
    ("$for(people)$$it.name$($for(it.skills)$$it$$sep$+$endfor$)$sep$ $endfor$", "Ann(x+y) Ben()"),
    ("$for(people)$[$for(words)$$it$$endfor$]$endfor$", "[abc][abc]"),
    ("$for(meta)$$it.key$=$it.value$$sep$;$endfor$", "k1=v1;k2=v2"),
    # $if$ on the loop item, with $else$
    ("$for(people)$$if(it.lead)$*$it.name$$else$$it.name$$endif$$sep$,$endfor$", "*Ann,Ben"),
    # an inner loop item doesn't hide the outer item's other fields
    ("$for(people)$$for(words)$$it.name$$endfor$$sep$|$endfor$", "AnnAnnAnn|BenBenBen"),
])
def test_nested_blocks(template, expected):
    assert render(template) == expected


def test_unmatched_tags_are_kept_as_text():
    assert render("A$endif$B$endfor$C") == "A$endif$B$endfor$C"
    assert render("A$else$B$sep$C") == "A$else$B$sep$C"
    assert render("before $if(yes)$ never closed") == "before $if(yes)$ never closed"
    assert render("$if(yes)$X$endfor$Y$endif$") == "X$endfor$Y"


def test_deferred_blocks_keep_their_tags_but_render_their_contents():
    defer = lambda kind, expr: expr.startswith("nodes.")
    out = render("$if(nodes.x)$[$if(yes)$Y$endif$$if(no)$N$endif$]$else$E$endif$", defer=defer)
    assert out == "$if(nodes.x)$[Y]$else$E$endif$"
    # The technical report's appendix pattern: the outer document-level block is decided now,
    # and the node-level block inside it is left intact for the per-node step
    out = render("$if(words)$## Appendices\n$if(nodes.vars.appendix)$A$endif$\n$endif$", defer=defer)
    assert out == "## Appendices\n$if(nodes.vars.appendix)$A$endif$\n"


def test_it_without_an_item_is_left_for_later():
    assert render("$if(it.x)$X$endif$") == "$if(it.x)$X$endif$"


def test_unresolved_loop_marker():
    out = render("$for(missing)$x$endfor$", unresolved_loop=lambda e: f"<!-- unresolved: {e} -->")
    assert out == "<!-- unresolved: missing -->"

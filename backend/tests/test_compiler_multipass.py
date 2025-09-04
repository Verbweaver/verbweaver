import os
import textwrap

from app.api.v1.endpoints.compiler import ContentAggregator


def write_file(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


def test_multipass_node_id_includes_and_loops(tmp_path):
    project_root = str(tmp_path)
    # Template that renders nodes and their content
    template_md = textwrap.dedent(
        """
        ---
        title: Test
        ---

        # $title$

        $for(nodes)$
        ## $nodes.title$

        $nodes.content$

        $endfor$
        """
    ).strip()
    write_file(os.path.join(project_root, 'templates', 'compiler', 'markdown', 'simple.md'), template_md)

    # Node B (referenced)
    node_b = textwrap.dedent(
        """
        ---
        id: node-b
        title: Node B
        task:
          files:
            - { name: "evidence.png", size: 1024, mimeType: "image/png", path: "assets/evidence.png" }
        ---

        This is B body.
        """
    ).lstrip()
    write_file(os.path.join(project_root, 'nodes', 'b.md'), node_b)

    # Node A references B's content and attachments and also reuses nodes loop
    node_a = textwrap.dedent(
        """
        ---
        id: node-a
        title: Node A
        ---

        A body before include.

        $node-node-b.content$

        $if(node-node-b.attachments)$
        ### Files in B
        $for(node-node-b.attachments)$
        - $it.name$
        $endfor$
        $endif$

        Titles again:
        $for(nodes)$
        - $nodes.title$
        $endfor$
        """
    ).lstrip()
    write_file(os.path.join(project_root, 'nodes', 'a.md'), node_a)

    # Add an asset path referenced by B (not strictly needed for test, but safe)
    os.makedirs(os.path.join(project_root, 'assets'), exist_ok=True)
    write_file(os.path.join(project_root, 'assets', 'evidence.png'), '')

    agg = ContentAggregator(project_root)
    options = {
        'format': 'markdown',
        'includeMetadata': False,
        'embedUploadedFiles': False,
        'maxVariablePasses': 5,
        'reprocessNodesInPasses': True,
        'showUnresolvedMarkers': False,
        'includeToc': False
    }

    out = agg.aggregate_content(
        node_paths=['nodes/a.md', 'nodes/b.md'],
        options=options,
        template_path='markdown/simple.md',
        custom_variables={},
        node_variables={}
    )

    # Contains B content via node-id include
    assert 'This is B body.' in out
    # Contains attachments list rendered via loop
    assert '### Files in B' in out
    assert '- evidence.png' in out
    # Contains titles reprocessed from nodes loop in later pass
    assert '- Node A' in out and '- Node B' in out


def test_unresolved_markers_option(tmp_path):
    project_root = str(tmp_path)
    template_md = textwrap.dedent(
        """
        ---
        title: Test
        ---
        $for(nodes)$
        $nodes.content$
        $endfor$
        """
    ).strip()
    write_file(os.path.join(project_root, 'templates', 'compiler', 'markdown', 'simple.md'), template_md)

    node_a = textwrap.dedent(
        """
        ---
        id: node-a
        title: Node A
        ---

        Missing ref: $node-node-missing.vars.foo$
        """
    ).lstrip()
    write_file(os.path.join(project_root, 'nodes', 'a.md'), node_a)

    agg = ContentAggregator(project_root)
    options = {
        'format': 'markdown',
        'includeMetadata': False,
        'embedUploadedFiles': False,
        'maxVariablePasses': 2,
        'reprocessNodesInPasses': True,
        'showUnresolvedMarkers': True,
        'includeToc': False
    }

    out = agg.aggregate_content(
        node_paths=['nodes/a.md'],
        options=options,
        template_path='markdown/simple.md',
        custom_variables={},
        node_variables={}
    )

    assert '<!-- unresolved: node-node-missing.vars.foo -->' in out



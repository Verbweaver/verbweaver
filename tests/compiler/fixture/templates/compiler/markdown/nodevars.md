---
nodeVariables:
  owner: { type: string, path: metadata.owner }
  reviewer: { type: string, default: NOBODY }
  approved: { type: boolean, default: false }
---
# $title$

$for(nodes)$
## $nodes.title$
OWNER-$nodes.vars.owner$ REVIEWER-$nodes.vars.reviewer$ APPROVED-$nodes.vars.approved$
$endfor$

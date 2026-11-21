---
nodeVariables:
  owner: { type: string, path: metadata.owner }
---
# $title$

$for(nodes)$
## NODE $nodes.title$

CONTENT[$nodes.content$]

OWNER-META $nodes.metadata.owner$

$if(nodes.metadata.verified)$IS-VERIFIED $nodes.title$$endif$
$ifnot(nodes.metadata.verified)$NOT-VERIFIED $nodes.title$$endif$

$if(nodes.metadata)$
$for(nodes.metadata)$
- META $it.key$ = $it.value$
$endfor$
$endif$

$if(nodes.attachments)$
ATT-LIST
$nodes.attachments$
$for(nodes.attachments)$
- ATT $it.name$ SIZE $it.size$
$endfor$
$endif$

$if(nodes.vars)$
$for(nodes.vars)$
- VAR $it.key$ = $it.value$
$endfor$
$endif$
$endfor$

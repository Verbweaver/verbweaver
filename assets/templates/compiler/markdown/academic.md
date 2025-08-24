---
title: $title$
author: $author$
date: $date$
variables:
  includeMetadata:
    type: boolean
    description: Show each node's metadata under its content.
---

# $title$

$for(nodes)$
## $nodes.title$

$nodes.content$

$if(nodes.vars)$
### Variables
$for(nodes.vars)$
- **$it.key$:** $it.value$
$endfor$
$endif$

$if(includeMetadata)$
$if(nodes.metadata)$
### Metadata
$for(nodes.metadata)$
- **$it.key$:** $it.value$
$endfor$
$endif$
$endif$

$if(nodes.attachments)$
### Attachments
$for(nodes.attachments)$
- $it.name$ ($it.size$)
$endfor$
$endif$

$endfor$



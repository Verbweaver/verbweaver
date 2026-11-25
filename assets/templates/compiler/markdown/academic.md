---
title: $title$
author: $author$
date: $date$
# Page layout, used by PDF and HTML exports. The Compiler's Layout settings
# override these; "Template default" keeps them.
papersize: a4
fontsize: 12pt
geometry: margin=2.5cm
linestretch: 1.5
# mainfont: Georgia   # main font; the font must be installed
# metadatafont: Carlito   # font for the Metadata sections
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
::: {.metadata}
### Metadata
$for(nodes.metadata)$
- **$it.key$:** $it.value$
$endfor$
:::
$endif$
$endif$

$if(nodes.attachments)$
### Attachments
$for(nodes.attachments)$
- $it.name$ ($it.size$)
$endfor$
$endif$

$endfor$



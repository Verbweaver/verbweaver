---
title: $title$
author: $author$
date: $date$
# Page layout, used by PDF and HTML exports. The Compiler's Layout settings
# override these; "Template default" keeps them.
papersize: a4
fontsize: 11pt
geometry: margin=2.5cm
linestretch: 1.2
variables:
---

# $title$

$for(nodes)$
## $nodes.title$

$nodes.content$

$if(nodes.vars)$
### Variables
$for(nodes.vars)$
- $it.key$: $it.value$
$endfor$
$endif$

$endfor$



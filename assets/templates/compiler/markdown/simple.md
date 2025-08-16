---
title: $title$
author: $author$
date: $date$
variables:
  toc:
    type: boolean
    description: Include a generated table of contents at the top.
---

# $title$

$if(toc)$
## Table of Contents
$toc$
$endif$

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



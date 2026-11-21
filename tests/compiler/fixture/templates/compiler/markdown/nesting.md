---
variables:
  a: { type: boolean, default: true }
  b: { type: boolean, default: false }
  c: { type: boolean, default: true }
  teams:
    type: array
    item:
      type: object
      fields:
        name: { type: string }
        lead: { type: boolean }
nodeVariables:
  owner: { type: string }
---
# $title$

L1: $if(a)$A[$if(b)$B-WRONG$else$NOT-B[$if(c)$C$endif$]$endif$]$else$A-WRONG$endif$

L2: $ifnot(b)$X$ifnot(a)$A-WRONG$else$Y$endif$Z$endif$

IT-IF: $for(teams)$$if(it.lead)$LEAD-$it.name$$else$MEMBER-$it.name$$endif$$sep$, $endfor$

$for(nodes)$
## $nodes.title$
$if(nodes.metadata.verified)$
VERIFIED[$if(nodes.vars.owner)$OWNED-BY-$nodes.vars.owner$$else$UNOWNED$endif$]
$else$
UNVERIFIED[$for(nodes.metadata.tags)$#$it$$sep$ $endfor$]
$endif$
$if(a)$DOC-IN-NODE-$nodes.title$$endif$
$endfor$

---
variables:
  flagOn: { type: boolean, default: true }
  flagOff: { type: boolean, default: false }
  outer: { type: boolean, default: true }
  inner: { type: boolean, default: false }
---
# $title$

$if(flagOn)$IF-TRUE-SHOWN$endif$

$if(flagOff)$IF-FALSE-SHOWN$endif$

$ifnot(flagOff)$IFNOT-SHOWN$endif$

$if(flagOff)$ELSE-IF-BRANCH$else$ELSE-BRANCH-SHOWN$endif$

$if(outer)$OUTER-START $if(inner)$INNER-SHOWN$endif$ OUTER-END$endif$

$if(nosuchvar)$MISSING-SHOWN$endif$

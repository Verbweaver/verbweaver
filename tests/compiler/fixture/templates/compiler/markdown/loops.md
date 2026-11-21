---
variables:
  colours:
    type: array
    item: { type: string }
    default: [red, green, blue]
  people:
    type: array
    item:
      type: object
      fields:
        name: { type: string }
        role: { type: string }
---
# $title$

PRIMS: $for(colours)$[$it$]$endfor$

SEP: $for(colours)$$it$$sep$, $endfor$

OBJS:

$for(people)$
- PERSON $it.name$ is $it.role$
$endfor$

NESTED: $for(people)$[$it.name$:$for(colours)$$it$$endfor$]$endfor$

---
variables:
  version: { type: string, default: "1.0" }
  pages: { type: number, min: 1, max: 500, default: 12 }
  draft: { type: boolean, default: true }
  status: { type: string, enum: [Draft, Final], default: Final }
  owners:
    type: array
    item:
      type: object
      fields:
        name: { type: string }
        email: { type: string }
    default:
      - { name: Dana, email: dana@example.com }
  raci:
    type: table
    columnsDefault: [Task, Responsible, Accountable]
    columnTypes:
      Responsible: { type: enum, enum: [Alice, Bob] }
---
# $title$

VERSION-$version$ PAGES-$pages$ STATUS-$status$

$if(draft)$DRAFT-ON$endif$

$for(owners)$
- OWNER $it.name$ ($it.email$)
$endfor$

TABLE-NESTED:

$raci.markdown$

TABLE-TOP:

$raci_markdown$

HEADERLINE: $raci_headerLine$


ROWS:
$for(raci_rows)$
- ROW $it.line$
$endfor$

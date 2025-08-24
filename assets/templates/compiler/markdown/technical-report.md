---
title: $title$
author: $author$
date: $date$
summary: $summary$
variables:
  summary:
    type: string
    description: Executive summary paragraph.
  changelog:
    type: array
    item:
      type: object
      fields:
        date: { type: string }
        version: { type: string }
        author: { type: string }
        note: { type: string }
  stakeholders:
    type: array
    item:
      type: object
      fields:
        name: { type: string }
        role: { type: string }
        contact: { type: string }
  raci:
    type: array
    item:
      type: object
      fields:
        task: { type: string }
        r: { type: string }
        a: { type: string }
        c: { type: string }
        i: { type: string }
nodeVariables:
  appendix:
    type: boolean
    label: Appendix
    description: Treat this node as an appendix section
    path: metadata.appendix
    default: false
  cvss_vector:
    type: string
    description: Optional CVSS v3 vector string from node metadata.
    path: metadata.cvss_vector
  cvss:
    type: number
    description: Optional CVSS base score from node metadata.
    path: metadata.cvss
---

# $title$

## Executive Summary

$summary$

## Document Changelog

| Date | Version | Author | Change |
|------|---------|--------|--------|
$for(changelog)$
| $it.date$ | $it.version$ | $it.author$ | $it.note$ |
$endfor$

## Stakeholder Registry

| Name | Role | Contact |
|------|------|---------|
$for(stakeholders)$
| $it.name$ | $it.role$ | $it.contact$ |
$endfor$

## RACI Matrix

| Task | R | A | C | I |
|------|---|---|---|---|
$for(raci)$
| $it.task$ | $it.r$ | $it.a$ | $it.c$ | $it.i$ |
$endfor$

$for(nodes)$
$ifnot(nodes.vars.appendix)$
## $nodes.title$

$nodes.content$
$endif$
$endfor$

$if(nodes)$
## Appendices
$for(nodes)$
$if(nodes.vars.appendix)$
### $nodes.title$

$nodes.content$
$endif$
$endfor$
$endif$



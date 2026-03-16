# Release Policy

## Purpose

This document defines how milestone tags and releases are created in the banking-platform repository.

---

## Release intent

Releases should communicate:

- what is included
- what is intentionally excluded
- what was validated
- what risks remain open
- what evidence supports the release

A release tag is a technical milestone, not marketing language.

---

## Release classes

### Core milestone
Example:
- `v0.8.0-core-stable`

Represents:
- stable architecture milestone
- validated core platform capabilities
- strong technical baseline
- known next-stage work still pending

---

### Ops hardened milestone
Example:
- `v0.9.0-ops-hardened`

Represents:
- stable core
- operational runbooks in place
- internal access controls improved
- performance/scalability validation completed

---

### Production-grade milestone
Example:
- `v1.0.0`

Represents:
- core + operational readiness + governance + performance + release discipline
- only appropriate once remaining operational and control stages are complete

---

## Release requirements

Before creating a release tag, confirm:

- working tree is clean
- correct branch/commit is selected
- project status reflects the release state
- relevant validation has already passed
- the release notes do not overstate readiness

---

## Required release notes sections

Each release should include:

- summary
- included capabilities
- excluded capabilities / pending stages
- validation completed
- evidence statement
- next steps

---

## Tagging discipline

Tags should be:

- explicit
- stable
- easy to interpret
- aligned with validated project state

Avoid tags that imply full readiness when significant operational/control/performance stages remain open.

---

## Example rule

It is acceptable to create:

- `v0.8.0-core-stable`

after Stage 8E when the core, resilience, and recovery verification are in place.

It is not acceptable to create:

- `v1.0.0`
- `production-ready`
- `bank-ready`

before stages covering operational runbooks, internal access control, and controlled scalability are complete.

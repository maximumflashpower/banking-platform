# Stage Gate Policy

## Purpose

This document defines the minimum closure criteria for a project stage.

---

## Rule

A stage is not considered complete until it is represented in the repository by both implementation and evidence.

---

## Minimum gate for stage closure

Each stage should have, where applicable:

1. **Intent**
   - what the stage is solving
   - why it exists

2. **Design**
   - architecture notes or design doc
   - constraints and safety assumptions

3. **Implementation**
   - code/scripts/docs required by the stage

4. **Validation commands**
   - exact commands that can be rerun

5. **Expected results**
   - success conditions
   - failure conditions if relevant

6. **Evidence**
   - logs, reports, chain verification, restore proof, or other retained artifacts

7. **Context updates**
   - `PROJECT_STATUS.md`
   - `STAGE_HISTORY.md`

8. **Rollback / recovery awareness**
   - what to restore or revert if something goes wrong

---

## Stage classification guidance

### Pure documentation stage
May close with:
- documents
- templates
- review

### Operational stage
Must close with:
- scripts/runbooks
- executable validation
- evidence retained

### Runtime stage
Must close with:
- code changes
- service validation
- smoke/regression tests
- evidence verification where relevant

### Critical financial/security stage
Must close with:
- all of the above
- stricter rollback clarity
- evidence chain or integrity validation where applicable

---

## Repository truth rule

Stage closure must be understandable from repository artifacts alone.

Chat history is helpful, but not sufficient as the system of record.

---

## Recommended closeout pattern

- update implementation
- run validations
- retain evidence
- update status/history
- commit with stage-specific message
- open PR with scope, risk, validation, and evidence

# RUNBOOK — Audit Evidence Verification

## Purpose

Verify immutable audit chain integrity.

---

## Evidence endpoint

GET /internal/v1/audit/evidence

---

## Verification command

cd ~/projects/banking-platform

python3 - <<'PY'
import json, urllib.request
data = json.load(urllib.request.urlopen("http://localhost:3000/internal/v1/audit/evidence?limit=100"))
print("chain_verified =", data.get("chain_verified"))
print(sorted({item.get("event_type") for item in data.get("items", [])}))
PY

---

## Expected baseline

chain_verified = True

# RUNBOOK — Incident Response

## Purpose

Provide a repeatable operational procedure for handling incidents affecting the banking-platform.

---

## Incident triggers

- API unavailable
- repeated 5xx errors
- database connectivity failure
- smoke tests failing
- evidence endpoint unavailable

---

## Step 1 — Capture system state

cd ~/projects/banking-platform
bash scripts/system_snapshot.sh

---

## Step 2 — Inspect containers

docker compose ps

docker compose logs --tail=200 api

docker compose logs --tail=200 db

---

## Step 3 — Verify API health

curl -fsS http://localhost:3000/health

---

## Step 4 — Verify database

docker compose exec -T db psql -U app -lqt

---

## Step 5 — Run smoke tests

cd ~/projects/banking-platform

bash scripts/stage7c_smoke_test.sh
bash scripts/stage7d_smoke_test.sh
bash scripts/stage8b_audit_smoke_test.sh
bash scripts/stage8d_kill_switches_smoke_test.sh

---

## Step 6 — Verify audit evidence

python3 - <<'PY'
import json, urllib.request
data = json.load(urllib.request.urlopen("http://localhost:3000/internal/v1/audit/evidence?limit=100"))
print("chain_verified =", data.get("chain_verified"))
PY

Expected:

chain_verified = True

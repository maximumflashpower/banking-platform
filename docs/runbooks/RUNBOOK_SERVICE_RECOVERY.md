# RUNBOOK — Service Recovery

## Purpose

Recover the banking-platform service stack in a controlled way.

---

## Step 1 — Capture snapshot

cd ~/projects/banking-platform
bash scripts/system_snapshot.sh

---

## Step 2 — Inspect system

docker compose ps
docker compose logs --tail=200 api

---

## Step 3 — Rebuild API

cd ~/projects/banking-platform
docker compose up -d --build api

---

## Step 4 — Wait for health

curl -fsS http://localhost:3000/health

---

## Step 5 — Run regression tests

cd ~/projects/banking-platform

bash scripts/stage7c_smoke_test.sh
bash scripts/stage7d_smoke_test.sh
bash scripts/stage8b_audit_smoke_test.sh
bash scripts/stage8d_kill_switches_smoke_test.sh

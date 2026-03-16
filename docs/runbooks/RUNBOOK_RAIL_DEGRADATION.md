# RUNBOOK — Rail Degradation

## Purpose

Validate ACH and cards rail degradation behavior.

---

## Rails controls

RAILS_ACH_ENABLED
RAILS_CARDS_ENABLED

---

## ACH disabled test

cd ~/projects/banking-platform

RAILS_ACH_ENABLED=false RAILS_CARDS_ENABLED=true docker compose up -d --build api

curl -X POST http://localhost:3000/internal/v1/payments/rails/ach/submit

Expected:

HTTP 503
rail_disabled

---

## Cards disabled test

cd ~/projects/banking-platform

RAILS_ACH_ENABLED=true RAILS_CARDS_ENABLED=false docker compose up -d --build api

curl -X POST http://localhost:3000/internal/v1/cards/auth-decision

Expected:

HTTP 200
decline response

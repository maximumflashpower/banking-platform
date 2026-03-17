#!/usr/bin/env bash
set -euo pipefail

echo "== Stage 1 identity smoke =="

node --test services/identity/tests/*.test.js
node --test services/gateway-api/tests/*.test.js

bash scripts/stage7c_smoke_test.sh
bash scripts/stage7d_smoke_test.sh
bash scripts/stage8d_kill_switches_smoke_test.sh

echo "OK Stage 1 identity smoke validated"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export BASE_URL="${BASE_URL:-http://localhost:3000}"

bash "${ROOT_DIR}/scripts/stage7d_smoke_test.sh"
#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
HEALTH_URL="${HEALTH_URL:-$BASE_URL/health}"
AUDIT_URL="${AUDIT_URL:-$BASE_URL/internal/v1/audit/evidence?limit=5}"

EXPECTED_SOCIAL="${EXPECTED_SOCIAL:-}"
EXPECTED_PERSONAL="${EXPECTED_PERSONAL:-}"
EXPECTED_BUSINESS="${EXPECTED_BUSINESS:-}"
EXPECTED_RISK="${EXPECTED_RISK:-}"
EXPECTED_LEDGER="${EXPECTED_LEDGER:-}"
EXPECTED_IDENTITY="${EXPECTED_IDENTITY:-}"
EXPECTED_FINANCIAL_INBOX="${EXPECTED_FINANCIAL_INBOX:-}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

section() {
  echo
  echo "========== $* =========="
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

json_get() {
  local file="$1"
  local path="$2"
  python3 - "$file" "$path" <<'PY'
import json, sys

file_path = sys.argv[1]
path = sys.argv[2]

with open(file_path, "r", encoding="utf-8") as fh:
    data = json.load(fh)

cur = data
for part in path.split("."):
    if isinstance(cur, dict) and part in cur:
        cur = cur[part]
    else:
        print("")
        sys.exit(0)

if isinstance(cur, bool):
    print("true" if cur else "false")
elif cur is None:
    print("")
else:
    print(cur)
PY
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label mismatch: expected '$expected' got '$actual'"
  fi
  echo "OK $label = $actual"
}

assert_nonempty() {
  local value="$1"
  local label="$2"
  [[ -n "$value" ]] || fail "$label is empty"
  echo "OK $label present: $value"
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

health_json="$tmp_dir/health.json"
audit_json="$tmp_dir/audit.json"

require_cmd curl
require_cmd python3

section "health endpoint reachable"
curl -fsS "$HEALTH_URL" -o "$health_json" || fail "health endpoint unreachable: $HEALTH_URL"
cat "$health_json"

section "top-level health validation"
health_ok="$(json_get "$health_json" "ok")"
assert_eq "$health_ok" "true" "health.ok"

service_name="$(json_get "$health_json" "service")"
assert_nonempty "$service_name" "health.service"

section "segmented domain health presence"
identity_state="$(json_get "$health_json" "domains.identity")"
social_state="$(json_get "$health_json" "domains.social")"
personal_state="$(json_get "$health_json" "domains.personal_finance")"
business_state="$(json_get "$health_json" "domains.business_finance")"
risk_state="$(json_get "$health_json" "domains.risk")"
ledger_state="$(json_get "$health_json" "domains.ledger")"
financial_inbox_state="$(json_get "$health_json" "domains.financial_inbox")"

assert_nonempty "$identity_state" "domains.identity"
assert_nonempty "$social_state" "domains.social"
assert_nonempty "$personal_state" "domains.personal_finance"
assert_nonempty "$business_state" "domains.business_finance"
assert_nonempty "$risk_state" "domains.risk"
assert_nonempty "$ledger_state" "domains.ledger"
assert_nonempty "$financial_inbox_state" "domains.financial_inbox"

section "domain health values"
echo "identity        => $identity_state"
echo "social          => $social_state"
echo "personal_finance=> $personal_state"
echo "business_finance=> $business_state"
echo "risk            => $risk_state"
echo "ledger          => $ledger_state"
echo "financial_inbox => $financial_inbox_state"

section "optional exact expectations"
[[ -z "$EXPECTED_IDENTITY" ]] || assert_eq "$identity_state" "$EXPECTED_IDENTITY" "domains.identity"
[[ -z "$EXPECTED_SOCIAL" ]] || assert_eq "$social_state" "$EXPECTED_SOCIAL" "domains.social"
[[ -z "$EXPECTED_PERSONAL" ]] || assert_eq "$personal_state" "$EXPECTED_PERSONAL" "domains.personal_finance"
[[ -z "$EXPECTED_BUSINESS" ]] || assert_eq "$business_state" "$EXPECTED_BUSINESS" "domains.business_finance"
[[ -z "$EXPECTED_RISK" ]] || assert_eq "$risk_state" "$EXPECTED_RISK" "domains.risk"
[[ -z "$EXPECTED_LEDGER" ]] || assert_eq "$ledger_state" "$EXPECTED_LEDGER" "domains.ledger"
[[ -z "$EXPECTED_FINANCIAL_INBOX" ]] || assert_eq "$financial_inbox_state" "$EXPECTED_FINANCIAL_INBOX" "domains.financial_inbox"

section "capability switch hints from environment"
echo "SOCIAL_CHAT_ENABLED=${SOCIAL_CHAT_ENABLED:-<unset>}"
echo "PERSONAL_BANKING_ENABLED=${PERSONAL_BANKING_ENABLED:-<unset>}"
echo "BUSINESS_BANKING_ENABLED=${BUSINESS_BANKING_ENABLED:-<unset>}"
echo "FINANCIAL_INBOX_ENABLED=${FINANCIAL_INBOX_ENABLED:-<unset>}"

section "audit chain still reachable"
curl -fsS "$AUDIT_URL" -o "$audit_json" || fail "audit endpoint unreachable: $AUDIT_URL"
cat "$audit_json"

audit_ok="$(json_get "$audit_json" "ok")"
assert_eq "$audit_ok" "true" "audit.ok"

chain_verified="$(json_get "$audit_json" "chain_verified")"
assert_eq "$chain_verified" "true" "audit.chain_verified"

items_count="$(json_get "$audit_json" "count")"
assert_nonempty "$items_count" "audit.count"

section "summary"
echo "Stage 0 smoke test PASS"

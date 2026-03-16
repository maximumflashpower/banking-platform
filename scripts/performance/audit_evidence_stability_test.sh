#!/usr/bin/env bash
set -e

URL="http://localhost:3000/internal/v1/audit/evidence?limit=50"

echo "Running audit evidence stability test"

for i in {1..50}
do
  curl -fsS "$URL" > /dev/null
done

echo "Audit endpoint stability test complete"

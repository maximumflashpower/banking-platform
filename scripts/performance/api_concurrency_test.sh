#!/usr/bin/env bash
set -e

URL="http://localhost:3000/health"
REQUESTS=100
CONCURRENCY=10

echo "Running API concurrency test"
echo "Requests: $REQUESTS"
echo "Concurrency: $CONCURRENCY"

seq $REQUESTS | xargs -n1 -P$CONCURRENCY -I{} curl -s -o /dev/null -w "%{http_code}\n" $URL | sort | uniq -c

echo "Test complete"

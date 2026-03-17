#!/usr/bin/env bash
set -euo pipefail

API="${API:-http://localhost:3000}"
SESSION="${SESSION:-88888888-8888-4888-8888-888888888888}"
SPACE_ID="${SPACE_ID:-space-test-1}"
PEER_USER_ID="${PEER_USER_ID:-22222222-2222-4222-8222-222222222222}"

echo "Creating conversation..."
CREATE_RESPONSE="$(curl -sS -X POST "$API/public/v1/social/conversations" \
  -H "Content-Type: application/json" \
  -H "x-session-id: $SESSION" \
  -d "{\"space_id\":\"$SPACE_ID\",\"type\":\"direct\",\"peer_user_id\":\"$PEER_USER_ID\"}")"

echo "$CREATE_RESPONSE"

CONV_ID="$(printf '%s' "$CREATE_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["conversation"]["id"])')"

echo "Conversation ID: $CONV_ID"

echo "Sending message..."
SEND_RESPONSE="$(curl -sS -X POST "$API/public/v1/social/conversations/$CONV_ID/messages" \
  -H "Content-Type: application/json" \
  -H "x-session-id: $SESSION" \
  -d "{\"space_id\":\"$SPACE_ID\",\"body_text\":\"hello smoke\",\"client_message_id\":\"smoke-msg-1\"}")"

echo "$SEND_RESPONSE"

echo "Listing messages..."
LIST_RESPONSE="$(curl -sS "$API/public/v1/social/conversations/$CONV_ID/messages?space_id=$SPACE_ID&limit=20" \
  -H "x-session-id: $SESSION")"

echo "$LIST_RESPONSE"

echo "Listing conversations..."
CONV_LIST_RESPONSE="$(curl -sS "$API/public/v1/social/conversations?space_id=$SPACE_ID&limit=20" \
  -H "x-session-id: $SESSION")"

echo "$CONV_LIST_RESPONSE"

echo "OK Stage 2B smoke test"

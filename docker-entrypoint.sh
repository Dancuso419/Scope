#!/bin/sh
# Authenticate the CLI in AK mode (reads OKX_API_KEY/SECRET_KEY/PASSPHRASE +
# GEMINI_API_KEY from the environment — injected as Railway secrets), then hand
# off to the server. Fail fast if auth doesn't succeed, so a bad key surfaces as
# a crashed deploy rather than an endpoint that 502s every call.
set -e

for v in OKX_API_KEY OKX_SECRET_KEY OKX_PASSPHRASE GEMINI_API_KEY; do
  eval "val=\$$v"
  [ -n "$val" ] || { echo "FATAL: $v is not set"; exit 1; }
done

echo "Authenticating onchainos (AK mode)..."
out=$(onchainos wallet login --force 2>&1) || { echo "FATAL: login errored: $out"; exit 1; }
echo "$out" | grep -q '"ok": true' || { echo "FATAL: login not ok: $out"; exit 1; }
echo "Authenticated. Starting Scope server..."

exec node src/server.ts

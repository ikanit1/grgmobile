#!/usr/bin/env bash
# Run this ONCE to register Telegram credentials as GitHub Actions secrets.
# Requires: gh CLI authenticated with repo scope.
# Usage: bash .github/setup-secrets.sh

set -euo pipefail

REPO="ikanit1/grgmobile"

gh secret set TELEGRAM_BOT_TOKEN \
  --body "8578442151:AAGyycIa1TyBCrMp78QLNS2GCscB8Kph6Rc" \
  --repo "$REPO"

gh secret set TELEGRAM_CHAT_ID \
  --body "947126451" \
  --repo "$REPO"

echo "Secrets set successfully for $REPO"

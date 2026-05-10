#!/bin/bash

# ─────────────────────────────────────────────
#  ASIA — Start All Services
#  Double-click or run: bash start_asia.sh
# ─────────────────────────────────────────────

VENV="$HOME/Documents/GitHub/ASIA/venv/bin/activate"
BASE="$HOME/Documents/GitHub/ASIA"

# Helper: open a new Terminal tab and run a command
open_tab() {
  local title="$1"
  local cmd="$2"
  osascript \
    -e 'tell application "Terminal"' \
    -e '  tell application "System Events" to keystroke "t" using {command down}' \
    -e "  do script \"printf '\\\\033]0;${title}\\\\007'; ${cmd}\" in front window" \
    -e 'end tell'
}

echo "🚀  Launching ASIA services..."

# ── Backend services ──────────────────────────────────────────────────────────

open_tab "student-service :8000" \
  "cd '${BASE}/backend/student-service' && source '${VENV}' && python manage.py runserver 8000"

sleep 0.4

open_tab "identity-service :8001" \
  "cd '${BASE}/backend/identity-service' && source '${VENV}' && python manage.py runserver 8001"

sleep 0.4

open_tab "billing-service :8002" \
  "cd '${BASE}/backend/billing-service' && source '${VENV}' && python manage.py runserver 8002"

sleep 0.4

open_tab "enrollment-service :8003" \
  "cd '${BASE}/backend/enrollment-service' && source '${VENV}' && python manage.py runserver 8003"

sleep 0.4

open_tab "frontend :5173" \
  "cd '${BASE}/frontend/admin-portal' && npm run dev"
 
echo "✅  All services launched in separate Terminal tabs."

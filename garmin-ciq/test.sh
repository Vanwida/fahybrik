#!/usr/bin/env bash
# Tests del simulador (Connect IQ, monkeydo -t).
#
#   ./test.sh            en fr965
#   ./test.sh fr255      en otro reloj
#
# Compila con los tests, abre el simulador si no está abierto y ejecuta todos los
# (:test). El simulador NO se cierra solo: ciérralo tú (o `./test.sh cerrar`).
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk}"
export PATH="$JAVA_HOME/bin:$PATH"

SDK="$(tr -d '\n' <"$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg")"
if [[ "${1:-}" == "cerrar" ]]; then pkill -f "ConnectIQ.app" || true; exit 0; fi

DEVICE="${1:-fr965}"
./build.sh test "$DEVICE" >/dev/null

if ! pgrep -f "ConnectIQ.app" >/dev/null; then
  open "$SDK/bin/ConnectIQ.app"
  sleep 10
fi

"$SDK/bin/monkeydo" "bin/test-$DEVICE.prg" "$DEVICE" -t

#!/usr/bin/env bash
# Compila la app Connect IQ. Clave y bin/ están en .gitignore.
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk}"
export PATH="$JAVA_HOME/bin:$PATH"

DEVICE="${1:-fr965}"
OUT="bin/fahybrid-${DEVICE}.prg"
KEY="${DEVELOPER_KEY:-developer_key.der}"

if [[ ! -f "$KEY" ]]; then
  echo "No hay $KEY. Genera una (no la commitees):" >&2
  echo "  openssl genrsa -out developer_key.pem 4096" >&2
  echo "  openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key.der -nocrypt" >&2
  exit 1
fi

if ! command -v java >/dev/null || ! java -version >/dev/null 2>&1; then
  echo "Java no disponible. brew install openjdk && export JAVA_HOME=/opt/homebrew/opt/openjdk" >&2
  exit 1
fi

mkdir -p bin
monkeyc -f monkey.jungle -o "$OUT" -y "$KEY" -d "$DEVICE" --typecheck 1
echo "OK → $OUT ($(wc -c <"$OUT" | tr -d ' ') bytes)"
echo "Sideload: cp $OUT /Volumes/GARMIN/GARMIN/APPS/"

#!/usr/bin/env bash
# Compila la app Connect IQ. La clave y bin/ están en .gitignore.
#
#   ./build.sh fr965            un reloj  → bin/fahybrid-fr965.prg
#   ./build.sh todos            todos los del manifest
#   ./build.sh test fr965       compila con los tests (bin/test-fr965.prg)
#
# La clave: developer_key.der en esta carpeta, o DEVELOPER_KEY=/ruta/a/clave.der.
# Typecheck: TYPECHECK=1 (gradual, por defecto) | 2 | 3 | 0.
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk}"
export PATH="$JAVA_HOME/bin:$PATH"

SDK_BIN="${CONNECTIQ_BIN:-$(cat "$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg" 2>/dev/null | tr -d '\n')/bin}"
if [[ -x "$SDK_BIN/monkeyc" ]]; then export PATH="$SDK_BIN:$PATH"; fi

KEY="${DEVELOPER_KEY:-developer_key.der}"
TYPECHECK="${TYPECHECK:-1}"

if [[ ! -f "$KEY" ]]; then
  echo "No hay $KEY. Genera una (no la commitees):" >&2
  echo "  openssl genrsa -out developer_key.pem 4096" >&2
  echo "  openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key.der -nocrypt" >&2
  echo "o apunta a la que ya tienes: DEVELOPER_KEY=/ruta/developer_key.der ./build.sh fr965" >&2
  exit 1
fi
if ! command -v monkeyc >/dev/null; then echo "monkeyc no está en el PATH (SDK de Connect IQ)." >&2; exit 1; fi
if ! java -version >/dev/null 2>&1; then
  echo "Java no disponible. brew install openjdk && export JAVA_HOME=/opt/homebrew/opt/openjdk" >&2
  exit 1
fi

mkdir -p bin

compilar() {
  local dispositivo="$1" salida="$2"; shift 2
  monkeyc -f monkey.jungle -o "$salida" -y "$KEY" -d "$dispositivo" --typecheck "$TYPECHECK" -w "$@"
  echo "OK $dispositivo → $salida ($(wc -c <"$salida" | tr -d ' ') bytes)"
}

if [[ "${1:-}" == "test" ]]; then
  compilar "${2:-fr965}" "bin/test-${2:-fr965}.prg" -t
  exit 0
fi

if [[ "${1:-todos}" == "todos" ]]; then
  fallos=0
  for id in $(grep -o 'iq:product id="[^"]*"' manifest.xml | sed 's/.*id="//;s/"//'); do
    compilar "$id" "bin/fahybrid-${id}.prg" || { echo "FALLA $id" >&2; fallos=$((fallos + 1)); }
  done
  echo "Fallos: $fallos"
  exit $((fallos > 0 ? 1 : 0))
fi

compilar "$1" "bin/fahybrid-$1.prg"
echo "Copia al reloj: cp bin/fahybrid-$1.prg /Volumes/GARMIN/GARMIN/APPS/  (README, «Copiar al reloj»)"

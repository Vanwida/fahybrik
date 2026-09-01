#!/usr/bin/env bash
# Guardián de ClickUp — hook `Stop`.
#
# POR QUÉ EXISTE: ClickUp es la única ventana de Alex al trabajo. Una regla en
# prosa (CLAUDE.md) se ignora; esto no se puede ignorar, porque impide cerrar el
# turno mientras haya commits más nuevos que la última escritura en ClickUp.
#
# Cómo se satisface: cualquier escritura con
# `.claude/skills/clickup/scripts/clickup.py` (crear / actualizar / añadir)
# toca ~/.claude/clickup-last-write. Si un commit de verdad no merece card,
# `clickup.py saltar "razón"` lo desbloquea dejando constancia de la razón.
set -uo pipefail

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
MARCA="$HOME/.claude/clickup-last-write"

cd "$REPO" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# El commit más reciente hecho DESDE ESTA MÁQUINA con la identidad del repo.
ULTIMO=$(git log -1 --format=%ct 2>/dev/null) || exit 0
[ -z "$ULTIMO" ] && exit 0

if [ -f "$MARCA" ]; then
  MARCADO=$(stat -f %m "$MARCA" 2>/dev/null || stat -c %Y "$MARCA" 2>/dev/null || echo 0)
else
  MARCADO=0
fi

# Margen: los commits de hace más de 12 h son de otras sesiones o de ayer; no
# es asunto de este turno reabrirlos.
AHORA=$(date +%s)
if [ $((AHORA - ULTIMO)) -gt 43200 ]; then exit 0; fi

if [ "$ULTIMO" -gt "$MARCADO" ]; then
  ASUNTO=$(git log -1 --format=%s 2>/dev/null)
  cat <<EOF >&2
Hay trabajo commiteado que todavía no está en ClickUp — y ClickUp es el único
sitio donde Alex ve lo que hemos hecho.

Último commit sin registrar: $ASUNTO

Antes de cerrar el turno, invoca la skill \`clickup\` y:
  1. actualiza (o crea) la card con qué se hizo, dónde se ve y qué NO se hizo,
  2. pega el NÚMERO y el ENLACE de la card en tu respuesta.

    python3 .claude/skills/clickup/scripts/clickup.py listar
    python3 .claude/skills/clickup/scripts/clickup.py actualizar <nº> <cuerpo.md>

Si este commit de verdad no merece card (una errata, un fichero de estado):
    python3 .claude/skills/clickup/scripts/clickup.py saltar "la razón"
EOF
  exit 2
fi

exit 0

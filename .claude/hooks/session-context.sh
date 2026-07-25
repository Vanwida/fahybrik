#!/usr/bin/env bash
# SessionStart hook — ninguna sesión empieza a ciegas.
#
# Sirve al arranque: el FOCUS.md (en qué andamos), el trabajo sin commitear
# que dejó la sesión anterior, y los últimos commits. Así se evita rehacer
# trabajo que ya existía — que es lo que pasó con la metodología.
#
# Regla: falla en silencio SIEMPRE. Nunca bloquea la sesión.

set +e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" || exit 0
cd "$REPO" 2>/dev/null || exit 0

echo "## Estado del proyecto (automático)"
echo

if [ -f FOCUS.md ]; then
  echo "### FOCUS.md"
  echo '```markdown'
  head -60 FOCUS.md 2>/dev/null
  echo '```'
  echo
else
  echo "⚠️  No hay FOCUS.md. Créalo: es lo que lee mentalOS y lo que orienta la sesión siguiente."
  echo
fi

PENDIENTE="$(git status --porcelain 2>/dev/null | head -25)"
if [ -n "$PENDIENTE" ]; then
  echo "### Sin commitear (de sesiones anteriores)"
  echo '```'
  echo "$PENDIENTE"
  echo '```'
  echo "Si algo de esto es trabajo terminado, commitéalo por ruta explícita antes de seguir."
  echo
fi

echo "### Últimos commits"
echo '```'
git log --oneline -8 2>/dev/null
echo '```'
echo
echo "Rama: $(git branch --show-current 2>/dev/null)"
echo
echo "Decisiones estructurales ya tomadas: \`docs/DECISIONS.md\` — léelo antes de rediseñar nada del dominio."

exit 0

#!/usr/bin/env bash
# worktree-al-dia — pone al día el worktree de un agente ANTES de que trabaje.
#
# EL PROBLEMA (9-ago-2026, pasó dos veces en la misma sesión): los worktrees de
# agente se crean desde la rama por defecto del repo (`main`), no desde la rama
# en la que se está trabajando de verdad. `main` lleva meses parada, así que un
# agente arrancaba 248 commits por detrás: medía su línea base contra código
# viejo, arreglaba cosas ya arregladas y sus cambios chocaban de frente al
# mergear. Que el agente se acuerde de mirarlo NO es una solución — esto es
# trabajo de la máquina, no de quien escribe el prompt.
#
# QUÉ HACE: si la sesión arranca dentro de `.claude/worktrees/agent-*`, adelanta
# ese worktree a la rama del checkout principal. Nada más.
#
# POR QUÉ ES SEGURO: `--ff-only`. Si el agente ya tiene commits propios, git se
# niega y no se toca nada — se avisa y que lo resuelva un humano. Nunca
# reescribe historia, nunca hace `stash` (se llevaría trabajo de otras sesiones
# del worktree compartido), nunca toca el checkout principal.
#
# Falla en silencio siempre: un hook jamás puede tumbar la sesión.

set -uo pipefail

raiz=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
case "$raiz" in
  */.claude/worktrees/agent-*) ;;
  *) exit 0 ;;  # checkout normal: no es asunto nuestro
esac

# La rama de trabajo REAL = la del checkout principal, que es la primera entrada
# de `git worktree list`. Se usa la rama LOCAL, no `origin/…`: el principal casi
# siempre va por delante del remoto (commits sin push todavía).
principal=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')
[ -n "${principal:-}" ] || exit 0
[ "$principal" != "$raiz" ] || exit 0

rama=$(git -C "$principal" symbolic-ref --quiet --short HEAD 2>/dev/null) || exit 0
[ -n "${rama:-}" ] || exit 0

actual=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo '(detached)')
[ "$actual" != "$rama" ] || exit 0  # ya estamos en ella

detras=$(git rev-list --count "HEAD..$rama" 2>/dev/null || echo 0)
[ "${detras:-0}" -gt 0 ] || exit 0

propios=$(git rev-list --count "$rama..HEAD" 2>/dev/null || echo 0)
if [ "${propios:-0}" -gt 0 ]; then
  echo "AVISO worktree: $detras commits por detrás de '$rama', pero ya tienes $propios commit(s) propios."
  echo "No se toca nada. Resuélvelo a mano antes de seguir (rebase sobre '$rama')."
  exit 0
fi

if git merge --ff-only "$rama" >/dev/null 2>&1; then
  echo "Worktree adelantado $detras commits hasta '$rama' (la rama de trabajo real, no \`main\`)."
  echo "Si el typecheck o los tests se quejan raro: \`cd web && pnpm install\` — gotcha conocido de node_modules en worktrees."
else
  echo "AVISO worktree: $detras commits por detrás de '$rama' y el fast-forward falló."
  echo "Estás trabajando sobre código viejo. Ponte al día antes de medir nada."
fi

exit 0

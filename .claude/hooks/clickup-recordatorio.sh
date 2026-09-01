#!/usr/bin/env bash
# Recordatorio de ClickUp — hook `UserPromptSubmit`.
#
# El guardián (`clickup-guard.sh`) atrapa el FINAL: no deja cerrar el turno con
# commits sin registrar. Esto atrapa el PRINCIPIO, que es la mitad que se
# olvidaba: la card se abre ANTES de ponerse, no al terminar.
#
# Se inyecta en cada mensaje de Alex, así que no depende de que yo me acuerde.
set -uo pipefail

cat <<'EOF'
<clickup-recordatorio>
Si lo que acaba de pedir Alex es una tarea (algo que va a tocar código, datos o
configuración), ABRE SU CARD EN CLICKUP ANTES DE EMPEZAR y pégale el número y el
enlace en tu respuesta. Sin card no se trabaja: ClickUp es el único sitio donde
él ve lo que hacemos.

  python3 .claude/skills/clickup/scripts/clickup.py siguiente
  python3 .claude/skills/clickup/scripts/clickup.py crear ahora "<título en cristiano>" <cuerpo.md>

Toda card va numerada (`N · título`, secuencia global compartida con Hermes; el
script numera solo). Al acabar, se actualiza la MISMA card y se vuelve a pegar el
enlace. Detalle en la skill `clickup`.

Si no es una tarea (una pregunta, un comentario), ignora esto.
</clickup-recordatorio>
EOF
exit 0

---
name: clickup
description: Abrir y cerrar tareas en ClickUp. OBLIGATORIA al empezar y al acabar cualquier tarea no trivial. Usar también cuando se pida ver, crear o actualizar una card.
---

# ClickUp — el único sitio donde Alex ve lo que hacemos

Alex lleva varios agentes y proyectos a la vez. **ClickUp es su única ventana
al trabajo**: si algo no está ahí, para él no ha pasado. Y si no le enseño el
enlace en el chat, no consta que lo haya actualizado — tendría que ir a
comprobarlo, que es justo el trabajo que esto existe para ahorrarle.

## Las dos veces, sin excepción

**1 · AL EMPEZAR una tarea** (antes de tocar código):
crear la card con lo que se va a hacer, y pegar el enlace en el chat.

**2 · AL ACABAR** (después de verificar, antes de decir «hecho»):
actualizar esa misma card con lo que se hizo, dónde se ve y **qué NO se hizo**,
y volver a pegar el enlace.

El enlace se pega SIEMPRE, en las dos. Formato: `NN · título → https://app.clickup.com/t/<id>`.

## Cómo se escribe una card

- **Número delante, siempre:** `N · título`. La secuencia es **global**, compartida
  con el otro agente (Hermes): el número sale del máximo de TODAS las listas, no
  de la lista donde va. Al renombrar una card, se conserva su número.
- **Título en cristiano:** qué cambia para el entrenador o para el negocio, no el
  nombre técnico del cambio.
- **Cuerpo en este orden:** QUÉ PASABA (el problema en humano) → QUÉ SE HIZO →
  DÓNDE SE VE (ruta de la app) → QUÉ NO SE HIZO → DETALLE TÉCNICO al final.
- **Cero jerga sin glosar.** Lo tiene que entender alguien que no está en el
  proyecto: nada de «peek», «linaje», «los dos recibos» ni nombres de fichero
  sueltos como si fueran obvios.

## El script

`scripts/clickup.py` en esta misma carpeta. Lee el token de
`~/.hermes/secrets/clickup.env` (no imprimirlo nunca).

```bash
S=.claude/skills/clickup/scripts/clickup.py

python3 $S listar                       # todas las cards con número, lista y enlace
python3 $S siguiente                    # el próximo número libre (secuencia global)
python3 $S crear <lista> "<título>" <fichero.md>   # crea numerando solo; imprime el enlace
python3 $S actualizar <nº|id> <fichero.md>         # reemplaza el cuerpo; imprime el enlace
python3 $S añadir <nº|id> <fichero.md>             # AÑADE al final del cuerpo; imprime el enlace
```

El cuerpo va en un fichero para no pelearse con el escapado en la shell;
escribirlo en el scratchpad de la sesión, no en el repo.

Listas (`<lista>` acepta el alias):

| alias | para qué |
|---|---|
| `hecho` | terminado y verificado |
| `ahora` | en curso |
| `espera` | bloqueado esperando algo de Alex |
| `luego` | pendiente sin fecha |
| `flexr` | producto FLEXR / multi-coach |

## Lo que NO se hace

- No cerrar una card sin haber verificado lo que dice.
- No escribir «hecho» en una card por trabajo que sigue sin desplegar: si falta
  desplegar, la card lo dice.
- No dejar una tarea sin card porque «es pequeña»: si ha tocado código, tiene card.
- No inventar un número: se pide con `siguiente`.

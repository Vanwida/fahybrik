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

## QUIÉN tocó la card — obligatorio, sin excepción

El token de la API es el de Alex, así que **ClickUp firma como suyo todo lo que
escriben Claude, Hermes y Grok**. Con tres agentes trabajando a la vez, una card
sin firma no dice nada sobre quién la movió, y Alex se queda sin saber quién hace
qué.

El script **estampa la firma solo** en cada escritura (crear, actualizar, añadir,
y como comentario al cambiar de estado). No hay que acordarse — pero sí hay que
identificarse:

```bash
export CLICKUP_AUTOR="Hermes"      # o "Grok", o el nombre del agente
```

Dentro de Claude Code se deduce solo. Cualquier otro agente que no ponga esa
variable firmará como **«agente sin identificar»**, que es lo que se merece.

## Lista y ESTADO son dos ejes, y los dos importan

La **lista** dice en qué cajón vive la card (`hecho`/`ahora`/`espera`/`luego`).
El **estado** dice si ahora mismo se está trabajando en ella: `to do`,
`in progress`, `complete`. Alex mira el tablero para saber **qué hay en marcha**,
y una card en el cajón «ahora» pero con estado «to do» le esconde exactamente
eso. Durante meses el script solo movía el cajón y no tocó nunca el estado, así
que todo se veía igual.

- **Al crear** una card porque empiezas: nace en `in progress` (es el defecto).
  Si es algo decidido y aparcado, pasa `"to do"` explícito como quinto argumento.
- **Al cerrar**: `estado <nº> complete` **y** moverla al cajón `hecho`.
- **Si la dejas a medias** y te vas a otra cosa: `estado <nº> "to do"`, o Alex
  creerá que sigue en marcha.

## Cómo se escribe una card

- **Número delante, siempre:** `N · título`. La secuencia es **global**, compartida
  con todos los agentes (no estás solo). El número sale del máximo de TODAS las
  listas, no de la lista donde va. Al renombrar una card, se conserva su número.

## No estás solo — el número se comprueba, no se recuerda

Somos muchos agentes sobre el mismo tablero. `siguiente` es una foto: entre
que la lees y que escribes, otro ya ha cogido ese número. El 24-ago Grok
actualizó la 161 por número y pisó la card de otro agente que acababa de
nacer con el mismo 161.

**Antes de crear:** `listar`. Si el máximo ya no es el que viste hace un
momento, hay un número nuevo — no es tuyo, no lo uses, no lo pises.
`crear` numera sola en ese instante; no le pases un número que memorizaste.

**En cuanto `crear` imprime el enlace:** te quedas con el **id** (`/t/<id>`).
A partir de ahí, `actualizar` / `añadir` / `estado` van **por id**, no por
número. El número puede estar duplicado; el id no.

**Antes de tocar por número:** `listar` otra vez. Si ese número sale dos
veces, paras. No eliges «la primera». El script, si le pasas un número
repetido, se niega.

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
python3 $S crear <lista> "<título>" <fichero.md> ["to do"]   # numera sola; nace «in progress»
python3 $S actualizar <nº|id> <fichero.md>         # reemplaza el cuerpo; imprime el enlace
python3 $S añadir <nº|id> <fichero.md>             # AÑADE al final del cuerpo; imprime el enlace
python3 $S estado <nº|id> <to do|in progress|complete>   # el estado, que NO es la lista
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
- No inventar un número. No reutilizar un `siguiente` leído hace rato:
  `listar` otra vez; `crear` numera en el momento.
- No `actualizar` / `estado` por número si `listar` muestra ese número más
  de una vez: se usa el id de **tu** card (el del enlace al crear).
- No tocar una card que no has creado tú en esta sesión, salvo que Alex
  te pase el enlace.

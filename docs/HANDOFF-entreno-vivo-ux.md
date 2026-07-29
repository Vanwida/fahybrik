# HANDOFF — La UX del entreno en vivo del atleta (iOS)

**Este fichero es autocontenido.** Si estás leyendo esto, trabaja SOLO desde aquí:
no interpretes el índice de `/es/design` (tiene pantallas anteriores que se
solapan con esto; donde contradigan, **manda este documento**), y no necesitas
leer FOCUS.md ni DECISIONS.md para entender la dirección — aquí está entera.

Fecha: 2026-07-29 · Validado por Alex («me encanta») · Solo iOS, la app del atleta.

**La colección entera, en una sola dirección:** `app.fahybrid.com/es/design/entreno`
(solo las diez pantallas, agrupadas; nada del índice general).

---

## 1 · La idea que ordena todo

El entreno en vivo NO es una pantalla con variantes: son **vistas distintas con
sujeto propio**, y lo que las separa son dos variables:

| Formato | Quién gobierna la transición | Sujeto de la vista |
|---|---|---|
| Rodaje / series de calle | el HITO (cruzar la distancia te saca) | la zona te tiñe el lienzo / los metros que faltan |
| Series de cinta | el HITO | la velocidad LEÍDA de la máquina + lo que queda |
| Series de ergo (remo/ski/bici) | el HITO (la máquina lo mide) | tu /500 contra el objetivo + metros drenando |
| Fuerza | el ATLETA (tú dices cuándo acabas) | la serie que tienes delante (kg × reps @ RIR) |
| EMOM / interval | el RELOJ (acaba el minuto, acaba la ronda) | el minuto drenando; lo que sobra es tu descanso |
| For Time | el SUCESO (la medida cruza, o tu toque) | el tramo activo; el crono total es la puntuación |
| AMRAP | el RELOJ (la ventana) + la ronda se toca | la ronda gigante + la ventana drenando |
| Dobles | el RELEVO | cuando trabaja tu pareja, TU salida es el sujeto |
| Apple Watch | igual que el móvil | UN sujeto por página, el fondo entero es tu zona |

**Lenguaje común de todas:** un solo sujeto por estado, legible a 2 metros
sudando; máximo 3 niveles de jerarquía; la zona de pulso tiñe el ambiente
(color-mix suave), no un chip perdido; el descanso es una PANTALLA con sujeto
propio (cuenta atrás enorme + pulso bajando + qué viene); las transiciones se
ANUNCIAN (flash + cambio de sujeto); voz tipográfica: display cursiva 800 para
estructura, mono recto 800 (readout) para todo dato de instrumento, tabular-nums.

**Honestidad en vivo (ley del proyecto):** solo se pinta lo que la fuente
conectada sabe; una dosis que el coach no escribió se pinta como el nombre solo
(jamás «— reps» ni un 0); un monitor parado NO cierra un tramo (cierra el CRUCE
del objetivo o el toque del atleta); lo estimado viaja marcado; lo tachado
enseña lo MEDIDO (1.014 m se leen 1.014, no se redondean a 1.000); el pulso sin
reloj no se pinta; el crono de un tramo de ergo arranca cuando la máquina se
mueve, no al pulsar.

## 2 · El giro con máquina (regla aprobada por Alex)

**«El tramo decide la cara; el formato nunca suelta la franja.»**

- Con un ergo conectado, HORIZONTAL enseña la **cara de monitor del tramo
  activo** — no de la conexión: en el minuto de burpees no hay cara de remo.
  La condición es doble: hay máquina Y una medida que ella pueda mover (un Run
  tiene distancia pero la ponen el GPS/reloj → cara de formato).
- El reloj del formato vive en una **franja fija que no desaparece jamás**
  (el minuto del EMOM, el crono-puntuación del For Time, la ventana del AMRAP),
  y los avisos (cambio de minuto, últimos segundos, cruce del hito) flashean
  POR ENCIMA de la cara de monitor.
- Un tramo a pulso en horizontal = el formato adaptado. Nunca un monitor sin datos.
- **La cinta es caso aparte:** al conectarnos, la máquina se queda ciega
  (pierde su pantalla), así que velocidad e inclinación LEÍDAS van embebidas en
  el HUD **vertical** — nuestra view pasa a ser LA pantalla de la máquina, y en
  la cinta nadie gira el móvil. La app nunca controla la cinta: solo lee.

## 3 · Las diez pantallas (el canon)

Código: `web/components/design-twin/screens/<id>/` · Vivo:
`app.fahybrid.com/es/design/<id>` (sello PROPUESTA; en el panel: escenarios,
claro/oscuro, y botón «Horizontal» donde aplica).

| id | Qué es | Lo esencial |
|---|---|---|
| `plan-bloque` | La semana dentro del bloque | Hoy como héroe; la rampa del bloque dibujada; el día vacío tiene salida |
| `sesion-previa` | La ficha antes de empezar | El porqué del coach; material; vídeo por ejercicio; detalle con tu última vez; «Empezar» anclado |
| `vivo-correr` | Correr (50 % de HYROX, la más usada) | Rodaje: la zona tiñe el lienzo; series: mandan los metros que faltan; cinta honesta que LEE; horizontal = readout a columnas |
| `vivo-erg` | Series de remo/ski/bici | /500 contra objetivo; el crono espera al primer golpe; el cruce cierra; horizontal = cara de monitor |
| `vivo-fuerza` | El hierro | «5 × 100 kg» como sujeto; discos por lado; registro en un toque; descanso como pantalla; dosis null sin fabricar |
| `vivo-emom` | El minuto manda | La tarea se cuenta sola si hay máquina; cumplir tiñe el resto del minuto de tuyo; interval 45/15 avisa de PARAR; horizontal por tramo |
| `vivo-fortime` | La ruta y el suceso | La estación es el tramo; el crono es la puntuación y no se va; «Ver las 16»; cap honesto; horizontal por tramo |
| `vivo-amrap` | La ventana y las rondas | Ronda gigante a toque de medio lienzo; sellado exacto sin redondear; horizontal sigue al cursor del movimiento |
| `vivo-dobles` | El relevo | Cuando rema tu pareja, el sujeto es TU salida («sales en ~40 s»); su trabajo no se te apunta; el cambio es un suceso 3-2-1 |
| `watch-vivo` | La muñeca | Fondo OLED entero = tu zona; un sujeto por página; el aro del bisel trocea series/minuto/ventana |

Los fixtures son casos REALES de producción (remo 5×500 exec 179, ski 400
exec 173, EMOM esquí+bici exec 177, simulación HYROX de 16, circuito de pierna
con dosis null, back squat 4×5 @100 kg) — no inventes datos nuevos: reutilízalos
de `datos-reales.ts` y de los `data.ts` de cada carpeta.

## 4 · Qué NO mirar y qué queda abierto

- **No tomes dirección de:** `entreno-vivo` (propuesta previa de arquetipos),
  ni de los espejos `run-live` / `benchmark-erg` / `watch-live` (documentan la
  app de HOY, no la dirección), ni de ningún HTML de `docs/design/`.
- **Reglas del doble que sí aplican:** los mockups nuevos nacen como pantallas
  `propuesta` del doble; cuando algo se shipea en Swift, su pantalla pasa a
  `espejo` en el mismo lote; tokens 1:1 con Theme.swift vía `twin.css`.
- **Abierto (decisiones de Alex, no las tomes tú):**
  1. El EMOM de dos máquinas asume **dos ergos emparejados a la vez**; si la app
     solo sostiene un enlace, hay que decidirlo antes de Swift.
  2. `readoutLabel` (Theme.swift + twin.css) escribe «/500M» por el uppercase;
     se arregla en los DOS en el mismo lote, no pantalla a pantalla.
  3. Un «enorme de monitor» de verdad pediría un escalón tipográfico por encima
     de las 72 pt del readout-hero — también Theme.swift + twin.css a la vez.

# El kit del reloj Garmin (`kit-garmin`) — cómo se usa (29-09-2026)

Cimientos de las pantallas `garmin-*` del doble. Contrato: `modelo.md` (aquí al lado). Mapa del API: la cabecera de `web/components/design-twin/kit-garmin/index.ts`. Sin dominio propio: el paso, el motor, `laminaDelPaso`, las zonas, la estructura y la completitud son de `kit-reloj`. El kit solo pone el lienzo redondo (fracciones de D), los cinco botones (§5) y la vibración y el tono (§6).

**Cómo se monta una pantalla (lo normal, ~20 líneas)**

1. Plan y cuerpo de `kit-reloj` (los de `screens/reloj-*` valen tal cual): `PlanSesion` + `Simulador` + `InicioSecuencia`.
2. `<VivoGarminDePlan plan sim inicio onLog />`: motor, carcasa con selector 454/390/260/218, caras base, páginas Paso → Datos → Vueltas → Estructura (UP/DOWN, en círculo), Controles (UP largo), pausa, deshacer de 5 s y final.
3. La familia cambia lo suyo y nada más: `cara` (null = la del kit), `paginas`, `estadoMandos` (p. ej. `'anotar'` en el descanso de fuerza), `alAccion` (ronda hecha, reps ±1, anotar, empezar: acciones de §5 que no son del kit), `controles`, `capa`, `aro`/`duracion`, `avisoCierre`, `final`/`onFin`, `traducir` (sus avisos, a partir de `eventosDeTransicion`), `inicial`/`guion`.
4. Con estado propio: `useVivoGarmin` + tus ganchos + `<VistaGarmin seq avisos …/>`.
5. Una cara nueva = una función PURA que devuelve una `Disposicion` (`lineasContexto`, `heroeEn`, `lineaDeDato`, `lineaDeTexto`, `colocar` sobre `REJILLA`) + un componente de una línea con `<PintaDisposicion d />`. Nunca un `fontSize` ni un hex: `TG`, `CG`, `AIRE`, `REJILLA`.

**Qué hay en cada fichero**: `tokens` (relojes, escala en fracción de D, color, `aMip`, carcasa) · `geometria` (cuerda, ancho útil por fila, rejilla) · `medir` (anchos sin DOM, contexto por partes, dos líneas, talla del héroe) · `disponer` (líneas colocadas) · `caras` y `paginas` (las caras base, puras) · `mandos` (§5 como dato) · `avisos` (§6 como dato + emisor) · `pintar`, `aro`, `pantalla` (los pintores) · `carcasa` (botones, teclado, selector) · `comparar` (los cuatro a la vez) · `vivo` (el montaje).

**Cómo se prueba**

- `cd web && pnpm exec vitest run tests/design-twin/kit-garmin`: la geometría y `aMip`; la tabla `MANDOS` contra la tabla de §5 leída de `modelo.md`; `AVISOS` contra §6 y la completitud frente a los eventos del motor; y todas las caras base con cada paso de las sesiones reales de correr (491, 494, 573, 479, 551, 509, 538, 535, 6 × 1000) a 454, 390, 260 y 218: nada se sale de la cuerda, nada baja del 6,2 % de D, el héroe queda en 0,20–0,26 D, nada se pisa, las cifras están en la bitmap; y la cara del paso pinta la lámina de `laminaDelPaso`.
- En el doble: `/es/design/garmin-gramatica`. Teclas: Enter = START, ⌫/Esc = BACK/LAP, ↑ ↓, ⇧↑ (o mantener UP 1 s) = Controles, L = LIGHT. La cronología del panel dice qué vibró y qué sonó.

**Desviaciones y decisiones (con su medida)**

- Subconjunto de cifras: al `0-9 : . ' " / + - ▲ ▼` del modelo se suman la coma decimal («2,18 km») y la raya del dato que falta («—», G1). «GO» es una palabra: va en la sans.
- Números: display de marca (Archivo Narrow 700), cursiva sintetizada (la fuente no trae cursiva) y tabulares a mano (no trae `tnum`: el «1» mide 0,42 em; cada cifra se pinta en 0,46 em).
- Pie: a 454, «♥ 140 ppm» ya al suelo mide 135 px y la cuerda del pie deja 124: con el corazón delante se quita «ppm» (luego la zona, luego la tendencia; nunca el valor). Queda «♥ 140 Z4».
- Un nombre de clase largo del coach que no cabe ni al suelo («Descanso entre tandas», 509) va en dos líneas y baja hasta el 24 % (la franja del contexto es 8–22 %).
- MIP: con 6 o más zonas, amarillo y ámbar cuantizan al mismo `#FFAA55`; se leen por su número. El brillo del aro sube a 1 / 0,67 / 0,34 (a 0,16 lo pendiente era negro) y el trabajo pendiente se ve granate (`#550000`). El carril es `#3A3A3C` (el de la muñeca, `#2A2A2C`, en MIP es el azul `#000055`).
- Avisos: en un instante suena UN aviso (el de más prioridad), y el acuse de una tecla («paso cerrado a mano») va delante. Pausa, reanudar, +30 s y deshacer no tienen fila en §6: no avisan. El «enlace» del motor es «Sensor o GPS perdido»; la pérdida o vuelta del GPS o del pulso se lee en las lecturas.
- Pausa: cara propia, no un velo (un MIP no tiene media luz). Controles vuelve a la opción de la que salió un submenú.
- «Cambiar entorno» cambia el paso que se pinta (la nota «Cinta»/«Pista»), no el simulador.
- En «Sesión completada» se ven los rótulos de la fila RPE/Resumen (+/−) aunque ahí no hay valor que mover: lo resuelve la familia de antes y después.

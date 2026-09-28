# kit-iphone-vivo — el vivo del iPhone, rehecho

Para las cinco sesiones que construyen las familias (`iphone-vivo-correr`, `-ergo`, `-fuerza`, `-wod`, `-circuito`) encima de este kit. Modelo: `docs/vivo-iphone/modelo.md`. La gramática que lo enseña: `screens/iphone-vivo-gramatica/`.

## La idea en una frase

**Un estado, dos pintores.** El iPhone pinta EL MISMO estado que la muñeca con las MISMAS reglas: el motor (`secuencia.ts`), el héroe (`heroeDeFamilia`), el veredicto y la banda (`laminaDelPaso`), la rejilla (`metricasDelPaso`), el trabajo (`trabajoDe`), la posición (`posicionDe`), «Luego» (`luegoDe`), el formato (`formatoDe`), la voz, los eventos y la anotación de fuerza (`anotar.ts`) viven en `kit-reloj/`. **Este kit no tiene dominio propio**: solo el lienzo del iPhone (tokens, la anatomía I5 y sus piezas). Si al construir una familia te falta una regla de dominio, va a `kit-reloj` con test, y la muñeca la hereda. Nunca aquí, nunca en la pantalla.

## Cómo se monta una pantalla (lo normal: 20 líneas)

```tsx
import { VivoIphoneDePlan } from '../../kit-iphone-vivo';

<VivoIphoneDePlan
  plan={plan}            // PlanSesion del kit-reloj (los pasos planos, las zonas, las reglas)
  sim={sim}              // Simulador: qué dan el cuerpo y los sensores cada segundo
  inicio={inicio}        // InicioSecuencia: en qué paso y segundo arranca el escenario
  dispositivos={{ reloj: 'sin', maquina: 'ski', pulsometro: 'banda' }}
  cronoTotal={(seq) => totalDe(seq.estado, circuito)}   // solo circuitos y For Time
  duracion={dibujoDe}    // el estimador de la tira, si la familia sabe más que el kit
  guion={[{ en: 3500, gesto: 'primaria' }]}             // la demo
  onLog={onLog}
/>
```

Con estado propio de la familia (las rondas del AMRAP, lo anotado en fuerza, la tarea marcada del EMOM): `useVivo` + tus ganchos + `<VistaIphone seq eventos … />`. Ver `screens/iphone-vivo-gramatica/vistas.tsx`: `VivoAmrap`, `VivoEmom`, `VivoFuerza`, `VivoGps` son los cuatro patrones.

## Lo que una familia puede cambiar (y nada más)

| Prop de `VistaIphone` | Qué es | Cuándo |
|---|---|---|
| `extra(seq) → ExtraFamilia` | lo que el paso no sabe solo: `total`, `rondas`, `cargaKg`, `ultimaSerie`, `descansoS`, `repsRonda`, `repsMinuto`, `siguienteNombre` | siempre que la familia tenga ese dato |
| `heroe(seq, kit)` | cambia el héroe; recibe el de `heroeDeFamilia` | casi nunca: solo si el modelo lo dice (el EMOM marca «respiro») |
| `primaria(seq, kit)` | la acción primaria, del `VOCABULARIO_PRIMARIA`; con `deshacer: { aviso, hacer }` una acción que no cierra el paso (+1 ronda, «hecho») pasa por el mismo aviso de 5 s | cuando la familia tiene estado (`+1 ronda`, `Hecho`, `Confirmar`) |
| `posicion(seq)` | la cabecera por partes; el kit usa `posicionDe` | casi nunca |
| `formato(seq, kit)` | la fila del formato, por partes si le añades dónde estás («Circuito · Ronda 2/5 · Estación 2/3»); lo que no cabe junto a los chips se quita por el final | el circuito |
| `estructura(seq)` | la página Estructura de la familia (la ruta con parciales por estación, `rutaDe` del kit-reloj) | el circuito |
| `cronoTotal(seq)` | el crono TOTAL en la cabecera (la puntuación) | circuitos y For Time |
| `anotar` | la tarjeta de anotación en el descanso (`AnotarSerie`) | fuerza |
| `apoyo(seq, { irA })` | lo que va en la franja elástica DURANTE el trabajo o una transición, sobre las celdas (compactas, `celdasConApoyo`; `apoyoCompacto: false` las deja normales): la lista ±1 del chipper (`ListaAlrededor`), la puntuación del AMRAP (`AnotarPuntuacion`) | WOD, circuito |
| `luego(seq, kit)` | cambia «Luego ·»; `null` lo quita (y su hueco) cuando el apoyo ya dice lo que viene | el chipper |
| `detalleFin(seq)` | el detalle de «Sesión completada» cuando el motor cierra el último paso | la puntuación de un death by |
| `duracion` | cuánto pesa cada paso en la tira | el circuito |
| `avisoCierre(seq)` | el texto del deshacer | si el del kit (`avisoDeCierre`) no sirve |
| `antes` | «Empezar» antes de arrancar (GPS) | correr en calle |
| `dispositivos` | qué hay enlazado (reloj, máquina, pulsómetro) | siempre |
| `guion` | gestos de la demo (`GestoIphone`) | los escenarios |

**Prohibido:** repintar la anatomía en la pantalla, escribir un `fontSize` o un hex, inventar un texto de botón fuera del vocabulario, dibujar otra cuenta atrás, otro deshacer o otro «Terminar», usar el naranja para algo que no sea la acción primaria (o el trabajo en la tira), poner texto por debajo de 15 pt, decir PM5/FTMS/BLE.

## La anatomía (I5), de arriba abajo

1. **`Cabecera`**: posición en palabras (`posicionDe`), formato en castellano de box (`formatoDe`, dato con defecto), marca «Test», crono de sesión (o total), chips de enlace (`enlacesDe`, derivados de las lecturas: nunca un segundo estado).
2. **`PuntosPaginas`**: Vivo · Estructura · Mapa (solo con GPS).
3. **`Sujeto`**: el héroe a 72–176 pt. **Alto fijo** (`ALTO.sujeto`): el centro óptico no baila entre familias. Su nota de honestidad debajo (`notaEnlace`: «sin señal del ski · toca para reconectar»).
4. **`BandaObjetivo`**: solo con objetivo; ▲▼ y palabra, espectro a zona. Si el objetivo no es un número vivo (RPE, RIR), la misma fila es `ObjetivoInstruccion`: «objetivo · RPE 8 · ritmo de carrera» (P3). En fuerza no: ya va en la etiqueta del héroe.
5. **`Trabajo`**: lo que falta y la dosis, o la tarea; nunca en gris. En el descanso: «Viene: …» con «+30 s».
6. **`Rejilla`**: 2–4 celdas en dos columnas, el pulso siempre. Es la franja ELÁSTICA: el sobrante del lienzo entra aquí (§10.3); en 844 pt caben banda + trabajo + 2 × 2. Un texto largo va a lo ancho. Con anotación (fuerza), celdas compactas.
7. **`Luego`**: el siguiente paso y el «después». Se parte en dos líneas; nunca se trunca.
8. **`TiraEstructura`**: la sesión en una tira; tocar abre Estructura.
9. **`FranjaAccion`**: Pausa · Primaria (64 pt, naranja si es la acción del momento) · Terminar (mantener 1 s → `HojaTerminar`).

Capas: `CuentaAtras` (LA cuenta atrás, 3-2-1 y GO), `AvisoVuelta` (el km), `AvisoDeshacer` (5 s, sobre la franja), `VeloPausa`, `HojaTerminar`, `Terminado`. Fuera de la app: `PantallaBloqueo` (Live Activity) e `IslaDinamica`.

Horizontal (§3, solo ergo y cinta): el kit lo hace solo cuando el lienzo es apaisado — sujeto y banda a la izquierda, rejilla y acción a la derecha. La pantalla declara `soportaHorizontal: true`.

## Cómo se declara un escenario

En `casos.ts` de la pantalla: un `CasoIphone` = plan + sim + inicio + dispositivos (+ `cronoTotal`, `duracion`, `guion`, estado inicial de la familia). **Reutiliza las sesiones reales y los simuladores de `screens/reloj-*/casos.ts`**: son el mismo estado. Si el sim de la muñeca no da lo que la máquina reporta (cadencia, vatios, calorías), envuélvelo (`conMaquina`), no lo reescribas. Lo ilustrativo se dice en el comentario del plan.

El guion (`GestoIphone`): `primaria`, `pausa`, `reanudar`, `terminar`, `terminar-guardar`, `seguir`, `deshacer`, `mas30`, `estructura`, `mapa`, `vivo`. Pasa por el mismo camino que el dedo. Lo que no es un gesto de la carcasa (cambiar un dato de la anotación) va con `useTimeline` en la vista.

## Lo que se verifica antes de entregar

- `pnpm typecheck`, `pnpm lint`, `pnpm vitest run tests/design-twin/`.
- Capturas a 390 × 844 y 430 × 932 (pantalla completa del doble), sin texto truncado ni desbordes, nada por debajo de 15 pt: el script del 28-09 está en la entrega de la gramática (`capturar.js`).
- Contraste AA: los tokens son los de la muñeca (`tinta2` sobre `superficie` 7:1; negro sobre naranja 6,5:1).

## Lo que este kit NO cubre todavía (para las familias)

- ~~**Death by**~~ Ya está en el kit compartido (`kit-reloj/deathby.ts`, 28-09): la escalera como dato del paso, el héroe «reps de este minuto», y el mecanismo «el reloj te caza». Pantalla: `screens/iphone-vivo-wod/`.
- **Página Mapa**: una traza determinista; el mapa real es el del sistema (correr).
- **La página Estructura** enseña los bloques con sus vueltas; la ruta del circuito con parciales por estación la pone la familia circuito (`iphone-vivo-circuito/ruta.tsx`, sobre `rutaDe` de kit-reloj) por la prop `estructura`.
- **Tinte de zona** (I8): solo cuando el paso va a zona; el «siempre que haya pulso» del CONTRATO §10.1 queda para Alex (§7 del modelo).
- **RX / Escalado**: fuera del vivo; se declara al terminar con la puntuación (SmartWOD/Wodify). No hay componente aquí a propósito. La puntuación del AMRAP (rondas + reps) sí: `AnotarPuntuacion` en la campana.

# Servidor del reloj Garmin — el plan de cada sesión (fase 1: correr)

El reloj no lee un .FIT: pide el PLAN COMPACTO (`docs/garmin-reloj/plan-compacto.md`) y lo cumple con su motor.

## Endpoint
`GET /api/athlete/wearables/garmin/plan?from=YYYY-MM-DD&days=7` · Bearer de atleta (como `garmin/today`).
`from` es la fecha LOCAL del reloj; `days` 1–14 (defecto 7). 401 sin bearer; 400 si `from` o `days` no valen.

```
{ "v": 2, "sesiones": [{ "asignacion_id": 494, "fecha": "2026-10-01", "huella": 283253031,
                          "soportada": true, "plan": "<base64>" },
                        { "asignacion_id": 495, "fecha": "2026-10-02", "huella": null,
                          "soportada": false, "motivo": "fase_2" }] }
```
- `asignacion_id` y `huella` van también FUERA del blob, para no bajar lo que el reloj ya tiene. El blob es `codificarSesion` (cabecera + plan) en base64.
- `soportada:false` lleva `motivo` y no lleva `plan`: el reloj dice «Esta sesión va en la app». Nunca una versión recortada.
- Motivos: `fase_2` (no es correr), `sin_estructura` (línea de carrera sin estructura válida, o sin líneas), `demasiado_grande` (más de 200 pasos o 6 KB; no se parte), `no_codificable` (un valor que el cable no admite).

## Qué cubre la fase 1
Sesiones cuyas líneas son TODAS de carrera. `buildGarminPlan` (`web/lib/wearables/garmin-plan.ts`) parte de `runStructureForSession` y aplana fases, repeticiones y recuperaciones a `PasoBase[]`:
- calentamiento / principal / vuelta a la calma; trabajo o recuperación (con su modo trote, andar o parado); medida por distancia o tiempo.
- objetivo de ritmo (banda absoluta; una zona de ritmo se resuelve con el umbral del atleta), zona de pulso (contra `plan.zonas`, con su `procedencia`), RPE; inclinación y cadencia como guía (máx. 2 objetivos por paso). Sin dato que lo resuelva, el tramo va abierto.
- `grupo` («6 × (1000 m / r 90″)»), posición tanda/serie, descanso entre tandas, `bloque`. N series llevan N−1 recuperaciones: la última repetición no cierra con la suya.
- rodaje continuo con `vueltaAutoM` (1000 m), entorno calle, `fit_sport` RUNNING y sub-deporte genérico, cinta o pista según el entorno.
- método del coach como dato con defecto: reglas de aviso (`REGLAS_AVISO_DEFECTO`), vocabulario, método del resumen, vuelta automática, sentido del aviso por clase.

## Qué NO cubre (fase 2 o hueco)
- Fuerza, EMOM, AMRAP, ergo, circuito, HYROX, movilidad, y una sesión que mezcle una línea de esas con correr (479 y 491 del doble: `fase_2`).
- El método del coach no tiene dónde guardarse hoy: el endpoint pasa `{}` y sirve los defectos.
- La prescripción no dice dónde se corre: siempre calle. El `cue` del coach no viaja (las notas no se leen aún).
- El doble nombra `tirada`/`tempo`; el servidor emite `rodaje` (una carrera continua) y la palabra es del vocabulario del coach.

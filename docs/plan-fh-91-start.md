# FH-91 — Un solo Start (plan)

## Problema (raíz)
Cuatro puertas distintas preguntaban cosas distintas antes del vivo: brief/builder
(`RunPreStartFlow`), puerta de bloque (`BlockPreviewGate` + erg/run en
`ActiveWorkoutView`), chips sueltos en constructores, y el reloj con reintentos
silenciosos. El libre saltaba el brief y llamaba `PhoneMirrorService.begin` en
`loadPlan` → vivo + HealthKit antes de terminar GPS/ski/reloj.

## Restar (eliminar puertas)
- `RunPreStartFlow` / `ErgPreStartFlow` como **covers** en `PreWorkoutBriefView`,
  `FreeWorkoutBuilderView`, `ActiveWorkoutView`.
- Puerta run/erg en `requestBlockStart()` — el bloque solo enseña preview;
  `Empezar` → `session.beginBlock()` directo.
- `DeviceConnectCard` / `ErgConnectCard` en brief y builders (dispositivos viven
  en la puerta única).
- `WorkoutContainer.loadPlan` libre: ya no `phase = .active` ni `begin` ahí.

## Reutilizar
- `PreWorkoutDeviceEligibility` — inventario de la receta.
- `RunPreStartFlow` / `TreadmillConnectGuide` — pasos de calle/cinta **dentro** de
  `SessionStartGate` (un solo cover, no apilados).
- `ErgPreStartFlow` / `PM5LiveStreamView` — un PM5 por rol en la misma puerta.
- `BlockPreviewGate` — solo preview pedagógico entre bloques (sin dispositivos).
- `PhoneMirrorService.begin/end` — `begin` solo al cerrar la puerta; `end(save:false)`
  en cancelar si ya se había unido el reloj.

## Construir
1. **`SessionStartPolicy`** (Core) — qué exige esta receta y cuándo puede soltar
   el vivo (`canReleaseLive`).
2. **`SessionStartGate`** — una pantalla full-screen: calle/cinta → cada PM5 →
   estado honesto del reloj → **Empezar** (mismo flujo prescrito y libre).
3. **`WorkoutContainer`** — fase `.start` antes de `.active`; brief/builder abren
   la puerta, no el motor.

## Por qué la superficie nueva es inevitable
Sin un host único, cualquier “fix” vuelve a ser un `if` en cuatro sitios. La puerta
es el contrato: **nada llama `begin` ni `phase = .active` hasta `canReleaseLive`.**

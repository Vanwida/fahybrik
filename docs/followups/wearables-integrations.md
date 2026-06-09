# Wearables — roadmap integraciones propias

Decisión Alex 2026-05-27: integraciones propias por marca (vs pasarela
tipo Terra/Spike). Razón: solo 3 marcas relevantes (Garmin · Apple Watch
· Coros), coste cero, control de data shape, privacidad de datos élite.
Patrón: provider-agnostic ingestion ya documentado en memoria
`project_fahybrik_data_integrations`.

## Orden de implementación

1. **Apple Watch** — ✅ scaffold v1 (este commit). Sin dependencia externa.
2. **Garmin Health API** — bloqueado por aplicación partner.
3. **Coros Partner API** — bloqueado por aplicación partner (Alex submit).

---

## 1. Apple Watch — estado actual

Implementado en `ios/FAHYBRIKWatch/`:

| Archivo                       | Qué hace                                              |
| ----------------------------- | ----------------------------------------------------- |
| `FAHYBRIKWatchApp.swift`      | @main + bootstrap WatchPlanModel + connectivity       |
| `RootView.swift`              | Empty state / workout brief / live workout switch     |
| `LiveWorkoutView.swift`       | HR (zona color) + tiempo + kcal + distancia + pause/end |
| `LiveWorkoutSession.swift`    | HKWorkoutSession + HKLiveWorkoutBuilder + delegates   |
| `WatchPlanModel.swift`        | Plan del día decoded desde iPhone                     |
| `WatchConnectivityService.swift` | WCSession delegate watch side                      |

iOS side: `ios/FAHYBRIK/Watch/WatchConnectivityiOSService.swift` empuja
el next workout vía `WCSession.updateApplicationContext` cada vez que
`TodayView.loadNextWorkout` se ejecuta.

### Próximos pasos Apple Watch (fase 2)

- Detalle por segmento durante el entreno activo (sync de `WorkoutPlan`
  completa, no solo title). Necesita endpoint backend que devuelva el
  workout body por `assignment_id`.
- Always-on display: ajustar `LiveWorkoutView` para `.always` con menos
  intensidad de color.
- Haptics de cambio de zona HR / segmento.
- Workout types finos: distinguir running puro vs HYROX vs strength en
  `HKWorkoutConfiguration.activityType`. Actualmente default "mixed".
- Resync de check-in matinal desde el reloj (atleta abre el reloj y hace
  los 5 prompts en el watch sin tocar el iPhone).

### Decisiones pendientes Apple Watch

- ¿Companion-only o standalone watchOS app? Actualmente standalone
  (`WKWatchOnly: NO`), permite empezar entreno desde el reloj sin
  iPhone. Si Alex prefiere companion-only, ajustar Info.plist.

---

## 2. Garmin Health API — pendiente acción Alex

Estado: documentación en repo (`docs/garmin_oauth.md`,
`docs/garmin_data_scopes.md`, `docs/garmin_partner_application.md`).
Aplicación partner — revisar estado.

### Plan técnico cuando se apruebe

- Backend (otra sesión paralela): OAuth flow + webhook receiver +
  `garmin_*` columnas/tablas en shared schema.
- iOS: pantalla en Profile → "Conectar Garmin" que abre OAuth in-app
  browser → callback URL → token guardado server-side.
- Provider-agnostic ingestion: `BiometricProvider` interface; Garmin
  implementation lee de webhooks + REST polling para gaps.

### Connect IQ companion (fase 2+)

- App watchOS Garmin (Connect IQ SDK) que controle el entreno HYROX
  desde el reloj. Útil para atletas Garmin que no usan Apple Watch.
- Diferir hasta validar que hay demanda real entre los atletas Pablo.

---

## 3. Coros Partner API — pendiente acción Alex

### Estado research

- API oficial existe vía **partner application** (gated). No hay docs
  públicas abiertas — proceso similar a Garmin.
- Datos disponibles: activities, daily, sleep, HR vía REST + webhooks
  + mobile SDK (according to Coros help center).
- May 2026: Coros publicó MCP server oficial (primera marca endurance
  watch). Señal de apertura creciente a integraciones.
- **NO usar reverse-engineering** (proyectos como NYT87/coros-connect):
  session tokens privados, frágil, breaking changes sin aviso, invalida
  sesiones web del usuario. Inaceptable para producción élite.

### Pendiente Alex

Submit aplicación en
[support.coros.com → Submitting an API Application](https://support.coros.com/hc/en-us/articles/17085887816340-Submitting-an-API-Application).
Plazos desconocidos (similar a Garmin: semanas-meses).

### Plan técnico cuando se apruebe

Idéntico a Garmin: nuevo `CorosProvider: BiometricProvider`. Mismo
patrón webhook + REST, mismo schema `biometric_streams`.

---

## Provider-agnostic ingestion — contrato

Para que añadir provider nuevo sea un módulo y no refactor:

```swift
// shared interface (ios + posible reuse en backend si compartimos schema)
protocol BiometricProvider {
    var providerKey: String { get }              // "garmin" | "coros" | "apple_health"
    func connect(athleteId: String) async throws
    func disconnect(athleteId: String) async throws
    func fetchActivities(since: Date) async throws -> [ActivityRecord]
    func fetchBiometrics(since: Date) async throws -> [BiometricSample]
}
```

Backend side: `biometric_streams` tabla con `provider` columna
discriminadora. Tabla nueva `provider_connections` con
`{ athlete_id, provider_key, access_token, refresh_token, scopes,
connected_at, last_sync_at }`.

UI: pantalla única "Dispositivos" en Profile que muestra estado de
cada provider, con botón Conectar/Desconectar por marca.

---

## Decisiones que necesito de Alex

1. **¿Submit application Coros ya** (puedes hacerlo hoy desde el link)
   **o lo planificamos junto con la Garmin** para arrancar los procesos
   en paralelo?
2. **¿Confirmo que la aplicación Garmin partner está enviada**
   actualmente? Si está parada, retomarla.
3. **¿Quieres pantalla "Dispositivos" en Profile** v1 (solo Apple Health
   ya cableado + placeholders Garmin/Coros con "Próximamente") o
   esperamos a tener al menos 2 providers para construirla?

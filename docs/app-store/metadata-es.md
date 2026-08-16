---
title: App Store Connect — Spanish (es-ES) metadata
locale: es-ES
status: draft
last_updated: 2026-05-08
---

# FAHYBRID — App Store metadata (Spanish, primary locale)

Pegar tal cual en App Store Connect → My Apps → FAHYBRID → App Information / Pricing and Availability / iOS App.

## App name (max 30 caracteres)

```
FAHYBRID
```

(8 caracteres — margen para sufijo de evento si hace falta más adelante.)

## Subtitle (max 30 caracteres)

```
Entrenamiento HYROX élite
```

(26 caracteres.)

## Promotional text (max 170 caracteres — editable sin nueva revisión)

```
Plan ATR semanal de tu coach, ejecución guiada del workout, briefing diario y métricas que importan a un atleta HYROX. Cero ruido, sólo lo que mueve la aguja.
```

## Description (~200 palabras, max 4000 caracteres)

```
FAHYBRID es la app de entrenamiento para atletas HYROX serios que entrenan con un coach y quieren ejecutar cada sesión con la misma precisión con la que la planificó.

No es un generador de planes. Tu coach diseña tu macrociclo ATR (Acumulación, Transformación, Realización) en el panel; FAHYBRID adapta diariamente la sesión según tu HRV, sueño, RPE y fatiga acumulada — sin inventar el bloque, sin diluir la metodología.

Cada mañana ves tu Today: la sesión del día, el porqué del bloque ATR en el que estás, el briefing del coach y la check-in de 30 segundos que ajusta intensidad si tu cuerpo lo pide. Durante el workout, la pantalla guía cada serie, RPE objetivo, descanso, tempo y sustituciones inteligentes si te falta material o tiempo.

Integramos lo que ya usas: Apple Health (HRV, sueño, peso, workouts), Garmin Connect (HR zonas, carga aguda/crónica), Concept2 PM5 vía Bluetooth (rower, ski, bike erg con splits y stroke rate). Los carriles de carrera HYROX — sled, wall ball, burpees broad jumps, runs — tienen tracking nativo.

Diseñada con un solo coach (Pablo Pérez Gómez, Fabrik Training Club Barcelona) y sus atletas competidores. Densidad antes que simplicidad. Métricas crudas. Sin gamificación tonta. Si compites HYROX o entrenas en serio para hacerlo, esto es para ti.
```

(≈ 200 palabras / 1380 caracteres.)

## Keywords (max 100 caracteres separados por coma, sin espacios después de la coma)

```
HYROX,hybrid,coach,atletas,fuerza,resistencia,ATR,RPE,carrera,Concept2,wall ball,sled,Pablo,fitness
```

(99 caracteres.)

## Support URL

```
https://fahybrik.com/soporte
```

## Marketing URL (opcional)

```
https://fahybrik.com
```

## Privacy Policy URL (obligatorio)

```
https://fahybrik.com/privacy
```

## What's New in This Version (release notes — ≤ 4000 caracteres)

```
Primera versión privada en TestFlight para atletas de Fabrik Training Club Barcelona.

Incluye:
- Hoy: sesión del día con bloque ATR, briefing del coach y check-in matinal
- Workout activo: ejecución guiada series-a-serie con RPE objetivo, tempo y descanso
- Pre-workout brief: contexto del bloque, KPIs a mover, equipamiento necesario
- Onboarding: lesiones, 1RMs (sentadilla, press banca, peso muerto, push press), zonas de FC
- Performance: HRV, sueño, carga semanal, splits HYROX, PRs

Conectividad: Apple Health, Garmin Connect, Concept2 PM5 Bluetooth.

Reporta cualquier issue al coach por el chat in-app.
```

## App Review Information (no público — sólo para Apple)

- Contact name: Alex Sole / Pablo Pérez Gómez
- Contact email: coach@example.com
- Demo account: TBD — crear test account en `appstore-demo@fahybrik.com` con magic link pre-configurado para el reviewer
- Notes for reviewer:
  ```
  FAHYBRID requires Sign in with Apple to enter. We've prepared a demo account that bypasses Apple ID for the review:
  - Email: appstore-demo@fahybrik.com
  - The user will receive a magic link via Resend (whitelist this address)
  - Onboarding can be skipped for the reviewer with the launch arg --reviewer-demo
  - HealthKit prompts: deny is fine — app falls back to manual entry
  - Bluetooth prompt: deny is fine — Concept2 integration is optional
  - Race-day demo state available with --race-day-demo launch arg
  ```

## Copyright

```
© 2026 Vanwida (coach@example.com). All rights reserved.
```

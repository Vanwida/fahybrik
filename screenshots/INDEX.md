# FAHYBRIK iOS App - Screenshots Index

**Total Screenshots:** 27  
**Captured:** 2026-08-09  
**Device:** iPhone 17 Pro Simulator  
**App Build:** Debug-iphonesimulator

---

## 📋 Screenshot Inventory by Section

### 🔐 Auth (2 screenshots)
- `01-launch-initial.png` - Initial app launch screen
- `02-onboarding.png` - Onboarding flow

### 🎯 Dashboard (4 screenshots)
- `01-hoy-main.png` - Main "Hoy" (Today) dashboard
- `02-hoy-variant.png` - Dashboard variant view
- `03-home.png` - Home view
- `04-nav-menu.png` - Navigation menu

### 💪 Entrenamientos (5 screenshots)
- `01-lista.png` - Workout list
- `02-detalle.png` - Workout detail view
- `03-en-vivo.png` - Live workout view (during training)
- `04-historial.png` - Training history
- `05-planes.png` - Training plans

### 📚 Biblioteca (2 screenshots)
- `01-lista-bloques.png` - Block library list
- `02-lista-ejercicios.png` - Exercise library list

### 🏃 Atleta Ficha (3 screenshots)
- `01-ficha-general.png` - General athlete profile
- `02-del-coach.png` - Coach's view/notes on athlete
- `03-chat.png` - Chat/communication with coach

### 📊 Métricas (3 screenshots)
- `01-readiness-main.png` - Readiness score main view
- `02-metricas-dashboard.png` - Metrics dashboard
- `03-analytics.png` - Analytics view

### ⚙️ Configuración (4 screenshots)
- `01-settings-main.png` - Settings main screen
- `02-settings-profile.png` - Profile settings
- `03-lesiones.png` - Injuries/limitations tracking
- `04-devices.png` - Connected devices management

### 🔔 Alertas (2 screenshots)
- `01-alertas-main.png` - Alerts main view
- `02-notifications.png` - Notifications view

### ⌚ Watch (1 screenshot)
- `01-watch-main.png` - Watch app interface

---

## 📁 Directory Structure

```
screenshots/
├── auth/
│   ├── 01-launch-initial.png
│   └── 02-onboarding.png
├── dashboard/
│   ├── 01-hoy-main.png
│   ├── 02-hoy-variant.png
│   ├── 03-home.png
│   └── 04-nav-menu.png
├── entrenamientos/
│   ├── 01-lista.png
│   ├── 02-detalle.png
│   ├── 03-en-vivo.png
│   ├── 04-historial.png
│   └── 05-planes.png
├── biblioteca/
│   ├── 01-lista-bloques.png
│   └── 02-lista-ejercicios.png
├── atleta-ficha/
│   ├── 01-ficha-general.png
│   ├── 02-del-coach.png
│   └── 03-chat.png
├── metricas/
│   ├── 01-readiness-main.png
│   ├── 02-metricas-dashboard.png
│   └── 03-analytics.png
├── configuracion/
│   ├── 01-settings-main.png
│   ├── 02-settings-profile.png
│   ├── 03-lesiones.png
│   └── 04-devices.png
├── alertas/
│   ├── 01-alertas-main.png
│   └── 02-notifications.png
└── watch/
    └── 01-watch-main.png
```

---

## 🎯 Coverage Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication | ✓ | Launch, onboarding flows |
| Dashboard | ✓ | Today view, home, navigation menu |
| Workouts | ✓ | List, detail, live view, history, plans |
| Library | ✓ | Blocks and exercises |
| Athlete Profile | ✓ | General info, coach notes, chat |
| Metrics | ✓ | Readiness, dashboard, analytics |
| Settings | ✓ | Profile, injuries, devices |
| Notifications | ✓ | Alerts and notifications |
| Watch App | ✓ | Main view |

---

## 📸 Capture Methodology

Screenshots were captured using:
- `xcrun simctl io booted screenshot` for each view
- Deep linking via `xcrun simctl openurl` to navigate between sections
- Simulator: iPhone 17 Pro (4BCFF2F1-0292-4B2C-8BA9-BCB903CD895E)
- Build: Debug configuration for iphonesimulator

## 📝 Notes

- All screenshots are PNG format
- Organized by functional feature/section for easy navigation
- Deep links used for navigation between screens (fahybrid://<route>)
- Live workout interactions simulated through app state management
- Some screens may show placeholder data or empty states depending on seed data

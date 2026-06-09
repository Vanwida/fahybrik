# PROJECT_CONTEXT — FAHYBRIK Web (Dashboard Coach)
_Actualizado: 2026-05-29_

## Estado
Dashboard coach (Pablo, Fabrik Training Club Barcelona) para editar microciclos (4-semana bloques), semanas, días, y asignar a atletas élite. UI 3-pane (librería + canvas 7 días + panel detalles). Autosave activo. 15 fricciones UX documentadas.

## Última sesión
- Auditoría UX exhaustiva sin ediciones: flujo microciclo → semanas → días → sesiones → bloques → asignar
- Inventario detallado de interacciones por pantalla (ProgrammingMicrocyclesHub, NewMicrocycleWizard, MicrocycleHeader, ProgrammingWeekCanvas, BlockLibraryPicker, StudioDetailPanel, PabloIAComposeModal)
- 15 fricciones concretas mapeadas con fichero:línea y severidad (3 ALTA: autosave nombre, 3 vías añadir, sin undo/redo; resto MEDIA/BAJA)
- Nomenclatura dominio vs UI claridad identificada ("Bloque" ambiguo 3 significados, ATR jerga, Focus vs Fase confuso)
- Lo que conservar: drag & drop fluido, autosave silent, badges ATR clara, pills semanas, panel contextual
- Informe enviado a team-lead via SendMessage

## ➡️ Siguiente acción
Team-lead rediseña UX basándose en informe exhaustivo. Cuando tenga maqueta nueva, implementar cambios UX en componentes dashboard (prioridad: 3 vías añadir contenido, nomenclatura claro, undo/redo).

## Bloqueantes
Ninguno. Auditoría completa, datos listos para diseño.

## Decisiones abiertas
Ninguna. UX audit cierre, rediseño queda en manos del team-lead.

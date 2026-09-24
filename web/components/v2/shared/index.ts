// Componentes compartidos entre pantallas del panel (plan §7, ola 1.5). Todos
// sobre los primitivos de `@/components/v2/ui` y los contratos de datos del §4.
// Casi todos necesitan <PanelProviders> por encima (avisos con Deshacer).
// Mesa de QA con datos reales: /es/ajustes/sistema/compartidos.

export { AssignSheet } from './AssignSheet';
export type { AssignSheetProps } from './AssignSheet';
export { AthletePeek } from './AthletePeek';
export type { AthletePeekProps } from './AthletePeek';
export { ChatDrawer, ChatThread, ChatReplyBox } from './ChatDrawer';
export { SnoozeMenu, useSnooze } from './SnoozeMenu';
export type { SnoozeTarget, SnoozeUntil } from './SnoozeMenu';
export { PublishWeekControl, weekStateLine } from './PublishWeekControl';
export type { PublishWeekControlProps, AthleteWeekState } from './PublishWeekControl';
export { AthletePicker, toPickerAthlete } from './AthletePicker';
export type { PickedAthlete } from './AthletePicker';
export { GroupPicker, useGroupOptions } from './GroupPicker';
export type { PickedGroup } from './GroupPicker';
export type { PickerItem } from './EntityPicker';
export { StatusBadgeFor, SignalBadge, SIGNAL_ACTION_LABEL, signalTone } from './StatusBadgeFor';
export { ReadinessMini } from './ReadinessMini';
export type { ReadinessMiniValue } from './ReadinessMini';
export { AdherenceMini } from './AdherenceMini';
export type { AdherenceMiniValue } from './AdherenceMini';
export { WeekDots } from './WeekDots';
export { SetupChecklist, SetupProgress } from './SetupChecklist';
export type { SetupChecklistData } from './SetupChecklist';
export { countdown, weekdayDate, shortDate, dateRange } from './format';

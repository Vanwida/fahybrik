// Barrel for the dashboard UI primitives — one import site (DRY). The /hoy
// triage surface (F3) composes from here. Existing primitives first, then the
// F2 shared system (SPEC §9).

export { Card } from './Card';
export { FilterChip } from './FilterChip';
export { SearchInput } from './SearchInput';
export { SegmentedTabs, type SegmentedTab } from './SegmentedTabs';
export { StatusDot } from './StatusDot';

// ── F2 shared system (SPEC §9) ───────────────────────────────────────────────

export { StatusChip, type StatusChipProps, type StatusChipSize } from './StatusChip';
export {
  ReadinessRing,
  type ReadinessRingProps,
  type ReadinessRingSize,
} from './ReadinessRing';
export {
  BulkActionBar,
  type BulkActionBarProps,
  type BulkAction,
} from './BulkActionBar';
export {
  ToastProvider,
  useToast,
  type ToastTone,
  type ToastOptions,
  type ToastAction,
  type ToastRecord,
} from './Toast';
export { UndoToast, UNDO_TOAST_SECONDS, type UndoToastProps } from './UndoToast';
export { DetailSidePanel, type DetailSidePanelProps } from './DetailSidePanel';
export { LensTabs, type LensTabsProps, type Lens } from './LensTabs';
export {
  SkeletonRow,
  useSkeletonVisibility,
  type SkeletonRowProps,
} from './SkeletonRow';
export {
  EmptyState,
  type EmptyStateProps,
  type EmptyStateVariant,
  type EmptyStateAction,
} from './EmptyState';
export { ErrorState, type ErrorStateProps } from './ErrorState';
export {
  CommandPalette,
  type CommandPaletteProps,
  type CommandItem,
  type AthleteSearchResult,
  type AthleteAction,
} from './CommandPalette';

// Athlete glyph + quickview live in atoms/ (alongside AthleteAvatar) but are
// re-exported here so /hoy has a single import site for the shared system.
export {
  AthleteGlyph,
  type AthleteGlyphProps,
  type AthleteGlyphStatus,
  type AthleteGlyphSize,
} from '@/components/dashboard/atoms/AthleteGlyph';
export {
  AthleteQuickview,
  type AthleteQuickviewProps,
  type QuickviewDimension,
} from '@/components/dashboard/atoms/AthleteQuickview';

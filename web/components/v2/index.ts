// Barrel for the v2 shared primitives — later screen-agents import from
// '@/components/v2' so the primitive surface is one stable entrypoint.

export { AthleteAvatar } from './AthleteAvatar';
export { LevelBadge, type AthleteLevel } from './LevelBadge';
export { StatusDot, type V2Status } from './StatusDot';
export { AdherenceBar } from './AdherenceBar';
export { Pill, type PillTone, type PillVariant } from './Pill';
export { StatTile, type StatTone } from './StatTile';
export { ModalityCard } from './ModalityCard';
export { SegmentedControl, type SegmentOption } from './SegmentedControl';
export { EmptyState } from './EmptyState';
export { AuthorStamp, type AuthorStampKind, type AuthorStampProps } from './AuthorStamp';
export {
  MODALITY_META,
  type V2Modality,
  adherenceBand,
  type AdherenceBand,
} from './constants';
export { ThemeToggle } from './theme/ThemeToggle';
export {
  V2ThemeProvider,
  useV2Theme,
  type V2Theme,
} from './theme/V2ThemeProvider';
export { V2ThemeScript } from './theme/V2ThemeScript';

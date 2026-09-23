// Primitivos del panel del coach (contrato §3 de
// docs/auditoria-panel-coach/PLAN-CONSTRUCCION.md). Referencia viva con todas
// las variantes y estados: /es/ajustes/sistema.

export { Button, IconButton, buttonVariants } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant, IconButtonProps } from './Button';
export { Input, Textarea, Field } from './Input';
export type { InputProps, TextareaProps } from './Input';
export { Select } from './Select';
export type { SelectGroup, SelectOption, SelectProps } from './Select';
export { Combobox } from './Combobox';
export type { ComboboxOption, ComboboxProps } from './Combobox';
export { Checkbox, Switch } from './Checkbox';
export type { CheckboxProps, SwitchProps } from './Checkbox';
export { Tabs, TabPanel, SegmentedControl } from './Tabs';
export type { SegmentItem, TabItem } from './Tabs';
export { FilterChip, StatusBadge, Tag } from './Badges';
export type { StatusTone } from './Badges';
export { Avatar, initials } from './Avatar';
export { Card, CardHeader, List, ListRow, PageHeader, SectionHeader } from './Layout';
export { DataTable } from './DataTable';
export type { DataTableColumn, DataTableProps, SortDir, SortState } from './DataTable';
export { BulkBar } from './BulkBar';
export { KPI, KPIRow, Meter, Sparkline } from './Data';
export type { KpiDelta } from './Data';
export { Dialog, Sheet } from './Dialog';
export { Menu, Popover } from './Menu';
export type { MenuEntry } from './Menu';
export { Tooltip, TooltipProvider } from './Tooltip';
export { ToastProvider, useToast } from './Toast';
export type { ToastOptions, ToastTone } from './Toast';
export { Kbd } from './Kbd';
export { EmptyState, ErrorState, Skeleton, SkeletonRows } from './States';
export { PanelProviders } from './PanelProviders';

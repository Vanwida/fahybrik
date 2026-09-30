'use client';

// row-atoms — los dos botoncitos que comparten las filas del editor de correr:
// el icono de acción (subir, bajar, borrar…) y el chip «+ campo» de lo opcional.

import { ArrowDown, ArrowUp, ChevronUp, ChevronsUpDown, Repeat, Trash2, X, type LucideIcon } from 'lucide-react';
import { MIcon } from '@/components/ui/MIcon';
import { Button, IconButton } from '@/components/v2/ui';

const ICONS: Record<string, LucideIcon> = {
  arrow_upward: ArrowUp,
  arrow_downward: ArrowDown,
  delete: Trash2,
  repeat: Repeat,
  unfold_more: ChevronsUpDown,
  expand_less: ChevronUp,
  close: X,
};

export function IconBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: keyof typeof ICONS;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return <IconButton icon={ICONS[icon] ?? X} size="sm" label={label} disabled={disabled} onClick={onClick} className="size-6 w-6" />;
}

export function AddChip({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      <MIcon name={icon} size={14} />
      {label}
    </Button>
  );
}

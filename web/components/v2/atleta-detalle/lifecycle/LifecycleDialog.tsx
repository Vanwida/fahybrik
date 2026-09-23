'use client';

// LifecycleDialog — el diálogo que comparten pausar / dar de baja / re-alta y los
// de lesiones. Ahora es el primitivo Dialog (foco atrapado, Escape, vuelta del
// foco); mientras hay un cambio en vuelo no se puede cerrar.

import { Dialog } from '@/components/v2/ui';

export function LifecycleDialog({
  title,
  onClose,
  children,
  footer,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={title}
      size="sm"
      footer={footer}
    >
      <div className="flex flex-col gap-4">{children}</div>
    </Dialog>
  );
}

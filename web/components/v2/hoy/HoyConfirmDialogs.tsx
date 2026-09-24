'use client';

// Las dos acciones en bloque de Hoy que no se pueden deshacer (el aviso ya ha
// llegado) se confirman en el sitio, sin salir de Hoy: «Publicar a los N» y
// «Recordar pagos».

import type { SystemicGroup } from '@/lib/dashboard/hoy/hoy-types';
import { Button, Dialog } from '@/components/v2/ui';
import { toTheN } from './hoy-model';

export function PublishConfirmDialog({
  group,
  onCancel,
  onConfirm,
}: {
  group: SystemicGroup | null;
  onCancel: () => void;
  onConfirm: (g: SystemicGroup) => void;
}) {
  return (
    <Dialog
      open={group != null}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      title={group ? (group.count === 1 ? 'Publicar a 1 atleta' : `Publicar a los ${group.count} atletas`) : ''}
      description={group ? `${group.detail[0]?.toUpperCase()}${group.detail.slice(1)}.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => group && onConfirm(group)}>
            {group ? toTheN('Publicar', group.count) : 'Publicar'}
          </Button>
        </>
      }
    >
      <p className="t-body text-v2-muted">
        La verán ya en la app y les llega un aviso. Luego puedes ocultarla atleta por atleta, pero el aviso ya se habrá
        enviado.
      </p>
    </Dialog>
  );
}

export function RemindConfirmDialog({
  group,
  names,
  onCancel,
  onConfirm,
}: {
  group: SystemicGroup | null;
  /** Los nombres del grupo, para decir a quién le llega. */
  names: string[];
  onCancel: () => void;
  onConfirm: (g: SystemicGroup) => void;
}) {
  const n = group?.count ?? 0;
  const who = names.length > 0 && names.length <= 3 ? names.join(', ') : null;
  return (
    <Dialog
      open={group != null}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      title={n === 1 ? `Recordar el pago a ${names[0] ?? '1 atleta'}` : `Recordar el pago a los ${n}`}
      description={who && n > 1 ? who : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => group && onConfirm(group)}>
            {n === 1 ? 'Recordar' : toTheN('Recordar', n)}
          </Button>
        </>
      }
    >
      <p className="t-body text-v2-muted">
        A cada uno le llega un mensaje tuyo en su chat, con su nombre, para que revise la tarjeta en la app. La fila
        sigue aquí hasta que paguen.
      </p>
    </Dialog>
  );
}

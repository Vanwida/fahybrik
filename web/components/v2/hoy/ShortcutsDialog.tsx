'use client';

// «?» en Hoy: todos los atajos de la bandeja, en una tabla corta.

import { Dialog, Kbd } from '@/components/v2/ui';

const KEYS: ReadonlyArray<{ keys: string[]; what: string }> = [
  { keys: ['J', 'K'], what: 'Bajar y subir por la lista' },
  { keys: ['Enter'], what: 'Abrir el vistazo del atleta' },
  { keys: ['X'], what: 'Seleccionar la fila' },
  { keys: ['⇧', 'J / K'], what: 'Seleccionar mientras bajas o subes' },
  { keys: ['E'], what: 'Hecho' },
  { keys: ['H'], what: 'Posponer hasta nueva señal' },
  { keys: ['R'], what: 'Responder' },
  { keys: ['⌘', 'Z'], what: 'Deshacer lo último' },
  { keys: ['Esc'], what: 'Cerrar el vistazo o quitar la selección' },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Atajos de Hoy" size="sm">
      <dl className="flex flex-col divide-y divide-v2-border">
        {KEYS.map((k) => (
          <div key={k.what} className="flex items-center justify-between gap-4 py-2">
            <dt className="t-body-sm text-v2-muted">{k.what}</dt>
            <dd className="flex shrink-0 items-center gap-1">
              {k.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

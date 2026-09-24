'use client';

// «Tus marcadores»: los que el coach elige mirar de cada atleta (mig 0233; por
// defecto sentadilla, peso muerto, FC máx y 5 km). Los que faltan salen juntos en
// una línea con el camino para conseguirlos (programar un test).

import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Settings2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button, Checkbox, IconButton, Popover, Skeleton, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import type { AthleteKeyMarker } from '@/lib/dashboard/v2/atleta-detalle-types';
import { useFicha } from '../FichaContext';

interface Catalog {
  selected: string[];
  catalog: { key: string; label: string }[];
  max: number;
}

function Chooser({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Catalog | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    apiJson<Catalog>('/api/coach/key-markers')
      .then((d) => {
        setData(d);
        setPicked(d.selected);
      })
      .catch((err: unknown) => toast({ title: 'No se han podido cargar', description: errorMessage(err), tone: 'danger' }));
  }, [open, data, toast]);

  const save = async () => {
    setSaving(true);
    try {
      const d = await apiJson<Catalog>('/api/coach/key-markers', { method: 'POST', body: { keys: picked } });
      setData(d);
      setOpen(false);
      toast({ title: 'Marcadores guardados', description: 'Se ven así en la ficha de todos tus atletas.', tone: 'ok' });
      onSaved();
    } catch (err) {
      toast({ title: 'No se han podido guardar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const max = data?.max ?? 6;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      title={`Tus marcadores · hasta ${max}`}
      trigger={<IconButton icon={Settings2} label="Elegir tus marcadores" size="sm" />}
    >
      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {data.catalog.map((c) => {
              const on = picked.includes(c.key);
              return (
                <Checkbox
                  key={c.key}
                  checked={on}
                  disabled={!on && picked.length >= max}
                  onCheckedChange={(v) => setPicked((p) => (v ? [...p, c.key] : p.filter((k) => k !== c.key)))}
                  label={c.label}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-v2-border pt-3">
            <span className="t-meta text-v2-faint">Valen para todos tus atletas</span>
            <Button size="sm" variant="primary" loading={saving} disabled={picked.length === 0} onClick={() => void save()}>
              Guardar
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

export function KeyMarkersBlock({ markers }: { markers: AthleteKeyMarker[] }) {
  const { shell, refresh } = useFicha();
  const known = markers.filter((m) => m.value_label != null);
  const missing = markers.filter((m) => m.value_label == null);
  return (
    <div className="flex flex-col gap-1.5 border-t border-v2-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="t-label text-v2-faint">Tus marcadores</span>
        <Chooser onSaved={refresh} />
      </div>
      {known.map((m) => (
        <div key={m.key} className="flex items-baseline justify-between gap-3 t-body-sm">
          <span className="truncate text-v2-muted">{m.label}</span>
          <span className="inline-flex items-center gap-1 text-v2-fg t-tnum">
            {m.value_label}
            {m.trend === 'better' ? (
              <ArrowUpRight aria-label="mejor que la anterior" className="size-3.5 text-v2-ok" />
            ) : m.trend === 'worse' ? (
              <ArrowDownRight aria-label="peor que la anterior" className="size-3.5 text-v2-warn" />
            ) : null}
          </span>
        </div>
      ))}
      {missing.length > 0 ? (
        <p className="t-body-sm text-v2-faint">
          Faltan: {missing.map((m) => m.label).join(', ')} ·{' '}
          <Link
            href={`/atletas/${shell.athlete_id}?tab=rendimiento&seccion=zonas`}
            className="text-v2-muted underline decoration-v2-border-strong underline-offset-2 hover:text-v2-fg"
          >
            programar un test
          </Link>
        </p>
      ) : null}
    </div>
  );
}

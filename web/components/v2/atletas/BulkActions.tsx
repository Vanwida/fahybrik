'use client';

// La barra de la selección en Atletas: Asignar programa · Publicar semana ·
// Mensaje · <eje del coach> · Añadir a grupo · Pausar / Reanudar. Cada acción
// abre su previa (o actúa y ofrece deshacer) y, al terminar, se refresca la lista
// y se limpia la selección.

import { useState } from 'react';
import { CalendarCheck, ChevronDown, FolderPlus, MessageSquare, PauseCircle, PlayCircle, Send } from 'lucide-react';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import { BulkBar, Button, Menu, useToast } from '@/components/v2/ui';
import { AssignSheet } from '@/components/v2/shared/AssignSheet';
import { errorMessage } from '@/components/v2/shared/api';
import type { CoachLevel } from './load-atletas';
import { atletas, runBulk, skippedLine } from './bulk-api';
import { GroupDialog, MessageDialog, PauseDialog, PublishWeekDialog, ResumeDialog } from './BulkDialogs';

type Open = 'assign' | 'publish' | 'message' | 'group' | 'pause' | 'resume' | null;

export function BulkActions({
  selected,
  levels,
  axisLabel,
  today,
  weekStart,
  nextWeekStart,
  onClear,
  onDone,
}: {
  selected: RosterRow[];
  levels: CoachLevel[];
  axisLabel: string;
  today: string;
  weekStart: string;
  nextWeekStart: string;
  onClear: () => void;
  /** Tras una acción: recargar la lista (y limpiar la selección). */
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState<Open>(null);
  // Lo seleccionado al abrir: si la lista se recarga detrás, el diálogo no cambia de gente.
  const [frozen, setFrozen] = useState<RosterRow[]>([]);
  const show = (o: Open) => {
    setFrozen(selected);
    setOpen(o);
  };
  const close = () => setOpen(null);
  const done = onDone;

  const anyPaused = selected.some((r) => r.lifecycle === 'pausado');
  const anyActive = selected.some((r) => r.lifecycle !== 'pausado' && r.lifecycle !== 'baja');

  const setLevel = async (level: CoachLevel) => {
    const rows = selected;
    const before = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.level || r.level.id === level.id) continue;
      before.set(r.level.id, [...(before.get(r.level.id) ?? []), r.athlete_id]);
    }
    const hadNone = rows.filter((r) => !r.level).length;
    try {
      const res = await runBulk({ action: 'set_level', athlete_ids: rows.map((r) => r.athlete_id), level_id: level.id });
      toast({
        title: `${level.name} para ${atletas(res.changed)}`,
        description: skippedLine(res),
        tone: 'ok',
        undo:
          before.size > 0
            ? async () => {
                try {
                  await Promise.all(
                    [...before.entries()].map(([level_id, athlete_ids]) =>
                      runBulk({ action: 'set_level', athlete_ids, level_id }),
                    ),
                  );
                  toast({
                    title: 'Deshecho',
                    description:
                      hadNone > 0 ? `${atletas(hadNone)} no tenían ${axisLabel.toLocaleLowerCase('es')}: se quedan en ${level.name}.` : undefined,
                  });
                } catch (err) {
                  toast({ title: 'No se ha podido deshacer', description: errorMessage(err), tone: 'danger' });
                }
                done();
              }
            : undefined,
      });
      done();
    } catch (err) {
      toast({ title: `No se ha podido cambiar el ${axisLabel.toLocaleLowerCase('es')}`, description: errorMessage(err), tone: 'danger' });
    }
  };

  const common = { onClose: close, athletes: frozen, onDone: done };

  return (
    <>
      <BulkBar count={selected.length} onClear={onClear}>
        <Button size="sm" variant="ghost" icon={CalendarCheck} onClick={() => show('assign')}>
          Asignar programa
        </Button>
        <Button size="sm" variant="ghost" icon={Send} onClick={() => show('publish')}>
          Publicar semana
        </Button>
        <Button size="sm" variant="ghost" icon={MessageSquare} onClick={() => show('message')}>
          Mensaje
        </Button>
        {levels.length > 0 ? (
          <Menu
            side="top"
            align="start"
            trigger={
              <Button size="sm" variant="ghost" iconEnd={ChevronDown}>
                {axisLabel}
              </Button>
            }
            items={[
              { type: 'label', label: `Cambiar ${axisLabel.toLocaleLowerCase('es')} a…` },
              ...levels.map((l) => ({
                label: l.label && l.label !== l.name ? `${l.name} · ${l.label}` : l.name,
                onSelect: () => void setLevel(l),
              })),
            ]}
          />
        ) : null}
        <Button size="sm" variant="ghost" icon={FolderPlus} onClick={() => show('group')}>
          Añadir a grupo
        </Button>
        {anyActive ? (
          <Button size="sm" variant="ghost" icon={PauseCircle} onClick={() => show('pause')}>
            Pausar
          </Button>
        ) : null}
        {anyPaused ? (
          <Button size="sm" variant="ghost" icon={PlayCircle} onClick={() => show('resume')}>
            Reanudar
          </Button>
        ) : null}
      </BulkBar>

      {/* Montado solo al abrir: carga programas y grupos cuando hace falta, no con la página. */}
      {open === 'assign' ? (
        <AssignSheet
          open
          onClose={close}
          athleteIds={frozen.map((r) => r.athlete_id)}
          athletes={frozen.map((r) => ({ id: r.athlete_id, name: r.name, avatar_url: r.avatar_url }))}
          onAssigned={() => done()}
        />
      ) : null}
      {open === 'publish' ? (
        <PublishWeekDialog open {...common} weekStart={weekStart} nextWeekStart={nextWeekStart} today={today} />
      ) : null}
      {open === 'message' ? <MessageDialog open {...common} /> : null}
      {open === 'group' ? <GroupDialog open {...common} today={today} /> : null}
      {open === 'pause' ? <PauseDialog open {...common} /> : null}
      {open === 'resume' ? <ResumeDialog open {...common} /> : null}
    </>
  );
}

'use client';

// Cómo agrupa el coach a sus atletas: el NOMBRE del eje («Nivel» por defecto) y
// sus valores (`athlete_levels`) — crear, renombrar, ordenar, retirar y qué marca
// abre cada uno. Un coach nuevo empieza sin ninguno. El orden es la escalera:
// decide el orden de los selectores y el escalón de cada valor para la
// sugerencia de nivel. Retirar saca un valor de los selectores y de la
// sugerencia sin quitárselo a quien ya lo lleva; borrar solo se puede si nadie
// lo usa.

import { useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, MoreHorizontal, Plus } from 'lucide-react';
import {
  DEFAULT_LEVEL_AXIS_LABEL,
  LEVEL_AXIS_LABEL_MAX,
  effectiveLevelAxisLabel,
} from '@fahybrid/shared/domain/coach/level-axis';
import { resolveLadder } from '@fahybrid/shared/domain/coach/level-criteria';
import { LEVEL_LABEL_MAX, LEVEL_NAME_MAX } from '@fahybrid/shared/domain/coach/level-editor';
import type { CoachLevel } from '@/lib/coach/levels';
import { Button, EmptyState, IconButton, Input, Menu, useToast } from '@/components/v2/ui';
import { SettingRow, SettingsSection, TextSetting } from './SettingsKit';
import { SaveStatus, sendJson, useSaveState } from './autosave';
import { LevelCriteriaDialog } from './LevelCriteriaDialog';

type Levels = { levels: CoachLevel[]; archived: CoachLevel[] };

/** Plural de la etiqueta del eje para el encabezado («Nivel» → «Niveles», «Turno» → «Turnos»). */
function plural(label: string): string {
  const l = label.trim();
  if (/[aeiouáéó]$/i.test(l)) return `${l}s`;
  if (/ión$/i.test(l)) return `${l.slice(0, -3)}iones`;
  return `${l}es`;
}

function usageLine(u: CoachLevel['usage']): string | null {
  const parts = [
    u.athletes ? `${u.athletes} ${u.athletes === 1 ? 'atleta' : 'atletas'}` : null,
    u.groups ? `${u.groups} ${u.groups === 1 ? 'grupo' : 'grupos'}` : null,
    u.programs ? `${u.programs} ${u.programs === 1 ? 'programa' : 'programas'}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const STARTER = ['N1', 'N2', 'N3', 'N4', 'N5'];

export function LevelsSettings({ axisStored, initial }: { axisStored: string | null; initial: Levels }) {
  const toast = useToast();
  const [axis, setAxis] = useState(axisStored);
  const [data, setData] = useState<Levels>(initial);
  const [criteriaFor, setCriteriaFor] = useState<string | null>(null);
  const { state, error, run } = useSaveState();
  const axisLabel = effectiveLevelAxisLabel(axis);

  const ladder = useMemo(
    () =>
      resolveLadder(
        data.levels.map((l) => ({ id: l.id, name: l.name, criteria_set_at: l.criteria_set_at, criteria: l.criteria })),
      ),
    [data.levels],
  );

  const reload = async () => {
    try {
      const res = await fetch('/api/coach/levels');
      if (!res.ok) return;
      const body = (await res.json()) as Levels;
      setData({ levels: body.levels, archived: body.archived });
    } catch {
      // Sin red: la lista se queda como estaba; la escritura ya dijo si fue bien.
    }
  };

  /** Una escritura y, si fue bien, la lista fresca (con quién usa cada valor). */
  const mutate = (url: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) =>
    run(async () => {
      const res = await sendJson(url, method, body);
      if (!res.ok) return res;
      await reload();
      return { ok: true };
    });

  const move = (i: number, dir: -1 | 1) => {
    const ids = data.levels.map((l) => Number(l.id));
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    setData((d) => {
      const next = [...d.levels];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { ...d, levels: next };
    });
    void mutate('/api/coach/levels/reorder', 'PUT', { ids });
  };

  const archive = async (level: CoachLevel) => {
    const ok = await mutate(`/api/coach/levels/${level.id}`, 'PATCH', { archived: true });
    if (ok) {
      toast.toast({
        title: `${level.name} retirado`,
        tone: 'ok',
        undo: async () => {
          await sendJson(`/api/coach/levels/${level.id}`, 'PATCH', { archived: false });
          await reload();
        },
      });
    }
  };

  const remove = async (level: CoachLevel) => {
    const res = await sendJson(`/api/coach/levels/${level.id}`, 'DELETE');
    if (!res.ok) {
      toast.toast({ title: `No se ha borrado ${level.name}`, description: res.message, tone: 'danger' });
      return;
    }
    await reload();
    toast.toast({ title: `${level.name} borrado`, tone: 'ok' });
  };

  const starter = () =>
    run(async () => {
      for (const name of STARTER) {
        const res = await sendJson('/api/coach/levels', 'POST', { name });
        if (!res.ok) {
          await reload();
          return res;
        }
      }
      await reload();
      return { ok: true };
    });

  const editing = criteriaFor ? ladder.find((r) => r.id === criteriaFor) : null;
  const editingLevel = criteriaFor ? data.levels.find((l) => l.id === criteriaFor) : null;

  return (
    <SettingsSection
      id="niveles"
      title="Cómo agrupas a tus atletas"
      action={<SaveStatus state={state} error={error} />}
    >
      <TextSetting
        label="Nombre de tu clasificación"
        hint={`Por defecto «${DEFAULT_LEVEL_AXIS_LABEL}». Ponle el que uses: grupo, objetivo, turno…`}
        value={axis ?? ''}
        placeholder={DEFAULT_LEVEL_AXIS_LABEL}
        maxLength={LEVEL_AXIS_LABEL_MAX}
        save={async (v) => {
          const res = await sendJson<{ level_axis_label: string | null }>('/api/coach/level-axis', 'PATCH', {
            level_axis_label: v.trim() === '' ? null : v,
          });
          if (!res.ok) return res;
          setAxis(res.data.level_axis_label);
          return { ok: true };
        }}
      />

      <div className="flex flex-col gap-1 px-4 pt-3.5 pb-1">
        <span className="t-body font-medium text-v2-fg">{plural(axisLabel)}</span>
        <p className="t-body-sm text-v2-muted">
          En orden, del primero al último. Las marcas de cada uno sugieren {axisLabel.toLowerCase()} a un atleta nuevo.
        </p>
      </div>

      {data.levels.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState
            title={`Todavía no tienes ${plural(axisLabel).toLowerCase()}`}
            description="son opcionales: sin ellos tus atletas van igual"
            action={
              <Button size="sm" variant="secondary" onClick={() => void starter()}>
                Empezar con cinco (N1 a N5)
              </Button>
            }
          />
        </div>
      ) : (
        <ol aria-label={plural(axisLabel)}>
          {data.levels.map((level, i) => {
            const rung = ladder[i];
            return (
              <LevelRow
                key={level.id}
                level={level}
                position={i + 1}
                count={data.levels.length}
                marks={
                  rung && rung.criteria.length > 0
                    ? rung.is_default
                      ? 'Marcas por defecto'
                      : 'Tus marcas'
                    : 'Sin marcas'
                }
                onRename={(patch) => mutate(`/api/coach/levels/${level.id}`, 'PATCH', patch)}
                onMove={(dir) => move(i, dir)}
                onCriteria={() => setCriteriaFor(level.id)}
                onArchive={() => void archive(level)}
                onDelete={() => void remove(level)}
              />
            );
          })}
        </ol>
      )}

      <AddLevelRow
        axisLabel={axisLabel}
        onAdd={async (name, label) => mutate('/api/coach/levels', 'POST', { name, label: label || null })}
      />

      {data.archived.length > 0 ? (
        <details className="group px-4 py-3">
          <summary className="cursor-pointer t-body-sm text-v2-muted outline-none focus-visible:underline">
            Retirados ({data.archived.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {data.archived.map((level) => (
              <li key={level.id} className="flex min-h-10 flex-wrap items-center justify-between gap-2">
                <span className="t-body text-v2-muted">
                  {level.name}
                  {level.label && level.label !== level.name ? ` · ${level.label}` : ''}
                  {usageLine(level.usage) ? <span className="t-meta text-v2-faint"> · {usageLine(level.usage)}</span> : null}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void mutate(`/api/coach/levels/${level.id}`, 'PATCH', { archived: false })}
                >
                  Recuperar
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {editing && editingLevel ? (
        <LevelCriteriaDialog
          open
          onOpenChange={(open) => !open && setCriteriaFor(null)}
          levelName={editingLevel.name}
          axisLabel={axisLabel}
          rung={editing}
          save={async (criteria) => {
            const ok = await mutate(`/api/coach/levels/${editingLevel.id}/criteria`, 'PUT', { criteria });
            if (ok) setCriteriaFor(null);
            return ok;
          }}
        />
      ) : null}
    </SettingsSection>
  );
}

function LevelRow({
  level,
  position,
  count,
  marks,
  onRename,
  onMove,
  onCriteria,
  onArchive,
  onDelete,
}: {
  level: CoachLevel;
  position: number;
  count: number;
  marks: string;
  onRename: (patch: { name?: string; label?: string }) => Promise<boolean>;
  onMove: (dir: -1 | 1) => void;
  onCriteria: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(level.name);
  const [label, setLabel] = useState(level.label);
  const usage = usageLine(level.usage);
  const inUse = level.usage.athletes + level.usage.groups + level.usage.programs + level.usage.blocks > 0;

  const commitName = async () => {
    const next = name.replace(/\s+/g, ' ').trim();
    if (next === level.name) return setName(level.name);
    if (!next) return setName(level.name);
    if (!(await onRename({ name: next }))) setName(level.name);
  };
  const commitLabel = async () => {
    const next = label.trim();
    if (next === level.label) return;
    if (!next) return setLabel(level.label);
    if (!(await onRename({ label: next }))) setLabel(level.label);
  };

  return (
    <li className="flex flex-col gap-2 border-t border-v2-border px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden className="w-5 shrink-0 text-right t-meta text-v2-faint t-tnum">
          {position}
        </span>
        <Input
          id={`${id}-name`}
          aria-label={`Nombre corto (${position}.º)`}
          value={name}
          maxLength={LEVEL_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') setName(level.name);
          }}
          className="w-20 shrink-0 font-medium"
        />
        <Input
          aria-label={`Descripción de ${level.name}`}
          value={label}
          maxLength={LEVEL_LABEL_MAX}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => void commitLabel()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') setLabel(level.label);
          }}
          className="min-w-0 flex-1"
        />
      </div>
      <div className="flex items-center justify-between gap-2 pl-7 sm:pl-0">
        <span className="min-w-0 t-meta text-v2-faint sm:w-36 sm:truncate sm:text-right">{usage ?? 'Sin usar'}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button size="sm" variant="ghost" onClick={onCriteria} className="justify-end sm:w-36 pointer-coarse:h-11">
            {marks}
          </Button>
          <IconButton
            icon={ArrowUp}
            label="Subir"
            size="sm"
            disabled={position === 1}
            onClick={() => onMove(-1)}
            className="pointer-coarse:size-11"
          />
          <IconButton
            icon={ArrowDown}
            label="Bajar"
            size="sm"
            disabled={position === count}
            onClick={() => onMove(1)}
            className="pointer-coarse:size-11"
          />
          <Menu
            align="end"
            trigger={<IconButton icon={MoreHorizontal} label={`Más sobre ${level.name}`} size="sm" className="pointer-coarse:size-11" />}
            items={[
              { label: 'Retirar', onSelect: onArchive },
              { label: inUse ? 'Borrar (lo usa alguien)' : 'Borrar', onSelect: onDelete, danger: true, disabled: inUse },
            ]}
          />
        </div>
      </div>
    </li>
  );
}

function AddLevelRow({ axisLabel, onAdd }: { axisLabel: string; onAdd: (name: string, label: string) => Promise<boolean> }) {
  const id = useId();
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const n = name.replace(/\s+/g, ' ').trim();
    if (!n || busy) return;
    setBusy(true);
    const ok = await onAdd(n, label.trim());
    setBusy(false);
    if (ok) {
      setName('');
      setLabel('');
    }
  };

  return (
    <SettingRow label={`Añadir ${axisLabel.toLowerCase()}`} htmlFor={id}>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          id={id}
          value={name}
          maxLength={LEVEL_NAME_MAX}
          placeholder="Nombre corto"
          onChange={(e) => setName(e.target.value)}
          className="w-32"
        />
        <Input
          aria-label="Descripción"
          value={label}
          maxLength={LEVEL_LABEL_MAX}
          placeholder="Descripción (opcional)"
          onChange={(e) => setLabel(e.target.value)}
          className="min-w-40 flex-1"
        />
        <Button type="submit" size="md" icon={Plus} loading={busy} disabled={name.trim() === ''}>
          Añadir
        </Button>
      </form>
    </SettingRow>
  );
}

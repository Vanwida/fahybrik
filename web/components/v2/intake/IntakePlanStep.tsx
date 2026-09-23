'use client';

// «Su plan» en el alta: qué recibe el atleta al firmar y CUÁNDO lo ve. Cuatro
// caminos (ver `intakePlanChoiceSchema`): seguir con lo que ya tiene (su grupo),
// entrar en un grupo, un programa desde un lunes, o un plan solo para él. Cada
// opción enseña su línea — «Entra en HYROX mañanas · Base, semana 2 · empieza lun
// 28 sept · semana visible el sáb 26» — calculada en el servidor con la misma
// previa que «asignar a varios». Controlado por IntakeReview.

import { Circle, CircleDot } from 'lucide-react';
import { Card, CardHeader, EmptyState, List, ListRow, Select, buttonVariants } from '@/components/v2/ui';
import { Link } from '@/i18n/navigation';
import type { IntakePlanOptions } from '@/lib/coach/intake-plan-options';
import { dayLabel, intakePlanLine, visibleOn, type IntakePlanSummary } from '@/lib/coach/intake-plan-line';
import type { IntakePlanKind } from '@fahybrid/shared/schema/coach-intake';

export interface PlanDraft {
  kind: IntakePlanKind;
  group_id: string | null;
  program_id: string | null;
  start_date: string | null;
}

/** La elección por defecto: lo que ya tiene; si no, su primer grupo posible; si no, un programa. */
export function defaultPlanDraft(o: IntakePlanOptions | null): PlanDraft {
  const group = o?.groups.find((g) => g.preview) ?? null;
  const program = o?.programs[0] ?? null;
  const start = o?.mondays[0] ?? null;
  if (o?.current) return { kind: 'keep', group_id: group?.id ?? null, program_id: program?.id ?? null, start_date: start };
  if (group) return { kind: 'group', group_id: group.id, program_id: program?.id ?? null, start_date: start };
  if (program) return { kind: 'program', group_id: null, program_id: program.id, start_date: start };
  return { kind: 'personal', group_id: null, program_id: null, start_date: start };
}

/** Lo que recibe con la elección actual (null = la elección no está completa). */
export function planSummary(o: IntakePlanOptions | null, d: PlanDraft): IntakePlanSummary | null {
  const none: IntakePlanSummary = { kind: d.kind, group_name: null, program_name: null, week: null, weeks: null, start_date: null, visible_on: null };
  if (d.kind === 'personal') return none;
  if (!o) return null;
  if (d.kind === 'keep') return o.current;
  if (d.kind === 'group') return o.groups.find((g) => g.id === d.group_id)?.preview ?? null;
  const p = o.programs.find((x) => x.id === d.program_id);
  if (!p || !d.start_date) return null;
  return {
    kind: 'program',
    group_name: null,
    program_name: p.name,
    week: 1,
    weeks: p.weeks,
    start_date: d.start_date,
    visible_on: visibleOn(d.start_date, o.auto_publish_days),
  };
}

function Option({
  selected,
  title,
  detail,
  onSelect,
  children,
}: {
  selected: boolean;
  title: string;
  detail?: string | null;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  const Icon = selected ? CircleDot : Circle;
  return (
    <>
      <ListRow
        selected={selected}
        onClick={onSelect}
        leading={<Icon aria-hidden strokeWidth={1.75} className={selected ? 'size-4 text-v2-fg' : 'size-4 text-v2-faint'} />}
        title={
          <>
            {title}
            {selected ? <span className="sr-only"> (elegido)</span> : null}
          </>
        }
        detail={detail ?? undefined}
        className="pointer-coarse:min-h-14"
      />
      {selected && children ? (
        <div role="listitem" className="flex flex-wrap gap-2 border-b border-v2-border bg-v2-select px-3 pb-3 pl-10 last:border-b-0 sm:px-4 sm:pl-11">
          {children}
        </div>
      ) : null}
    </>
  );
}

export function IntakePlanStep({
  options,
  draft,
  onChange,
}: {
  options: IntakePlanOptions | null;
  draft: PlanDraft;
  onChange: (d: PlanDraft) => void;
}) {
  const today = options?.today ?? '';
  const summary = planSummary(options, draft);
  const set = (patch: Partial<PlanDraft>) => onChange({ ...draft, ...patch });
  const groups = options?.groups ?? [];
  const programs = options?.programs ?? [];
  const groupChoices = groups.filter((g) => g.preview || g.blocked == null);

  return (
    <Card padding="none">
      <CardHeader title="Su plan" subtitle="Qué recibe al asignar y cuándo lo ve" className="px-4 pt-4" />
      {!options ? (
        <div className="px-4 pb-4">
          <EmptyState title="No se han podido cargar tus grupos y programas" description="elige «Plan solo para él» o vuelve a intentarlo" />
        </div>
      ) : null}
      <List aria-label="Qué plan recibe" className="rounded-none border-x-0 border-b-0">
        {options?.current ? (
          <Option
            selected={draft.kind === 'keep'}
            title={options.current.group_name ? 'Seguir su grupo' : 'Seguir con su programa'}
            detail={intakePlanLine(options.current, today)}
            onSelect={() => set({ kind: 'keep' })}
          />
        ) : null}
        {groups.length > 0 ? (
          <Option
            selected={draft.kind === 'group'}
            title={options?.current ? 'Otro grupo' : 'Entrar en un grupo'}
            detail={groupChoices.length === 0 ? 'Ninguno de tus grupos tiene programas todavía' : null}
            onSelect={() => set({ kind: 'group', group_id: draft.group_id ?? groupChoices[0]?.id ?? null })}
          >
            <Select
              aria-label="Grupo"
              value={draft.group_id}
              onValueChange={(v) => set({ group_id: v })}
              options={groups.map((g) => ({
                value: g.id,
                label: g.blocked ? `${g.name} · ${g.blocked.toLowerCase()}` : g.name,
                disabled: g.preview == null,
              }))}
              placeholder="Elige un grupo"
              size="lg"
              className="min-w-56 pointer-coarse:h-11"
            />
          </Option>
        ) : null}
        <Option
          selected={draft.kind === 'program'}
          title="Un programa"
          detail={programs.length === 0 ? 'Todavía no tienes programas con semanas' : null}
          onSelect={() => set({ kind: 'program', program_id: draft.program_id ?? programs[0]?.id ?? null })}
        >
          {programs.length > 0 ? (
            <>
              <Select
                aria-label="Programa"
                value={draft.program_id}
                onValueChange={(v) => set({ program_id: v })}
                options={programs.map((p) => ({ value: p.id, label: `${p.name} · ${p.weeks} ${p.weeks === 1 ? 'semana' : 'semanas'}` }))}
                placeholder="Elige un programa"
                size="lg"
                className="min-w-56 pointer-coarse:h-11"
              />
              <Select
                aria-label="Empieza"
                value={draft.start_date}
                onValueChange={(v) => set({ start_date: v })}
                options={(options?.mondays ?? []).map((m) => ({ value: m, label: `Empieza ${dayLabel(m)}` }))}
                size="lg"
                className="min-w-44 pointer-coarse:h-11"
              />
            </>
          ) : (
            <Link href="/programar/programas" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              Escribir un programa
            </Link>
          )}
        </Option>
        <Option
          selected={draft.kind === 'personal'}
          title="Plan solo para él"
          detail={draft.kind === 'personal' ? null : 'Lo escribes tú desde su plan'}
          onSelect={() => set({ kind: 'personal' })}
        />
      </List>
      <div className="border-t border-v2-border px-4 py-3" aria-live="polite">
        {summary ? (
          <p className="t-body font-medium text-v2-fg">{intakePlanLine(summary, today)}</p>
        ) : (
          <p className="t-body text-v2-muted">Elige qué recibe para poder asignar.</p>
        )}
      </div>
    </Card>
  );
}

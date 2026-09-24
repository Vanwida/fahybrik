'use client';

// El editor en línea de una celda (Enter sobre la celda): el título del entreno,
// sus bloques A/B/C y la línea rápida. Cada línea aceptada se guarda al momento
// como el bloque siguiente. «Detalle» abre el compositor completo; «Marcar
// descanso» cambia el ESTADO del día (con confirmación si tiene entreno).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Moon, X } from 'lucide-react';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import { Button, IconButton, Input, Kbd } from '@/components/v2/ui';
import { DAY_LABELS_FULL } from '@/lib/dashboard/v2/planes-model';
import { blockLine } from '@/lib/dashboard/programming/cell-summary';
import { appendPart } from '@/lib/dashboard/programming/quick-line';
import { cellState, emptyDay, workoutSessions } from '@/lib/dashboard/programming/grid-model';
import { QuickLineInput } from './QuickLineInput';

const PANEL_W = 440;

export function CellQuickEditor({
  anchor,
  row,
  col,
  day,
  onCommit,
  onClose,
  onDetail,
  onRest,
}: {
  anchor: () => HTMLElement | null;
  row: number;
  col: number;
  day: WeekDay;
  onCommit: (day: WeekDay, label: string) => void;
  onClose: () => void;
  onDetail: () => void;
  onRest: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = anchor();
      if (!el) return;
      const r = el.getBoundingClientRect();
      const h = panelRef.current?.offsetHeight ?? 320;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8));
      const below = r.bottom + 4;
      const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below;
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    const ro = new ResizeObserver(place);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useEffect(() => inputRef.current?.focus(), []);

  // Cerrar al pulsar fuera (la celda que abrió cuenta como dentro).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchor()?.contains(t)) return;
      if ((t as HTMLElement).closest?.('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor, onClose]);

  const sessions = workoutSessions(day);
  const title = sessions[0]?.focus ?? '';
  const blocks = sessions[0]?.blocks ?? [];
  const extraEntrenos = sessions.length - 1;

  const removeBlock = (uid: string) => {
    const [first, ...rest] = sessions;
    if (!first) return;
    const remaining = (first.blocks ?? []).filter((b) => b.uid !== uid);
    const next: WeekDay =
      remaining.length === 0 && rest.length === 0 && !first.focus
        ? emptyDay(day.day_of_week)
        : { ...day, sessions: [{ ...first, blocks: remaining }, ...rest] };
    onCommit(next, 'Bloque quitado');
  };

  const setTitle = (value: string) => {
    const v = value.trim();
    if (v === title) return;
    if (sessions.length === 0) {
      if (!v) return;
      onCommit({ day_of_week: day.day_of_week, sessions: [{ kind: 'workout', template_id: null, focus: v.slice(0, 120), blocks: [] }] }, 'Título');
      return;
    }
    const [first, ...rest] = sessions;
    const s = { ...first! };
    if (v) s.focus = v.slice(0, 120);
    else delete s.focus;
    onCommit({ ...day, sessions: [s, ...rest] }, 'Título');
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Semana ${row + 1}, ${DAY_LABELS_FULL[col]}`}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: PANEL_W }}
      className="fixed z-[60] flex max-w-[calc(100vw-16px)] flex-col gap-3 rounded-panel border border-v2-border bg-v2-elevated p-3 text-v2-fg shadow-pop"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate t-label text-v2-faint">
          Semana {row + 1} · {DAY_LABELS_FULL[col]}
        </p>
        <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={onDetail}>
          Detalle
        </Button>
        <IconButton icon={X} label="Cerrar" shortcut="Esc" size="sm" onClick={onClose} />
      </div>

      <Input
        size="sm"
        defaultValue={title}
        key={title}
        maxLength={120}
        placeholder="Título del entreno (opcional)"
        aria-label="Título del entreno"
        onBlur={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            setTitle((e.target as HTMLInputElement).value);
            inputRef.current?.focus();
          }
        }}
      />

      {blocks.length > 0 ? (
        <ul className="flex flex-col divide-y divide-v2-border rounded-ctl border border-v2-border" aria-label="Bloques">
          {blocks.map((b, i) => {
            const l = blockLine(b, i);
            return (
              <li key={b.uid} className="flex items-center gap-2 py-1 pr-1 pl-2.5">
                <span className="w-3 shrink-0 text-[12px] font-semibold text-v2-faint">{l.letter}</span>
                <span className="min-w-0 flex-1 truncate t-body-sm t-tnum">{l.text}</span>
                <IconButton icon={X} label={`Quitar el bloque ${l.letter}`} size="sm" onClick={() => removeBlock(b.uid)} />
              </li>
            );
          })}
        </ul>
      ) : cellState(day) === 'rest' ? (
        <p className="flex items-center gap-1.5 t-body-sm text-v2-muted">
          <Moon aria-hidden className="size-3.5" strokeWidth={1.75} />
          Descanso. Escribe una línea para convertirlo en día de entreno.
        </p>
      ) : null}
      {extraEntrenos > 0 ? (
        <p className="t-meta text-v2-faint">
          +{extraEntrenos} {extraEntrenos === 1 ? 'entreno más' : 'entrenos más'} este día · en Detalle
        </p>
      ) : null}

      <QuickLineInput
        ref={inputRef}
        placeholder={blocks.length === 0 ? "press banca 4x4 @78-80% r90 · 45' carrera z2" : 'Siguiente bloque…'}
        onDetail={onDetail}
        onAccept={(parts) => {
          const next = parts.reduce((d, p) => appendPart(d, p), day);
          onCommit(next, parts.length === 1 ? 'Línea añadida' : `${parts.length} líneas añadidas`);
        }}
      />

      <div className="flex items-center justify-between gap-2 border-t border-v2-border pt-2">
        <Button size="sm" variant="ghost" icon={Moon} onClick={onRest} disabled={cellState(day) === 'rest'}>
          Marcar descanso
        </Button>
        <span className="hidden items-center gap-1.5 t-meta text-v2-faint pointer-fine:flex">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> otro ejercicio
        </span>
      </div>
    </div>
  );
}

'use client';

// La LÍNEA RÁPIDA: se escribe como siempre —«press banca 4x4 @78-80% r90»—, la
// gramática tipa la dosis en el acto y el catálogo del coach enlaza el
// ejercicio (con alternativas: ↑/↓ o clic). Enter la convierte en bloques
// guardables (uno por línea). Lo que no se entiende entero no entra: se dice.
// La usan la celda de un programa y el editor de una pieza de biblioteca.

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import { ambiguousBareRest } from '@fahybrid/shared/domain/import/dose';
import { Button, Input, Kbd } from '@/components/v2/ui';
import { doseText, lookupToken, parseQuickLine, partFromQuickLines } from '@/lib/dashboard/programming/quick-line';
import { cn } from '@/lib/utils';
import { learnSynonym, useResolve, type Resolution } from './use-exercise-resolve';

export const QuickLineInput = forwardRef<
  HTMLInputElement,
  {
    placeholder: string;
    onAccept: (parts: WeekDayPart[]) => void;
    onDetail?: () => void;
    'aria-label'?: string;
  }
>(function QuickLineInput({ placeholder, onAccept, onDetail, 'aria-label': ariaLabel = 'Añadir una línea' }, ref) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Record<number, number>>({});
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current!, []);

  const parse = useMemo(() => parseQuickLine(text), [text]);
  const tokens = useMemo(() => (parse.typed ? parse.lines.map(lookupToken) : []), [parse]);
  const { results, loading, failed } = useResolve(tokens.filter(Boolean));
  const resolutions: Array<Resolution | null> = useMemo(() => {
    let i = 0;
    return tokens.map((t) => (t ? (results?.[i++] ?? null) : null));
  }, [tokens, results]);
  const chosen = resolutions.map((r, i) => {
    if (!r) return null;
    const idx = picked[i];
    if (idx != null) return r.candidates[idx] ?? null;
    return r.best ? { id: r.best.id, name: r.best.name } : null;
  });
  const ready = parse.typed && !loading && chosen.length > 0 && chosen.every(Boolean);

  const accept = () => {
    if (!ready) return;
    const parts: WeekDayPart[] = [];
    parse.lines.forEach((line, i) => {
      const ex = chosen[i]!;
      const r = resolutions[i];
      if (r && (!r.best || r.best.id !== ex.id)) learnSynonym(tokens[i]!, ex);
      const part = partFromQuickLines([line], [{ id: ex.id, name: ex.name }]);
      if (part) parts.push(part);
    });
    if (parts.length === 0) return;
    onAccept(parts);
    setText('');
    setPicked({});
  };

  const cycle = (dir: 1 | -1) => {
    const r = resolutions[0];
    if (!r || r.candidates.length === 0) return;
    const current = picked[0] ?? Math.max(0, r.candidates.findIndex((c) => c.id === r.best?.id));
    setPicked({ ...picked, 0: (current + dir + r.candidates.length) % r.candidates.length });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        ref={inner}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPicked({});
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            accept();
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            cycle(e.key === 'ArrowDown' ? 1 : -1);
          }
        }}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="t-tnum"
        trailing={<Kbd>↵</Kbd>}
      />
      <LineFeedback
        text={text}
        onRewrite={(next) => {
          setText(next);
          setPicked({});
          inner.current?.focus();
        }}
        parse={parse}
        resolutions={resolutions}
        chosen={chosen}
        loading={loading}
        failed={failed}
        picked={picked}
        onPick={(lineIdx, candIdx) => {
          setPicked({ ...picked, [lineIdx]: candIdx });
          inner.current?.focus();
        }}
        onDetail={onDetail}
      />
    </div>
  );
});

function LineFeedback({
  text,
  onRewrite,
  parse,
  resolutions,
  chosen,
  loading,
  failed,
  picked,
  onPick,
  onDetail,
}: {
  text: string;
  onRewrite: (text: string) => void;
  parse: ReturnType<typeof parseQuickLine>;
  resolutions: Array<Resolution | null>;
  chosen: Array<{ id: string; name: string } | null>;
  loading: boolean;
  failed: boolean;
  picked: Record<number, number>;
  onPick: (line: number, candidate: number) => void;
  onDetail?: () => void;
}) {
  if (!text.trim()) return null;
  const ambiguous = ambiguousBareRest(text);
  if (ambiguous) {
    // «r12»: ni minutos ni segundos por defecto. Elegir reescribe la línea con
    // su unidad, así lo que se guarda es lo que se lee.
    const withUnit = (mark: string) =>
      onRewrite(text.slice(0, ambiguous.end) + mark + text.slice(ambiguous.end));
    return (
      <p role="status" className="flex flex-wrap items-center gap-1.5 t-body-sm text-v2-warn">
        <CircleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
        <span>Descanso: ¿{ambiguous.value} min o {ambiguous.value} s?</span>
        <Button size="sm" variant="secondary" onClick={() => withUnit("'")}>
          {ambiguous.value} min
        </Button>
        <Button size="sm" variant="secondary" onClick={() => withUnit("''")}>
          {ambiguous.value} s
        </Button>
      </p>
    );
  }
  if (!parse.typed) {
    return (
      <p role="status" className="flex items-start gap-1.5 t-body-sm text-v2-warn">
        <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
        <span>
          No lo entiendo entero todavía.
          {onDetail ? (
            <>
              {' '}
              <Button size="sm" variant="ghost" className="h-auto px-1 py-0 align-baseline text-v2-fg underline" onClick={onDetail}>
                Escríbelo en detalle
              </Button>
            </>
          ) : null}
        </span>
      </p>
    );
  }
  if (failed) return <p className="t-body-sm text-v2-danger">No se pudo buscar el ejercicio. Vuelve a intentarlo.</p>;
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
      {parse.lines.map((line, i) => {
        const r = resolutions[i];
        const ex = chosen[i];
        const dose = doseText(line.prescription);
        const alternatives = (r?.candidates ?? []).slice(0, 4);
        return (
          <div key={i} className="flex flex-col gap-1">
            <p className="flex flex-wrap items-baseline gap-x-1.5 t-body-sm">
              {loading ? (
                <span className="text-v2-faint">Buscando «{line.exercise_token || 'ejercicio'}»…</span>
              ) : ex ? (
                <span className="font-semibold text-v2-ok">{ex.name}</span>
              ) : (
                <span className="text-v2-warn">¿Qué ejercicio es «{line.exercise_token}»?</span>
              )}
              {dose ? <DoseWithUnits text={dose} /> : null}
            </p>
            {!loading && alternatives.length > (ex ? 1 : 0) ? (
              <div className="flex flex-wrap gap-1">
                {alternatives.map((c, ci) => {
                  const on = picked[i] === ci || (picked[i] == null && r?.best?.id === c.id);
                  return (
                    <Button
                      key={c.id}
                      size="sm"
                      variant={on ? 'secondary' : 'ghost'}
                      className={cn('h-6 px-2 text-[12px]', on && 'border-v2-fg')}
                      onClick={() => onPick(i, ci)}
                    >
                      {c.name}
                    </Button>
                  );
                })}
              </div>
            ) : null}
            {!loading && r && r.candidates.length === 0 ? (
              <p className="t-meta text-v2-faint">No está en tu catálogo. Créalo en Biblioteca › Ejercicios.</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// Un reloj de la dosis («2'», «90''», «1'30''») con su unidad a la vista y en
// negrita: 2′ no se confunde con 2″. La unidad es lo que más se equivoca al
// escribir deprisa, así que es lo que más se ve al leer.
const CLOCK_RE = /(\d+'\d+''|\d+''|\d+'(?!'))/g;

function clockGlyphs(clock: string): string {
  return clock.replace(/''/g, '″').replace(/'/g, '′');
}

function DoseWithUnits({ text }: { text: string }) {
  const pieces = text.split(CLOCK_RE);
  return (
    <span className="text-v2-muted t-tnum">
      {pieces.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-v2-fg">
            {clockGlyphs(p)}
          </strong>
        ) : (
          p
        ),
      )}
    </span>
  );
}

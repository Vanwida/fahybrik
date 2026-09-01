'use client';

// QuickAddLine — «escríbelo como siempre» (rediseño de microciclos, decisión 2):
// el input mono prominente bajo la cabecera del día. Parsea EN CLIENTE con la
// MISMA gramática determinista del importador (parseNotationCell, client-safe —
// precedente: RunStructureForm) en cada tecleo y pinta chips de lo entendido en
// vivo; Enter inserta el bloque tipado en la sesión activa. Contrato de
// honestidad: lo no entendido se dice y entra marcado para revisar con su texto
// verbatim — jamás se inventa un número. Atajo global «/» para enfocar.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseNotationCell,
  type ParsedLine,
} from '@fahybrid/shared/domain/import/notation';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription';
import { cn } from '@/lib/utils';

const PLACEHOLDER =
  "Escríbelo como siempre: press banca 4x4 @78-80% r90 · 10x400m r1' · 45' carrera z2";

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
}

export function QuickAddLine({ onAdd }: { onAdd: (lines: ParsedLine[]) => void }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // La gramática corre en cada tecleo — determinista y local, sin red.
  const lines = useMemo<ParsedLine[]>(
    () => (text.trim() ? parseNotationCell(text) : []),
    [text],
  );

  // «/» enfoca la línea desde cualquier sitio de la hoja — salvo que ya estés
  // escribiendo en otro campo o haya un diálogo abierto encima.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const submit = () => {
    if (lines.length === 0) return;
    onAdd(lines);
    setText('');
  };

  return (
    <div className="overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] transition-colors focus-within:border-[color:var(--v2-accent)] focus-within:shadow-[0_0_0_3px_var(--v2-accent-soft)]">
      <div className="flex items-center gap-3 px-4">
        <span aria-hidden className="v2-num text-reading font-bold text-[color:var(--v2-accent-text)]">
          ›
        </span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder={PLACEHOLDER}
          aria-label="Añadir al día escribiéndolo como siempre"
          className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:outline-none"
        />
        <kbd
          aria-hidden
          className="shrink-0 rounded-[var(--v2-r-2xs)] border border-[color:var(--v2-border)] px-1.5 text-label text-[color:var(--v2-faint)]"
        >
          /
        </kbd>
      </div>
      {lines.length > 0 ? (
        <div
          aria-live="polite"
          className="flex flex-wrap items-center gap-2 border-t border-dashed border-[color:var(--v2-border)] px-4 py-2.5"
        >
          <span className="v2-micro shrink-0">Entendido</span>
          {lines.map((l, i) => (
            <LineChips key={i} line={l} />
          ))}
          <button
            type="button"
            onClick={submit}
            className="v2-focus ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] px-2 py-1 text-xs font-bold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            añadir al día
            <kbd className="rounded-[var(--v2-r-2xs)] border border-[color:var(--v2-border-strong)] px-1 text-nano">
              ↵
            </kbd>
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Los chips de UNA línea parseada: nombre en tinta neutra, dosis entendida en
// verde (--v2-ok), lo no entendido en ámbar y con la verdad por delante.
function LineChips({ line }: { line: ParsedLine }) {
  const chip =
    'inline-flex items-center rounded-[var(--v2-r-pill)] px-2.5 py-1 text-xs font-bold';

  if (line.confidence === 'review') {
    return (
      <span
        className={cn(chip, 'bg-[color:var(--v2-warn-soft)] text-[color:var(--v2-warn)]')}
      >
        no lo pillo entero · entra para revisar
      </span>
    );
  }

  const dose = prescriptionToText(line.prescription);
  const name = line.exercise_token.trim();
  return (
    <>
      {name ? (
        <span className={cn(chip, 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-fg)]')}>
          {name}
        </span>
      ) : null}
      {line.confidence === 'incomplete' || !dose ? (
        <span
          className={cn(chip, 'bg-[color:var(--v2-warn-soft)] text-[color:var(--v2-warn)]')}
        >
          sin dosis · la pones tú
        </span>
      ) : (
        <span
          className={cn(
            chip,
            'v2-num bg-[color:var(--v2-ok-soft)] text-[color:var(--v2-ok)]',
          )}
        >
          {dose}
        </span>
      )}
    </>
  );
}

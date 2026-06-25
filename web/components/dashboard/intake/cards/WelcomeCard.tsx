// CARD 6 — BIENVENIDA & NOTAS. sendWelcome toggle + welcome textarea (prefilled
// from suggestions.welcome_draft, max 2000, char counter, disabled when send
// off, required-if-send gate), then a smaller "NOTAS INTERNAS · PRIVADAS" block
// with the notes textarea (max 2000). All state + welcomeValid gate preserved
// from IntakeDecision.

import { cn } from '@/lib/utils';
import { DecisionCard } from '../ui/DecisionCard';

const WELCOME_MAX = 2000;
const NOTES_MAX = 2000;

export function WelcomeCard({
  sendWelcome,
  onSendWelcomeChange,
  welcomeBody,
  onWelcomeBodyChange,
  notes,
  onNotesChange,
}: {
  sendWelcome: boolean;
  onSendWelcomeChange: (v: boolean) => void;
  welcomeBody: string;
  onWelcomeBodyChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
}) {
  const welcomeMissing = sendWelcome && welcomeBody.trim().length === 0;

  return (
    <DecisionCard
      step={6}
      title="Bienvenida & notas"
      eyebrow={<span className="micro-label">Opcional</span>}
    >
      <label className="mb-3 flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={sendWelcome}
          onChange={(e) => onSendWelcomeChange(e.target.checked)}
          className="focus-ring size-[18px] rounded-[5px] accent-[color:var(--accent)]"
        />
        <span className="text-[13.5px] font-semibold text-[color:var(--fg)]">
          Enviar mensaje al atleta al asignar
        </span>
      </label>

      <div className="relative">
        <textarea
          value={welcomeBody}
          onChange={(e) => onWelcomeBodyChange(e.target.value.slice(0, WELCOME_MAX))}
          disabled={!sendWelcome}
          rows={4}
          aria-label="Mensaje de bienvenida"
          placeholder="Escribe un mensaje de bienvenida…"
          className={cn(
            'focus-ring w-full resize-y rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] px-3.5 pb-7 pt-3 text-[13.5px] leading-relaxed text-[color:var(--fg)] placeholder:text-[color:var(--text-muted)]',
            !sendWelcome && 'opacity-50',
          )}
        />
        <span className="metric-num pointer-events-none absolute bottom-2 right-3 text-[11px] text-[color:var(--text-muted)]">
          {welcomeBody.length} / {WELCOME_MAX}
        </span>
      </div>
      {welcomeMissing ? (
        <p role="alert" className="mt-1 text-xs text-[color:var(--danger)]">
          Escribe el mensaje o desactiva el envío.
        </p>
      ) : null}

      <div className="mt-4">
        <span className="micro-label mb-2 block">Notas internas · privadas</span>
        <div className="relative">
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value.slice(0, NOTES_MAX))}
            rows={3}
            aria-label="Notas internas"
            placeholder="Notas para ti, no visibles para el atleta…"
            className="focus-ring w-full resize-y rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] px-3.5 pb-7 pt-3 text-[13.5px] leading-relaxed text-[color:var(--fg)] placeholder:text-[color:var(--text-muted)]"
          />
          <span className="metric-num pointer-events-none absolute bottom-2 right-3 text-[11px] text-[color:var(--text-muted)]">
            {notes.length} / {NOTES_MAX}
          </span>
        </div>
      </div>
    </DecisionCard>
  );
}

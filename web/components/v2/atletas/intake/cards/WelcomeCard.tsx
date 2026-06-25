// CARD 6 — BIENVENIDA & NOTAS. sendWelcome toggle + welcome textarea (prefilled
// from suggestions.welcome_draft, max 2000, char counter, disabled when send off,
// required-if-send gate), then a smaller "NOTAS INTERNAS · PRIVADAS" block with
// the notes textarea (max 2000). All state + welcomeValid gate preserved from V1.

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
      eyebrow={<span className="v2-micro">Opcional</span>}
    >
      <label className="mb-3 flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={sendWelcome}
          onChange={(e) => onSendWelcomeChange(e.target.checked)}
          className="v2-focus size-[18px] rounded-[5px] accent-[color:var(--v2-accent)]"
        />
        <span className="text-[13.5px] font-semibold text-[color:var(--v2-fg)]">
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
            'v2-focus w-full resize-y rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3.5 pb-7 pt-3 text-[13.5px] leading-relaxed text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-muted)]',
            !sendWelcome && 'opacity-50',
          )}
        />
        <span className="v2-num pointer-events-none absolute bottom-2 right-3 text-[11px] text-[color:var(--v2-muted)]">
          {welcomeBody.length} / {WELCOME_MAX}
        </span>
      </div>
      {welcomeMissing ? (
        <p role="alert" className="mt-1 text-xs text-[color:var(--v2-danger)]">
          Escribe el mensaje o desactiva el envío.
        </p>
      ) : null}

      <div className="mt-4">
        <span className="v2-micro mb-2 block">Notas internas · privadas</span>
        <div className="relative">
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value.slice(0, NOTES_MAX))}
            rows={3}
            aria-label="Notas internas"
            placeholder="Notas para ti, no visibles para el atleta…"
            className="v2-focus w-full resize-y rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3.5 pb-7 pt-3 text-[13.5px] leading-relaxed text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-muted)]"
          />
          <span className="v2-num pointer-events-none absolute bottom-2 right-3 text-[11px] text-[color:var(--v2-muted)]">
            {notes.length} / {NOTES_MAX}
          </span>
        </div>
      </div>
    </DecisionCard>
  );
}

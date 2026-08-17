'use client';

// El párrafo del sistema. Se genera al tocar. El coach tacha palabras.
// No es el recuadro vacío de #23: aquí no se pide un ensayo.

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { INTERVIEW_MIRROR_MAX } from '@fahybrid/shared/domain/coach/method-interview';

export function MirrorCard({
  generated,
  value,
  edited,
  onChange,
  onReset,
}: {
  generated: string;
  value: string;
  edited: boolean;
  onChange: (next: string) => void;
  onReset: () => void;
}) {
  const empty = generated.length === 0 && value.length === 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="v2-micro">Tu sistema, en voz alta</p>
          <p className="text-xs text-[color:var(--v2-muted)]">
            {empty
              ? 'Toca las casillas. Aquí aparece un párrafo. Tú lo corriges. La IA programa con eso.'
              : edited
                ? 'Has tachado el generado. Plan, chat y el conector leen este texto.'
                : 'Generado de tus casillas. Tacha lo que no suene a ti.'}
          </p>
        </div>
        {edited ? (
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            Volver al generado
          </Button>
        ) : null}
      </header>
      <Textarea
        value={value}
        maxLength={INTERVIEW_MIRROR_MAX}
        contador
        rows={10}
        placeholder="Cuando toques, el sistema se escribe aquí."
        onChange={(e) => onChange(e.target.value)}
        className="min-h-40 flex-1"
      />
    </section>
  );
}

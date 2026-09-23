// "Programar test" — one athlete, one test, one day (#34).
//
// No 'use client' directive: this is only ever rendered from TestsPanel, which already
// is the client boundary. Marking it again would make it a second entry point and the
// compiler would then demand serializable props for an onClose callback that never
// crosses the wire.
//
// The whole point is speed: three fields, all pre-filled with the sane answer, and a
// button. The re-test is decided HERE and not on some other screen, because the moment
// a coach schedules a test is the exact moment he is thinking about when to repeat it —
// making him come back later means it never gets scheduled at all.
//
// The last-done line under the picker is the one piece of information that changes the
// decision: repeating a 5K three weeks after the last one is noise, and he should be
// able to see that without leaving the sheet.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck } from 'lucide-react';
import { Button, Dialog, Input } from '@/components/v2/ui';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';

const REPEAT_OPTIONS: { label: string; weeks: number }[] = [
  { label: 'No repetir', weeks: 0 },
  { label: 'En 6 semanas', weeks: 6 },
  { label: 'En 12 semanas', weeks: 12 },
];

/** Tomorrow, box-local, as the default day: today is usually already planned. */
function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const LONG_FMT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return LONG_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

export function ProgramarTestSheet({
  athleteId,
  athleteName,
  library,
  onClose,
}: {
  athleteId: string;
  athleteName: string;
  library: { id: string; name: string; last_done: string | null }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [testId, setTestId] = useState(library[0]?.id ?? '');
  const [date, setDate] = useState(defaultDate());
  const [repeat, setRepeat] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = library.find((t) => t.id === testId) ?? null;

  async function submit() {
    if (!testId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/tests/${testId}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          athlete_ids: [athleteId],
          date,
          repeat_in_weeks: repeat > 0 ? repeat : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? 'No pudimos programar el test.');
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError('No pudimos programar el test.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
      title={`Programar test · ${athleteName}`}
      description="De tu biblioteca. Entra en su plan como un entreno normal y podrás moverlo o quitarlo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={CalendarCheck} loading={busy} disabled={!testId} onClick={submit}>
            Programar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="t-meta text-v2-muted">¿Cuál?</span>
          <ChipGroup
            mono={false}
            ariaLabel="Test"
            value={testId}
            onChange={setTestId}
            options={library.map((t) => ({ value: t.id, label: t.name }))}
          />
          {selected ? (
            <p className="t-meta text-v2-faint">
              {selected.last_done ? `Lo hizo por última vez el ${longDate(selected.last_done)}.` : 'No lo ha hecho nunca.'}
            </p>
          ) : null}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="t-meta text-v2-muted">¿Qué día?</span>
          <Input
            type="date"
            size="lg"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            className="max-w-[220px] t-tnum"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="t-meta text-v2-muted">Repetirlo</span>
          <ChipGroup
            mono={false}
            ariaLabel="Repetirlo"
            value={repeat}
            onChange={setRepeat}
            options={REPEAT_OPTIONS.map((o) => ({ value: o.weeks, label: o.label }))}
          />
        </div>

        {error ? (
          <p role="alert" className="t-body-sm text-v2-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

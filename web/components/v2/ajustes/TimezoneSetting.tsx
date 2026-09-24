'use client';

// El huso de tu club: el reloj de tu día — Hoy, cuándo se abre cada semana,
// cuándo vence un «posponer», la agenda y las horas de los correos
// (`coaches.timezone`, NULL = defecto del producto). Se guarda al elegir.
// La lista llega del servidor (`loadOfferableTimezones`): solo husos que conocen
// Intl y Postgres, no la lista entera del navegador.

import { useId, useMemo, useState } from 'react';
import { Button, Combobox } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from './SettingsKit';
import { sendJson, useSaveState } from './autosave';

export type TimezoneSettingData = { timezone: string | null; effective: string; default_timezone: string };

/** «UTC+2», «UTC−5», «UTC+5:30» ahora mismo en ese huso. */
function offsetOf(tz: string, at: Date): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    return (part ?? 'GMT').replace('GMT', 'UTC').replace('-', '−') || 'UTC';
  } catch {
    return '';
  }
}

/** «America/Mexico_City» → «Mexico City (América)». */
function labelOf(tz: string): string {
  const [region, ...rest] = tz.split('/');
  const city = (rest.at(-1) ?? region ?? tz).replace(/_/g, ' ');
  return rest.length > 0 ? `${city} · ${region}` : city;
}

export function TimezoneSetting({ initial, zones }: { initial: TimezoneSettingData; zones: readonly string[] }) {
  const id = useId();
  const [setting, setSetting] = useState(initial);
  const { state, error, run } = useSaveState();
  const options = useMemo(() => {
    const now = new Date();
    const list = zones.includes(setting.effective) ? zones : [setting.effective, ...zones];
    return list.map((tz) => ({ value: tz, label: labelOf(tz), hint: offsetOf(tz, now) }));
  }, [setting.effective, zones]);

  const save = (tz: string | null) =>
    run(async () => {
      const res = await sendJson<TimezoneSettingData>('/api/coach/club/timezone', 'PATCH', { timezone: tz });
      if (!res.ok) return res;
      setSetting(res.data);
      return { ok: true };
    });

  return (
    <SettingsSection title="Tu hora">
      <SettingRow
        label="Huso horario del club"
        htmlFor={id}
        hintId={`${id}-hint`}
        status={state}
        error={error}
        hint={
          <>
            Marca tu día: Hoy, cuándo se abre cada semana, cuándo vuelve lo pospuesto, tu agenda y las horas de los correos.{' '}
            <span className="t-tnum">Por defecto: {labelOf(setting.default_timezone)}.</span>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Combobox
            id={id}
            aria-label="Huso horario"
            options={options}
            value={setting.effective}
            onValueChange={(tz) => {
              if (tz && tz !== setting.effective) void save(tz);
            }}
            placeholder="Busca tu ciudad"
            size="lg"
            className="w-full max-w-80"
          />
          {setting.timezone != null ? (
            <Button size="sm" variant="ghost" onClick={() => void save(null)}>
              Usar {labelOf(setting.default_timezone)}
            </Button>
          ) : null}
        </div>
      </SettingRow>
    </SettingsSection>
  );
}

'use client';

// Cómo llamas a tu eje de clasificación («Nivel» por defecto). Sale en
// Atletas, Grupos y Programar allí donde hoy pone «Nivel».

import { DEFAULT_LEVEL_AXIS_LABEL, LEVEL_AXIS_LABEL_MAX } from '@fahybrid/shared/domain/coach/level-axis';
import { SettingsSection, TextSetting } from './SettingsKit';
import { sendJson } from './autosave';

export function LevelAxisSetting({ stored }: { stored: string | null }) {
  return (
    <SettingsSection title="Cómo agrupas a tus atletas">
      <TextSetting
        label="Nombre de tu clasificación"
        hint={`Por defecto «${DEFAULT_LEVEL_AXIS_LABEL}». Ponle el que uses: grupo, objetivo, turno…`}
        value={stored ?? ''}
        placeholder={DEFAULT_LEVEL_AXIS_LABEL}
        maxLength={LEVEL_AXIS_LABEL_MAX}
        save={async (v) => {
          const res = await sendJson('/api/coach/level-axis', 'PATCH', { level_axis_label: v.trim() === '' ? null : v });
          return res.ok ? { ok: true } : res;
        }}
      />
    </SettingsSection>
  );
}

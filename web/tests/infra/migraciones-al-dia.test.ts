import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { missingMigrations, repoVersions, report } from '../../scripts/migraciones-al-dia.mjs';

// La puerta de la build de producción (DECISIONS 2026-09-24 «Ningún deploy sin
// su migración»). La conexión es de Vercel; aquí se prueba la cuenta.

describe('migraciones-al-dia', () => {
  it('lee las versiones del repo como el migrador: nombre sin .sql, en orden', () => {
    expect(repoVersions(['0270_b.sql', 'README.md', '0005_a.sql', '0012_z.sql'])).toEqual([
      '0005_a',
      '0012_z',
      '0270_b',
    ]);
  });

  it('las migraciones reales del repo salen todas, con 0270', () => {
    const versions = repoVersions(readdirSync(resolve(__dirname, '../../../infra/migrations')));
    expect(versions).toContain('0270_execution_off_plan');
    expect(versions.every((v) => !v.endsWith('.sql'))).toBe(true);
  });

  it('el caso del 24-09: el diario llega a 0260 y el código trae 0270–0272', () => {
    const versions = ['0259_a', '0260_b', '0270_execution_off_plan', '0271_c', '0272_d'];
    const applied = new Set(['0259_a', '0260_b']);
    const missing = missingMigrations(versions, applied);
    expect(missing.pending).toEqual(['0270_execution_off_plan', '0271_c', '0272_d']);
    expect(missing.gaps).toEqual([]);
    expect(missing.newestApplied).toBe('0260_b');
  });

  it('una vieja sin registrar entre otras registradas es un hueco del diario, no una pendiente nueva', () => {
    const missing = missingMigrations(['0001_a', '0002_b', '0003_c', '0004_d'], new Set(['0001_a', '0003_c']));
    expect(missing.pending).toEqual(['0002_b', '0004_d']);
    expect(missing.gaps).toEqual(['0002_b']);
  });

  it('al día: nada pendiente, aunque el diario tenga versiones que este código no trae', () => {
    const missing = missingMigrations(['0001_a', '0002_b'], new Set(['0001_a', '0002_b', '0003_otra_rama']));
    expect(missing.pending).toEqual([]);
  });

  it('una base vacía: todo pendiente, ningún hueco', () => {
    const missing = missingMigrations(['0001_a', '0002_b'], new Set());
    expect(missing.pending).toEqual(['0001_a', '0002_b']);
    expect(missing.gaps).toEqual([]);
    expect(missing.newestApplied).toBeNull();
  });

  it('en producción el mensaje nombra cada una y dice cómo aplicarlas', () => {
    const text = report({ pending: ['0270_execution_off_plan'], gaps: [] }, { enforce: true });
    expect(text).toContain('0270_execution_off_plan');
    expect(text).toContain('pnpm --dir infra migrate');
    expect(text).toContain('la versión anterior sigue sirviendo');
    expect(text).not.toContain('backfill');
  });

  it('un hueco del diario se registra hasta el último hueco; las nuevas, después, se aplican', () => {
    const text = report({ pending: ['0002_b', '0003_c', '0009_z'], gaps: ['0002_b', '0003_c'] }, { enforce: true });
    expect(text).toContain('0002_b   (anterior a la última registrada)');
    expect(text).toContain('migrate:backfill --through=0003_c');
    expect(text.indexOf('backfill')).toBeLessThan(text.indexOf('Después aplica las demás'));
  });

  it('solo huecos: no manda ejecutar migraciones viejas', () => {
    const text = report({ pending: ['0002_b'], gaps: ['0002_b'] }, { enforce: true });
    expect(text).toContain('migrate:backfill --through=0002_b');
    expect(text).not.toContain('pnpm --dir infra migrate:dry-run');
  });

  it('en una preview avisa pero no manda aplicar nada', () => {
    const text = report({ pending: ['0270_execution_off_plan'], gaps: [] }, { enforce: false });
    expect(text).toContain('esta preview');
    expect(text).not.toContain('Redeploy');
  });
});

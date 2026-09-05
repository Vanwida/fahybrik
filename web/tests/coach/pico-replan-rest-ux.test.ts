import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function src(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('FH-79 Pico REPLAN UX — un control por superficie, no por celda', () => {
  test('SemanaCanvas: cero Quitar×7; las celdas solo abren drawer/editor', () => {
    const canvas = src('components/v2/atleta-detalle/plan/semana.tsx');
    expect(canvas).not.toMatch(/MarcarDescansoButton/);
    expect(canvas).not.toMatch(/Quitar esta sesión/);
    expect(canvas).not.toMatch(/Marcar día descanso/);
    expect(canvas).not.toMatch(/kind:\s*'rest'/);
    expect(canvas).not.toMatch(/>Quitar</);
    expect(canvas).not.toMatch(/aria-label="Marcar descanso"/);
    expect(canvas).toMatch(/onOpen\(s\.assignment_id\)/);
    expect(canvas).toMatch(/dayHref \? dayHref\(day\.iso_date\)/);
  });

  test('Drawer: Quitar esta sesión solo si scheduled; misma API de sesión', () => {
    const drawer = src('components/v2/atleta-detalle/SessionDetailDrawer.tsx');
    expect(drawer).toMatch(/QuitarEstaSesionButton/);
    expect(drawer).toMatch(/detail\?\.status === 'scheduled'/);
    expect(drawer).not.toMatch(/kind:\s*'rest'/);
    expect(drawer).not.toMatch(/MarcarDiaDescansoButton/);
  });

  test('Editor: Quitar esta sesión por SessionEditor scheduled + un Marcar día descanso', () => {
    const editor = src('components/v2/atleta-detalle/AthleteDayEditorScreen.tsx');
    expect(editor).toMatch(/QuitarEstaSesionButton/);
    expect(editor).toMatch(/MarcarDiaDescansoButton/);
    expect(editor).toMatch(/s\.status === 'scheduled'/);
    expect(editor).toMatch(/scheduledCount/);
    expect(editor).not.toMatch(/Quitar entreno/);
    expect(editor).not.toMatch(/kind:\s*'rest'/);
  });

  test('Confirm modal obligatorio; wipe N>1 pregunta ¿Quitar todas?', () => {
    const controls = src('components/v2/atleta-detalle/plan/rest-controls.tsx');
    expect(controls).toMatch(/¿Quitar todas\?/);
    expect(controls).toMatch(/¿Quitar esta sesión\?/);
    expect(controls).toMatch(/Quitar sesión/);
    expect(controls).toMatch(/Marcar día descanso/);
    expect(controls).toMatch(/assignment_id: params\.assignmentId/);
    expect(controls).not.toMatch(/undo|5s|5 s/i);
    expect(controls).toMatch(/scheduledCount > 1/);
  });
});

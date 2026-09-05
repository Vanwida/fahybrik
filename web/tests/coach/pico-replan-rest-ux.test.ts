import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { sesionPorId, shouldShowDrawerSessionRemove } from '@/lib/dashboard/v2/ficha-resumen';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function src(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

const CANVAS_SURFACES = [
  'components/v2/atleta-detalle/plan/semana.tsx',
  'components/v2/atleta-detalle/plan/carril.tsx',
  'components/v2/atleta-detalle/PlanTab.tsx',
] as const;

describe('FH-79 Pico REPLAN UX — un control por superficie, no por celda', () => {
  test('SemanaCanvas: cero destructivo en celdas; cabecera sin botones', () => {
    const canvas = src('components/v2/atleta-detalle/plan/semana.tsx');
    expect(canvas).not.toMatch(/MarcarDescansoButton/);
    expect(canvas).not.toMatch(/MarcarDiaDescansoButton/);
    expect(canvas).not.toMatch(/QuitarEstaSesionButton/);
    expect(canvas).not.toMatch(/rest-controls/);
    expect(canvas).not.toMatch(/Quitar/);
    expect(canvas).not.toMatch(/Marcar día descanso/);
    expect(canvas).not.toMatch(/kind:\s*'rest'/);
    expect(canvas).not.toMatch(/>Quitar</);
    expect(canvas).not.toMatch(/aria-label="Marcar descanso"/);
    expect(canvas).not.toMatch(/aria-label=\{?['"]Marcar/);
    expect(canvas).toMatch(/onOpen\(s\.assignment_id\)/);
    expect(canvas).toMatch(/dayHref \? dayHref\(day\.iso_date\)/);
    expect(canvas).toMatch(/data-semana-canvas/);
    expect(canvas).toMatch(/data-descanso-pasivo/);
    expect(canvas).toMatch(/function DiaColHeader/);

    const headerStart = canvas.indexOf('function DiaColHeader');
    const headerEnd = canvas.indexOf('\nfunction DiaCol(', headerStart + 1);
    const header = headerEnd > headerStart ? canvas.slice(headerStart, headerEnd) : '';
    expect(header.length).toBeGreaterThan(80);
    expect(header).not.toMatch(/<button/);
    expect(header).not.toMatch(/onClick/);
    expect(header).not.toMatch(/athleteId/);
    expect(header).not.toMatch(/assignment/);
    expect(header).not.toMatch(/fetch\(/);
  });

  test('Ficha Plan: ninguna superficie del lienzo importa controles rest', () => {
    for (const rel of CANVAS_SURFACES) {
      const text = src(rel);
      expect(text, rel).not.toMatch(/MarcarDescansoButton/);
      expect(text, rel).not.toMatch(/QuitarEstaSesionButton/);
      expect(text, rel).not.toMatch(/MarcarDiaDescansoButton/);
      expect(text, rel).not.toMatch(/aria-label="Marcar descanso"/);
      expect(text, rel).not.toMatch(/>Quitar</);
    }
    const tab = src('components/v2/atleta-detalle/PlanTab.tsx');
    expect(tab).toMatch(/planStatus/);
    expect(tab).toMatch(/sesionPorId/);
    expect(tab).toMatch(/SessionDetailDrawer/);
  });

  test('Drawer: Quitar sesión visible con plan scheduled, sin esperar al GET', () => {
    const drawer = src('components/v2/atleta-detalle/SessionDetailDrawer.tsx');
    expect(drawer).toMatch(/QuitarEstaSesionButton/);
    expect(drawer).toMatch(/shouldShowDrawerSessionRemove/);
    expect(drawer).toMatch(/planStatus/);
    expect(drawer).toMatch(/label="Quitar sesión"/);
    expect(drawer).toMatch(/ariaLabel="Quitar esta sesión"/);
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
    expect(controls).toMatch(/RestConfirmDialog/);
    expect(controls).toMatch(/LifecycleDialog/);
    expect(controls).not.toMatch(/setTimeout/);
    expect(controls).toMatch(/scheduledCount > 1/);
  });

  test('shouldShowDrawerSessionRemove: el plan basta; el detalle gana', () => {
    expect(
      shouldShowDrawerSessionRemove({
        planStatus: 'scheduled',
        isoDate: '2026-09-07',
      }),
    ).toBe(true);
    expect(
      shouldShowDrawerSessionRemove({
        planStatus: 'scheduled',
      }),
    ).toBe(false);
    expect(
      shouldShowDrawerSessionRemove({
        detailStatus: 'completed',
        planStatus: 'scheduled',
        isoDate: '2026-09-07',
      }),
    ).toBe(false);
    expect(
      shouldShowDrawerSessionRemove({
        detailStatus: 'scheduled',
        isoDate: '2026-09-07',
      }),
    ).toBe(true);
    expect(
      shouldShowDrawerSessionRemove({
        planStatus: 'completed',
        isoDate: '2026-09-07',
      }),
    ).toBe(false);
    expect(
      shouldShowDrawerSessionRemove({
        detailStatus: 'partial',
        planStatus: 'scheduled',
        isoDate: '2026-09-07',
      }),
    ).toBe(false);
  });

  test('sesionPorId encuentra la fila del plan por assignment', () => {
    const weeks = [
      {
        days: [
          {
            sessions: [
              {
                assignment_id: '11',
                iso_date: '2026-09-07',
                title: 'A',
                status: 'scheduled' as const,
                duration_min: null,
                format: null,
                rpe: null,
                modality: null,
                dose_lines: [],
                dose_more: 0,
              },
            ],
          },
        ],
      },
    ];
    expect(sesionPorId(weeks, '11')?.iso_date).toBe('2026-09-07');
    expect(sesionPorId(weeks, '99')).toBeNull();
  });
});

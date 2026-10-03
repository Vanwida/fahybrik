import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/v2/ui';
import { FichaContext, type FichaActions } from '@/components/v2/atleta-detalle/FichaContext';
import { StatusBanner } from '@/components/v2/atleta-detalle/ficha/StatusBanner';
import type { FichaShell } from '@/lib/dashboard/v2/atleta-detalle-types';
import { shell, signal } from './fixtures';

vi.mock('@/i18n/navigation', () => ({ Link: (props: ComponentProps<'a'>) => createElement('a', props) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function render(data: FichaShell, children: ReactNode = createElement(StatusBanner)) {
  const value: FichaActions = { shell: data, openChat: vi.fn(), openComposer: vi.fn(), openAssign: vi.fn(),
    openSession: vi.fn(), openWeekTool: vi.fn(), calendarVersion: 0, bumpCalendar: vi.fn(), refresh: vi.fn() };
  return load(renderToStaticMarkup(createElement(ToastProvider, null,
    createElement(FichaContext.Provider, { value }, children))));
}

function pending(over: Partial<FichaShell> = {}) {
  const data = shell(over);
  data.status = { ...data.status, key: 'vigilar', tone: 'warn', label: 'Vigilar', needs_you: true,
    signals: [
      signal({ kind: 'message_unanswered', label: 'Por responder', severity: 'warning',
        evidence: 'espera 41 d · 1 mensaje', dedupe_key: 'reply:11' }),
      signal({ kind: 'review_1on1_due', label: 'Revisión 1:1 pendiente', severity: 'warning',
        evidence: '85 d sin revisión · la tienes cada 30 d', dedupe_key: 'review:11' }),
    ] };
  return data;
}

describe('Ficha — estado compacto y avisos con controles propios', () => {
  it('una sola superficie integra respuesta, revisión y comunicados con evidencia completa y un control principal', () => {
    const $ = render(pending({ awaiting_reply: true, pending_comunicados: 3 }));
    expect($('section[aria-label="Estado y pendientes"]')).toHaveLength(1);
    expect($('button').filter((_, e) => $(e).text() === 'Responder')).toHaveLength(1);
    expect($('[aria-label="Hacer ahora"] > div button').text()).toBe('Responder');
    expect($.text()).toContain('espera 41 d · 1 mensaje');
    expect($('details').text()).toContain('85 d sin revisión · la tienes cada 30 d');
    expect($('details a[href="/atletas/11?tab=perfil&seccion=revisiones"]').text()).toBe('Revisar 1:1');
    expect($('details a[href="/atletas/11?tab=perfil&seccion=historial&historial=comunicado"]').text()).toBe('3 comunicados pendientes');
    expect($('button button, button a, a button')).toHaveLength(0);
  });

  it('el comentario largo y la espera comparten Responder, sin recortar ni repetir la acción', () => {
    const notes = 'Mi rodilla sigue molestando al bajar las escaleras y quiero saber cómo adaptar el entrenamiento de mañana';
    const $ = render(pending({ awaiting_reply: true,
      last_checkin: { on: '2026-09-22', notes, score: 0, answered: false } }));
    expect($.text()).toContain(notes);
    expect($.text()).toContain('espera 41 d');
    expect($('button').filter((_, e) => $(e).text() === 'Responder')).toHaveLength(1);
    const evidence = $('span').filter((_, e) => $(e).text().includes(notes)).first();
    expect(evidence.attr('class')).toContain('whitespace-normal');
    expect(evidence.parents('[class*="truncate"], [class*="line-clamp"]')).toHaveLength(0);
  });

  it.each(['activo', 'pausado', 'baja'] as const)('las críticas quedan fuera del pliegue y la revisión no desaparece en %s', (status) => {
    const data = pending();
    data.lifecycle = { ...data.lifecycle, status, pause_reason: 'lesion', paused_since: '2026-09-20',
      baja_at: '2026-09-20', baja_reason: 'lesion' };
    data.status.signals.push(signal({ kind: 'discomfort_reported', label: 'Molestia en rodilla',
      severity: 'critical', evidence: 'Rodilla derecha · comunicada hoy', dedupe_key: 'pain:11' }), signal({}));
    const $ = render(data);
    expect($('[role="alert"]')).toHaveLength(2);
    expect($('[role="alert"]').parents('details')).toHaveLength(0);
    expect($('[role="alert"] a[href="/atletas/11?tab=perfil&seccion=lesiones"]').text()).toBe('Revisar molestia');
    expect($('details a[href="/atletas/11?tab=perfil&seccion=revisiones"]')).toHaveLength(1);
    if (status === 'pausado') expect($.text()).toContain('su plan está congelado');
    if (status === 'baja') expect($.text()).toContain('el historial se conserva');
    if (status !== 'activo') {
      expect($.text()).not.toContain('Proponer descarga');
      expect($('[role="alert"] a[href="/atletas/11?tab=plan#estado-atleta"]').text()).toBe('Ver estado');
    }
  });

  it('la solicitud de pausa conserva confirmar/rechazar y convive con las críticas', () => {
    const data = pending();
    data.lifecycle.pending_request = { request_id: '18', reason: 'lesion' };
    data.status.signals.push(signal({ kind: 'discomfort_reported', label: 'Molestia en rodilla',
      severity: 'critical', dedupe_key: 'pain:11' }));
    const $ = render(data);
    expect($('button').filter((_, e) => $(e).text() === 'Confirmar pausa')).toHaveLength(1);
    expect($('button').filter((_, e) => $(e).text() === 'Rechazar')).toHaveLength(1);
    expect($('[role="alert"]').parents('details')).toHaveLength(0);
    expect($('a[href="/atletas/11?tab=perfil&seccion=lesiones"]')).toHaveLength(1);
  });

  it('lo desconocido sigue legible aunque haya tareas; cero es un dato y no una ausencia', () => {
    const missing = render(pending());
    expect(missing('[aria-label="Hacer ahora"] > div').first().text()).toContain('Readiness sin datos · Sin check-in');
    const known = render(pending({ readiness: { value: 0, baseline: null, baseline_readings: 1,
      trend_14d: [], observed_at: '2026-09-23', band: 'low' } }));
    expect(known.text()).not.toContain('Readiness sin datos');
    expect(known.text()).toContain('Sin check-in');
    const noSignals = render(shell());
    expect(noSignals.text()).toContain('Sin avisos pendientes');
    expect(noSignals.text()).not.toContain('Al día');
  });
});

import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import type { AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';
import type { HoyRow } from '@/lib/dashboard/hoy/hoy-types';
import { IndividualInboxRow } from '@/components/v2/hoy/IndividualInboxRow';
import { SystemicSection } from '@/components/v2/hoy/SystemicSection';
import { rowForVista } from '@/components/v2/hoy/hoy-model';

vi.mock('@/i18n/navigation', () => ({ Link: (props: ComponentProps<'a'>) => createElement('a', props) }));
const now = new Date('2026-10-02T10:00:00Z');
const signal = (kind: AthleteSignal['kind'], label: string, days: number): AthleteSignal => ({ kind,
  label, severity: 'warning', evidence: kind === 'review_1on1_due' ? '85 d sin revisión · la tienes cada 30 d' : 'espera 41 d · 1 mensaje',
  value: null, baseline: null, observed_at: null, window_label: null, action: kind === 'review_1on1_due' ? 'abrir_ficha' : 'responder',
  lens: kind === 'review_1on1_due' ? 'plan' : 'mensajes', dedupe_key: kind,
  first_seen_at: new Date(now.getTime() - days * 86_400_000).toISOString() });
const review = signal('review_1on1_due', 'Revisión 1:1 pendiente', 85);
const reply = signal('message_unanswered', 'Por responder', 41);
const row: HoyRow = { athlete_id: '1', name: 'Atleta con dos tareas', avatar_url: null, level_label: 'N3',
  primary: review, others: [reply], other_count: 1, age_label: '85 d', snoozable: true,
  causes: [{ signal: review }, { signal: reply }], scope_kind: review.kind };
function render(personal = row) {
  return load(renderToStaticMarkup(createElement(IndividualInboxRow, { row: personal, now, selected: false, active: false,
    negocio: false, weekStart: '2026-09-28', proposal: null, onOpen: vi.fn(), onToggle: vi.fn(), onAction: vi.fn(),
    onSnooze: vi.fn(), onDone: vi.fn(), onGroupAction: vi.fn(), onChange: vi.fn() })));
}

describe('Hoy — lectura completa y controles de causas individuales', () => {
  it('pinta una sola persona, las dos causas completas y sus dos acciones, sin botones anidados', () => {
    const $ = render();
    expect($('[role="listitem"]')).toHaveLength(1);
    expect($('button').filter((_, e) => $(e).text() === row.name)).toHaveLength(1);
    expect($.text()).toContain('Revisión 1:1 pendiente');
    expect($.text()).toContain('85 d sin revisión · la tienes cada 30 d');
    expect($.text()).toContain('espera 41 d · 1 mensaje');
    expect($('a[href="/atletas/1?tab=perfil&seccion=revisiones"]').text()).toBe('Revisar 1:1');
    expect($('button').filter((_, e) => $(e).text() === 'Responder')).toHaveLength(1);
    expect($('button button, button a')).toHaveLength(0);
    expect($.text()).not.toContain('+1 señal');
  });

  it('Por responder conserva la prioridad de revisión y solo muestra la acción del mensaje', () => {
    const $ = render(rowForVista(row, 'responder', now)!);
    expect($('button').filter((_, e) => $(e).text() === 'Responder')).toHaveLength(1);
    expect($('a')).toHaveLength(0);
    expect($.text()).toContain('También: Revisión 1:1 pendiente · 85 d sin revisión');
  });

  it('un lead único aparece en Negocio y una causa sin identidad no se etiqueta Afecta a varios', () => {
    const html = renderToStaticMarkup(createElement(SystemicSection, {
      groups: [
        { kind: 'leads_new', count: 1, title: '1 lead nuevo', detail: 'hace 1 h', athlete_ids: [] },
        { kind: 'awaiting_reply', count: 1, title: '1 por responder', detail: 'espera 41 d', athlete_ids: ['1'] },
      ], peopleOf: () => [], negocio: true, onPublish: vi.fn(), onAssign: vi.fn(), onRemind: vi.fn(),
      onOpenAthlete: vi.fn(), queueHrefOf: () => null,
    }));
    const $ = load(html);
    expect($('#hoy-negocio').text()).toContain('Negocio');
    expect($('#hoy-individual').text()).toContain('Pendiente');
    expect($.text()).not.toContain('Afecta a varios');
    expect($('a[href="/mensajes"]')).toHaveLength(1);
  });
});

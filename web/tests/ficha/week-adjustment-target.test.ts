import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import { buildHacerAhora, hacerAhoraCommand } from '@/lib/dashboard/v2/ficha-actions';
import { parseWeekAdjustmentReadQuery, pendingForAthlete, pendingForEvaluation, proposalIdFromSignal } from '@/lib/dashboard/v2/week-adjustment-period';
import { MissingPendingAdjustment } from '@/components/v2/atleta-detalle/rendimiento/EvaluarSemanaPanel';
import { shell, signal } from './fixtures';

vi.mock('@/i18n/navigation', () => ({ Link: (props: ComponentProps<'a'>) => createElement('a', props) }));

const pending = [
  { id: '1', athlete_id: '11', week_start: '2026-09-14' },
  { id: '2', athlete_id: '11', week_start: '2026-09-28' },
  { id: '3', athlete_id: '22', week_start: '2026-09-28' },
  { id: '9223372036854775807', athlete_id: '11', week_start: '2026-10-05' },
];
const status = (...signals: ReturnType<typeof signal>[]) => ({ ...shell().status, signals });

describe('Ajuste pendiente — identidad exacta desde la señal', () => {
  it('dos propuestas: el aviso nuevo selecciona su ID, sin abrir la antigua ni usar la semana actual', () => {
    const data = shell({ status: status(signal({ kind: 'week_adjustment_pending', dedupe_key: 'week_adjustment_pending:11:2' })) });
    const command = hacerAhoraCommand(buildHacerAhora(data)[0]!);
    expect(command).toEqual({ kind: 'review_adjustment', proposal_id: '2' });
    expect(command?.kind === 'review_adjustment' && pendingForAthlete(pending, '11', undefined, command.proposal_id))
      .toEqual(pending[1]);
  });

  it('dos señales distintas conservan dos comandos; solo una identidad idéntica se deduplica', () => {
    const a = signal({ kind: 'week_adjustment_pending', dedupe_key: 'week_adjustment_pending:11:1', evidence: 'Ajuste del 14' });
    const b = signal({ kind: 'week_adjustment_pending', dedupe_key: 'week_adjustment_pending:11:2', evidence: 'Ajuste del 28' });
    const chips = buildHacerAhora(shell({ status: status(a, b, a) }));
    expect(chips).toHaveLength(2);
    expect(chips.map(hacerAhoraCommand)).toEqual([
      { kind: 'review_adjustment', proposal_id: '1' }, { kind: 'review_adjustment', proposal_id: '2' },
    ]);
    expect(chips.map((c) => c.evidence)).toEqual([['Ajuste del 14'], ['Ajuste del 28']]);
  });

  it('ID desconocido o de otro atleta no sustituye el destino por su otra propuesta', () => {
    expect(pendingForAthlete(pending, '11', undefined, '404')).toBeNull();
    expect(pendingForAthlete(pending, '11', undefined, '3')).toBeNull();
    expect(pendingForAthlete([], '11', undefined, '2')).toBeNull();
  });

  it('una propuesta que ya salió de la lista pendiente no reaparece ni abre otra', () => {
    const afterReview = pending.filter((p) => p.id !== '2');
    expect(pendingForAthlete(afterReview, '11', undefined, '2')).toBeNull();
    expect(pendingForAthlete(afterReview, '11')).toEqual(pending[0]);
  });

  it('abrir manualmente conserva primera pendiente; semana explícita conserva solo N+1', () => {
    expect(pendingForAthlete(pending, '11')).toEqual(pending[0]);
    expect(pendingForAthlete(pending, '11', '2026-09-21')).toEqual(pending[1]);
    expect(pendingForAthlete(pending, '11', '2026-10-05')).toBeNull();
    expect(pendingForEvaluation(pending, undefined, '2')).toEqual(pending[1]);
  });

  it('el ID grande conserva precisión y alcanza la propuesta real como string', () => {
    const id = '9223372036854775807';
    expect(parseWeekAdjustmentReadQuery(new URLSearchParams({ proposal_id: id }))).toMatchObject({ success: true, data: { proposal_id: id } });
    expect(proposalIdFromSignal(`week_adjustment_pending:11:${id}`, '11')).toBe(id);
    expect(pendingForAthlete(pending, '11', undefined, id)?.id).toBe(id);
  });

  it.each(['x', '', '-', '1.5', '0', '-1', '01', '9223372036854775808', '12345678901234567890'])('query inválida %j falla sin lanzar', (id) => {
    expect(() => parseWeekAdjustmentReadQuery(new URLSearchParams({ proposal_id: id }))).not.toThrow();
    expect(parseWeekAdjustmentReadQuery(new URLSearchParams({ proposal_id: id })).success).toBe(false);
    expect(proposalIdFromSignal(`week_adjustment_pending:11:${id}`, '11')).toBeNull();
  });

  it.each(['proposal_id=1&proposal_id=2', 'proposal_id=2&proposal_id=2',
    'week_start=2026-09-21&week_start=2026-09-28', 'week_start=2026-09-21&proposal_id=2'])('origen ambiguo %s se rechaza', (query) => {
    expect(parseWeekAdjustmentReadQuery(new URLSearchParams(query)).success).toBe(false);
  });

  it('la gramática de señal comprueba atleta/tipo y no infiere el ID desde evidencia libre', () => {
    expect(proposalIdFromSignal('week_adjustment_pending:22:2', '11')).toBeNull();
    expect(proposalIdFromSignal('message_unanswered:11:2', '11')).toBeNull();
    expect(proposalIdFromSignal('week_adjustment_pending:11:2:3', '11')).toBeNull();
    const chips = buildHacerAhora(shell({ status: status(signal({ kind: 'week_adjustment_pending',
      dedupe_key: 'malformed', evidence: 'Propuesta #2 para la semana del 28' })) }));
    expect(hacerAhoraCommand(chips[0]!)).toBeNull();
    expect(chips[0]!.evidence.join(' ')).toContain('actualiza la ficha');
  });

  it('el vacío dirigido explica lo ocurrido y permite actualizar, sin evaluar otra semana', () => {
    const $ = load(renderToStaticMarkup(createElement(MissingPendingAdjustment, { onRetry: vi.fn() })));
    expect($.text()).toContain('Este ajuste no está disponible');
    expect($('button').text()).toBe('Actualizar ficha');
    expect($.text()).not.toContain('Evalúa');
  });
});

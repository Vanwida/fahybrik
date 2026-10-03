import { createElement, type ComponentProps, type DependencyList, type EffectCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/v2/ui';
import { FichaContext, type FichaActions } from '@/components/v2/atleta-detalle/FichaContext';
import { PerfilView } from '@/components/v2/atleta-detalle/perfil/PerfilView';
import { Timeline } from '@/components/v2/atleta-detalle/perfil/Timeline';
import { historialFilterHref, historialKind } from '@/components/v2/atleta-detalle/perfil/timeline-navigation';
import { TIMELINE_KINDS, type FichaPerfil, type TimelineEntry } from '@/lib/dashboard/v2/atleta-detalle-types';
import { shell } from './fixtures';

let currentUrl = new URL('https://example.test/es/atletas/11?tab=perfil&seccion=revisiones');
let readerUrl = new URL(currentUrl);
type NextHistoryState = { __NA?: boolean; _N?: boolean; __PRIVATE_NEXTJS_INTERNALS_TREE?: unknown };
let historyState: NextHistoryState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['fixture-tree'] };
let captured: ComponentProps<typeof Timeline> | null = null;
let observedEffects: Array<{ effect: EffectCallback; deps: DependencyList | undefined }> = [];
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useEffect: (effect: EffectCallback, deps?: DependencyList) => {
    observedEffects.push({ effect, deps });
    return actual.useEffect(effect, deps);
  } };
});
const restoreReader = vi.fn((url: URL) => { readerUrl = new URL(url); });
// Contrato del Next instalado (app-router.js): un state marcado cambia la URL
// nativa, pero omite ACTION_RESTORE. El lector Next conserva su snapshot anterior.
// Esta simulación prueba el contrato; el render SSR solo comprueba su presentación.
const replaceState = vi.fn((data: NextHistoryState | null, _title: string, href: string) => {
  const nextUrl = new URL(href, currentUrl);
  if (data?.__NA || data?._N) historyState = data;
  else {
    restoreReader(nextUrl);
    historyState = { ...data, __NA: historyState.__NA, __PRIVATE_NEXTJS_INTERNALS_TREE: historyState.__PRIVATE_NEXTJS_INTERNALS_TREE };
  }
  currentUrl = nextUrl;
});
function navigateNext(href: string | URL) {
  currentUrl = new URL(href, currentUrl);
  readerUrl = new URL(currentUrl);
}
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => readerUrl.pathname, useSearchParams: () => readerUrl.searchParams }));
vi.mock('@/i18n/navigation', () => ({ Link: (props: ComponentProps<'a'>) => createElement('a', props),
  useRouter: () => ({ refresh: vi.fn() }) }));
// Observa el controlador de Perfil, conservando el Timeline y todo el kit real.
vi.mock('@/components/v2/atleta-detalle/perfil/Timeline', async (importOriginal) => {
  const actual = await importOriginal<{ Timeline: typeof Timeline }>();
  return { Timeline: (props: ComponentProps<typeof Timeline>) => {
    captured = props;
    return createElement(actual.Timeline, props);
  } };
});

const entries: TimelineEntry[] = Array.from({ length: 46 }, (_, i) => ({ id: String(i),
  kind: i < 3 ? 'comunicado' : i === 3 ? 'revision' : 'test', at: '2026-10-03T10:00:00Z',
  title: i < 3 ? `Comunicado ${i + 1}` : i === 3 ? 'Revisión 1:1 realizada' : `Test ${i}`,
  detail: null, who: 'coach' as const }));
const perfil: FichaPerfil = { email: null, plan_mode: 'personal', onboarded_at: null,
  classification: { level_id: null, level_name: null, suggested_level_id: null, suggested_level_name: null,
    suggested_level_reason: null, training_days_per_week: null, levels: [], suggestion_gap: null,
    days_band: { min: 1, max: 7 }, level_axis_label: 'Nivel' },
  training_days: { days: [], training_days_per_week: null, has_availability: false }, review: null,
  sessions: [], billing: null, invoices: [], timeline: entries, upcoming: [],
  errors: ['clasificacion', 'dias', 'revisiones', 'pagos'] };

function render(athleteId = '11', timeline = entries) {
  const value: FichaActions = { shell: shell({ athlete_id: athleteId }), openChat: vi.fn(), openComposer: vi.fn(),
    openAssign: vi.fn(), openSession: vi.fn(), openWeekTool: vi.fn(), calendarVersion: 0, bumpCalendar: vi.fn(), refresh: vi.fn() };
  return load(renderToStaticMarkup(createElement(ToastProvider, null,
    createElement(FichaContext.Provider, { value }, createElement(PerfilView,
      { perfil: { ...perfil, timeline }, seccion: currentUrl.searchParams.get('seccion'), historial: null })))));
}
const pressed = (html: ReturnType<typeof render>) => html('#historial button[aria-pressed="true"]').text();

beforeEach(() => {
  navigateNext('https://example.test/es/atletas/11?tab=perfil&seccion=revisiones');
  historyState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['fixture-tree'] };
  captured = null;
  observedEffects = [];
  replaceState.mockClear();
  restoreReader.mockClear();
  vi.stubGlobal('window', { get location() { return currentUrl; }, history: { get state() { return historyState; }, replaceState } });
});
afterEach(() => vi.unstubAllGlobals());

describe('Historial — la URL controla la selección y los enlaces dentro de Perfil', () => {
  it('la navegación Todo → Comunicados vuelve a enfocar Historial tras el render, aunque seccion no cambie', () => {
    const scrollIntoView = vi.fn();
    const getElementById = vi.fn(() => ({ scrollIntoView }));
    vi.stubGlobal('document', { getElementById });
    navigateNext('/es/atletas/11?tab=perfil&seccion=historial');
    render();
    const before = observedEffects.find((e) => e.deps?.[0] === 'historial')!;
    observedEffects = [];
    navigateNext('/es/atletas/11?tab=perfil&seccion=historial&historial=comunicado');
    render();
    const after = observedEffects.find((e) => e.deps?.[0] === 'historial')!;
    expect(after.deps).not.toEqual(before.deps);
    after.effect();
    expect(getElementById).toHaveBeenCalledWith('historial');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('filtrar manualmente desde otra sección conserva la identidad de scroll de esa sección', () => {
    render();
    const before = observedEffects.find((e) => e.deps?.[0] === 'revisiones')!;
    observedEffects = [];
    captured!.selection!.onChange('comunicado');
    render();
    const after = observedEffects.find((e) => e.deps?.[0] === 'revisiones')!;
    expect(after.deps).toEqual(before.deps);
  });

  it('revisión → comunicados cambia Todo 46 a Comunicados 3 y solo muestra esas filas', () => {
    expect(pressed(render())).toBe('Todo46');
    navigateNext('/es/atletas/11?tab=perfil&seccion=historial&historial=comunicado');
    const html = render();
    expect(pressed(html)).toBe('Comunicados3');
    expect(html('#historial ol > li')).toHaveLength(3);
    expect(html('#historial').text()).not.toContain('Revisión 1:1 realizada');
  });

  it('Comunicados → Todo manual → el mismo enlace de comunicados reaplica su destino', () => {
    const href = '/es/atletas/11?tab=perfil&seccion=historial&historial=comunicado';
    navigateNext(href);
    expect(pressed(render())).toBe('Comunicados3');
    captured!.selection!.onChange(null);
    expect(currentUrl.searchParams.has('historial')).toBe(false);
    expect(readerUrl.searchParams.has('historial')).toBe(false);
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/es/atletas/11?tab=perfil&seccion=historial');
    expect(pressed(render())).toBe('Todo46');
    expect(currentUrl.pathname + currentUrl.search).not.toBe(href);
    navigateNext(href);
    expect(pressed(render())).toBe('Comunicados3');
  });

  it('selección manual → nuevo enlace → atrás recupera el filtro representado por su URL', () => {
    render();
    captured!.selection!.onChange('test');
    const manualUrl = new URL(currentUrl);
    expect(pressed(render())).toBe('Tests42');
    navigateNext('/es/atletas/11?tab=perfil&seccion=historial&historial=comunicado');
    expect(pressed(render())).toBe('Comunicados3');
    navigateNext(manualUrl);
    expect(pressed(render())).toBe('Tests42');
  });

  it('refrescar y cambiar sección conservan el filtro manual y su contexto', () => {
    navigateNext('/es/atletas/11?tab=perfil&seccion=historial&semana=2026-09-28&desde=estado%3Dvigilar#historial');
    render();
    captured!.selection!.onChange('comunicado');
    expect(replaceState).toHaveBeenCalledOnce();
    expect(currentUrl.searchParams.get('seccion')).toBe('historial');
    expect(currentUrl.searchParams.get('desde')).toBe('estado=vigilar');
    expect(currentUrl.searchParams.get('semana')).toBe('2026-09-28');
    expect(currentUrl.hash).toBe('#historial');
    expect(pressed(render())).toBe('Comunicados3');
    currentUrl.searchParams.set('seccion', 'revisiones');
    navigateNext(currentUrl);
    expect(pressed(render())).toBe('Comunicados3');
  });

  it.each(['', 'inventado', 'COMUNICADO', 'todo'])('valor inválido/ausente %j → Todo sin excepción', (value) => {
    currentUrl.searchParams.set('historial', value);
    navigateNext(currentUrl);
    expect(historialKind(currentUrl.searchParams)).toBeNull();
    expect(pressed(render())).toBe('Todo46');
    currentUrl.searchParams.delete('historial');
    navigateNext(currentUrl);
    expect(pressed(render())).toBe('Todo46');
  });

  it('cambiar de atleta usa su URL y sus filas, sin heredar el filtro anterior', () => {
    render();
    captured!.selection!.onChange('comunicado');
    expect(pressed(render())).toBe('Comunicados3');
    navigateNext('/es/atletas/22?tab=perfil');
    const html = render('22', [{ ...entries[3]!, id: 'new-athlete-review', title: 'Revisión del nuevo atleta' }]);
    expect(pressed(html)).toBe('Todo1');
    expect(html('#historial').text()).toContain('Revisión del nuevo atleta');
    expect(html('#historial').text()).not.toContain('Comunicado 1');
  });

  it('state __NA real reproduce el bypass; Todo con null actualiza el lector y conserva el árbol de Next', () => {
    const href = '/es/atletas/11?tab=perfil&seccion=historial&historial=comunicado';
    navigateNext(href);
    const tree = historyState.__PRIVATE_NEXTJS_INTERNALS_TREE;
    const todoHref = historialFilterHref(currentUrl.pathname, currentUrl.search, null);
    replaceState(historyState, '', todoHref);
    expect(currentUrl.searchParams.has('historial')).toBe(false);
    expect(readerUrl.searchParams.get('historial')).toBe('comunicado');
    expect(restoreReader).not.toHaveBeenCalled();
    expect(pressed(render())).toBe('Comunicados3');

    navigateNext(href);
    render();
    captured!.selection!.onChange(null);
    expect(restoreReader).toHaveBeenCalledOnce();
    expect(readerUrl.searchParams.has('historial')).toBe(false);
    expect(historyState.__NA).toBe(true);
    expect(historyState.__PRIVATE_NEXTJS_INTERNALS_TREE).toBe(tree);
    expect(pressed(render())).toBe('Todo46');
  });

  it.each(TIMELINE_KINDS)('la elección manual de %s queda enlazable y usa el resolutor común', (kind) => {
    const href = historialFilterHref('/es/atletas/11', '?tab=perfil&seccion=historial', kind);
    expect(historialKind(new URL(href, currentUrl).searchParams)).toBe(kind);
  });

  it('el Timeline controlado atiende el destino actual sobre un initial antiguo; el modo local sigue disponible', () => {
    const value: FichaActions = { shell: shell(), openChat: vi.fn(), openComposer: vi.fn(), openAssign: vi.fn(),
      openSession: vi.fn(), openWeekTool: vi.fn(), calendarVersion: 0, bumpCalendar: vi.fn(), refresh: vi.fn() };
    const timeline = (selection?: ComponentProps<typeof Timeline>['selection']) => load(renderToStaticMarkup(
      createElement(ToastProvider, null, createElement(FichaContext.Provider, { value },
        createElement(Timeline, { entries, today: '2026-10-03', initial: 'revision', selection })))));
    expect(timeline({ kind: 'comunicado', onChange: vi.fn() })('button[aria-pressed="true"]').text()).toBe('Comunicados3');
    expect(timeline({ kind: null, onChange: vi.fn() })('button[aria-pressed="true"]').text()).toBe('Todo46');
    expect(timeline()('button[aria-pressed="true"]').text()).toBe('1:11');
  });
});

// Lógica pura de los componentes compartidos del panel (components/v2/shared) y
// de los loaders que los alimentan: puntos de la semana, primeros pasos, textos
// de publicar/asignar y fechas. Sin base de datos.

import { describe, expect, test } from 'vitest';
import { buildWeekDots, type PeekSession } from '@/lib/coach/athlete-peek';
import { buildSetupChecklist, type SetupFacts } from '@/lib/coach/setup-checklist';
import {
  athleteLine,
  deliveryLine,
  receivingCount,
  weekDueSummary,
  weekStateLine,
} from '@/components/v2/shared/logic';
import { countdown, mondayLabel, upcomingMondays, weekdayDate } from '@/components/v2/shared/format';
import type { AssignPreviewAthlete } from '@fahybrid/shared/schema/assign-many';

const MON = '2026-09-21';
const WED = '2026-09-23';

const s = (day: string, status: PeekSession['status'], extra: Partial<PeekSession> = {}): PeekSession => ({
  scheduled_for: day,
  title: 'Umbral',
  status,
  executed: false,
  excluded: false,
  ...extra,
});

describe('buildWeekDots', () => {
  test('hecho, sin hacer, hoy pendiente, futuro y descanso', () => {
    const days = buildWeekDots(
      [
        s('2026-09-21', 'completed'),
        s('2026-09-22', 'scheduled'),
        s('2026-09-23', 'scheduled'),
        s('2026-09-25', 'scheduled'),
      ],
      MON,
      WED,
      true,
    );
    expect(days.map((d) => d.state)).toEqual(['done', 'missed', 'pending', 'rest', 'pending', 'rest', 'rest']);
    expect(days.find((d) => d.is_today)?.date).toBe(WED);
  });

  test('una ejecución registrada cuenta como hecho aunque el estado no lo diga', () => {
    const [mon] = buildWeekDots([s('2026-09-21', 'scheduled', { executed: true })], MON, WED, true);
    expect(mon?.state).toBe('done');
  });

  test('semana oculta: lo pasado sin hacer no es «sin hacer» (no podía verlo)', () => {
    const [mon] = buildWeekDots([s('2026-09-21', 'scheduled')], MON, WED, false);
    expect(mon?.state).toBe('pending');
  });

  test('pausa / descanso por lesión = descanso', () => {
    const [mon] = buildWeekDots([s('2026-09-21', 'scheduled', { excluded: true })], MON, WED, true);
    expect(mon?.state).toBe('rest');
  });

  test('un día con dos entrenos y uno sin hacer = sin hacer', () => {
    const [mon] = buildWeekDots([s('2026-09-21', 'completed'), s('2026-09-21', 'missed')], MON, WED, true);
    expect(mon?.state).toBe('missed');
    expect(mon?.sessions.map((x) => x.done)).toEqual([true, false]);
  });

  test('«2 de 3 debidas» cuenta lo pasado y hoy solo si está hecho', () => {
    const days = buildWeekDots(
      [s('2026-09-21', 'completed'), s('2026-09-22', 'missed'), s('2026-09-23', 'scheduled')],
      MON,
      WED,
      true,
    );
    expect(weekDueSummary(days, WED)).toEqual({ due: 2, done: 1 });
    const doneToday = buildWeekDots([s('2026-09-23', 'completed')], MON, WED, true);
    expect(weekDueSummary(doneToday, WED)).toEqual({ due: 1, done: 1 });
  });
});

const EMPTY: SetupFacts = {
  club_named: false,
  club_logo: false,
  method_written: false,
  levels: 0,
  library_entrenos: 0,
  programs: 0,
  groups_with_plan: 0,
  tests: 0,
  negocio: false,
  availability_slots: 0,
  max_athletes: null,
  athletes: 0,
  invitations: 0,
  athletes_with_plan: 0,
  athletes_with_visible_week: 0,
};

describe('buildSetupChecklist', () => {
  test('coach nuevo: el camino corto (3) va primero y el método (6) es opcional', () => {
    const c = buildSetupChecklist(EMPTY);
    expect(c.steps.slice(0, 3).map((x) => x.key)).toEqual(['primer_atleta', 'primer_plan', 'primera_semana']);
    expect(c.total).toBe(3);
    expect(c.done).toBe(0);
    expect(c.complete).toBe(false);
    expect(c.method).toEqual({ done: 0, total: 6 });
    expect(c.steps.filter((x) => x.track === 'metodo').every((x) => x.optional)).toBe(true);
    expect(c.steps.filter((x) => x.track === 'empieza').every((x) => !x.optional)).toBe(true);
    expect(c.steps.map((x) => x.key)).not.toContain('agenda');
  });

  test('ni grupos, ni tests, ni «Cómo entrenas» bloquean: un coach 1:1 completa con un atleta que ve su semana', () => {
    const c = buildSetupChecklist({ ...EMPTY, athletes: 1, programs: 1, athletes_with_plan: 1, athletes_with_visible_week: 1 });
    expect(c.complete).toBe(true);
    expect(c.done).toBe(3);
    expect(c.method.done).toBe(0);
  });

  test('con programa asignado pero la semana oculta, aún no está completo', () => {
    const c = buildSetupChecklist({ ...EMPTY, athletes: 1, programs: 1, athletes_with_plan: 1 });
    expect(c.complete).toBe(false);
    expect(c.steps.find((x) => x.key === 'primera_semana')?.detail).toBe('Hasta que la publiques, no la ve en su app');
  });

  test('con Negocio aparece «Agenda y cupo» en el método, también opcional', () => {
    const c = buildSetupChecklist({ ...EMPTY, negocio: true });
    const agenda = c.steps.find((x) => x.key === 'agenda');
    expect(agenda).toMatchObject({ href: '/ajustes/agenda', track: 'metodo', optional: true });
    expect(c.method.total).toBe(7);
    expect(c.total).toBe(3);
  });

  test('una invitación enviada cuenta como primer atleta', () => {
    const c = buildSetupChecklist({ ...EMPTY, invitations: 1 });
    const step = c.steps.find((x) => x.key === 'primer_atleta');
    expect(step?.done).toBe(true);
    expect(step?.detail).toBe('Invitación enviada');
  });

  test('«Dale un programa» lleva a escribir uno si no hay, y a asignarlo si ya hay', () => {
    expect(buildSetupChecklist(EMPTY).steps.find((x) => x.key === 'primer_plan')).toMatchObject({
      href: '/programar/programas',
      detail: 'Escribe un programa y asígnaselo',
    });
    expect(buildSetupChecklist({ ...EMPTY, programs: 2 }).steps.find((x) => x.key === 'primer_plan')).toMatchObject({
      href: '/atletas',
      detail: 'Asígnale uno de tus 2 programas',
    });
  });

  test('los textos cuentan lo que hay', () => {
    const c = buildSetupChecklist({
      ...EMPTY,
      library_entrenos: 1,
      negocio: true,
      availability_slots: 3,
      max_athletes: 40,
      athletes: 100,
      athletes_with_plan: 95,
      athletes_with_visible_week: 94,
    });
    expect(c.steps.find((x) => x.key === 'primer_entreno')?.detail).toBe('1 entreno en tu biblioteca');
    expect(c.steps.find((x) => x.key === 'primer_plan')?.detail).toBe('95 atletas con programa');
    expect(c.steps.find((x) => x.key === 'primera_semana')?.detail).toBe('94 atletas ven su semana');
    expect(c.steps.find((x) => x.key === 'agenda')?.detail).toBe('3 franjas · cupo 40');
  });
});

describe('weekStateLine', () => {
  const base = { week_start: '2026-09-28', visible: false, held: false, status: 'draft' as const, opens_on: null, sessions: 5 };
  test('oculta en automático: el día en que se abre', () => {
    expect(weekStateLine({ ...base, opens_on: '2026-09-26' }, WED)).toBe('Se publica sola el sáb 26 sept');
    expect(weekStateLine({ ...base, opens_on: WED }, WED)).toBe('Se publica sola hoy');
  });
  test('retenida y oculta sin fecha', () => {
    expect(weekStateLine({ ...base, held: true }, WED)).toBe('Retenida: no se publica sola');
    expect(weekStateLine(base, WED)).toBe('Oculta hasta que la publiques');
  });
  test('visible: ya, pasada o vacía', () => {
    expect(weekStateLine({ ...base, visible: true, status: 'published' }, WED)).toBe('La ve ya');
    expect(weekStateLine({ ...base, week_start: '2026-09-07', visible: true, status: 'published' }, WED)).toBe('La vio');
    expect(weekStateLine({ ...base, visible: true, sessions: 0 }, WED)).toBe('Visible · sin entrenos esa semana');
  });
});

describe('asignar: textos de la previa', () => {
  const a = (over: Partial<AssignPreviewAthlete>): AssignPreviewAthlete => ({
    id: '1',
    name: 'Marc Vidal',
    conflict: null,
    action: 'assign',
    start_date: '2026-09-28',
    end_date: '2026-10-25',
    program: { id: '2', name: 'Acumulación' },
    start_week: 1,
    blocked: null,
    lifecycle: 'activo',
    pair_partner: null,
    ...over,
  });
  const conflict = { program_name: 'Base', start_date: '2026-09-14', end_date: '2026-10-11', count: 1 };

  test('una línea por acción', () => {
    expect(athleteLine(a({}))).toBe('28 sept – 25 oct');
    expect(athleteLine(a({ action: 'chain', conflict, start_date: '2026-10-12', end_date: '2026-11-08' }))).toBe(
      'Tras «Base» · 12 oct – 8 nov',
    );
    expect(athleteLine(a({ action: 'skip', conflict }))).toBe('Sigue con «Base» hasta el dom 11 oct');
    expect(athleteLine(a({ action: 'blocked', blocked: { code: 'baja', message: 'Está de baja' } }))).toBe('Está de baja');
    expect(athleteLine(a({ action: 'adopt' }))).toBe('Ya hace «Acumulación»');
  });

  test('«Asignar a N» cuenta solo a quien recibe algo', () => {
    const counts = { total: 10, assign: 3, chain: 2, replace: 1, skip: 2, blocked: 1, adopt: 1 };
    expect(receivingCount({ counts })).toBe(6);
  });

  test('la entrega dice cuándo se abre cada semana', () => {
    expect(deliveryLine('auto', 2)).toBe('Cada semana se publica sola 2 días antes (el sáb).');
    expect(deliveryLine('auto', 1)).toBe('Cada semana se publica sola 1 día antes (el dom).');
    expect(deliveryLine('auto', 0)).toBe('Cada semana se publica sola el mismo lunes.');
    expect(deliveryLine('visible', 2)).toBe('Ve todas las semanas desde ya.');
    expect(deliveryLine('draft', 2)).toBe('Ocultas hasta que las publiques tú.');
  });
});

describe('fechas del panel', () => {
  test('lunes de inicio: solo lunes, desde el de esta semana', () => {
    const ms = upcomingMondays(WED, 3);
    expect(ms).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(mondayLabel(ms[0]!, WED)).toBe('Esta semana · lun 21 sept');
    expect(mondayLabel(ms[1]!, WED)).toBe('La que viene · lun 28 sept');
    expect(mondayLabel(ms[2]!, WED)).toBe('lun 5 oct');
  });
  test('cuenta atrás y día con semana', () => {
    expect(countdown(24, '2026-10-17')).toBe('24 d · 17 oct');
    expect(countdown(1, '2026-09-24')).toBe('mañana · 24 sept');
    expect(countdown(0, WED)).toBe('hoy');
    expect(weekdayDate('2026-09-28')).toBe('lun 28 sept');
  });
});

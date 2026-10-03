import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/v2/ui';
import { FichaContext, type FichaActions } from '@/components/v2/atleta-detalle/FichaContext';
import { PlanTab } from '@/components/v2/atleta-detalle/plan/PlanTab';
import { IntakeReview } from '@/components/v2/intake/IntakeReview';
import type { FichaCalendar, FichaEstado } from '@/lib/dashboard/v2/atleta-detalle-types';
import type { IntakeReviewPayload } from '@/lib/dashboard/v2/intake-review';
import { buildCalendarWeeks } from '@/lib/dashboard/v2/ficha-calendar-model';
import { shell } from './fixtures';

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router,
  usePathname: () => '/es/atletas/11', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/i18n/navigation', () => ({ Link: (props: ComponentProps<'a'>) => createElement('a', props), useRouter: () => router }));

// DTO del cuestionario, sin plan actual ni consultas a la base.
const intake: IntakeReviewPayload = {
  profile: {
    athlete: { athlete_id: '11', user_id: '111', full_name: 'Atleta nueva', onboarded_at: null,
      intake_completed_at: null, age: null, sex: null, height_cm: null, weight_kg: null,
      body_fat_pct: null, handedness: null, training_experience_years: null, primary_discipline: null,
      training_days_per_week: null, equipment_access: null, twice_daily_capable: null,
      am_window: null, pm_window: null, squad_notes: null, nutrition_notes: null, coaching_history: null,
      goal_short: null, goal_mid: null, goal_long: null, achievable_2_4_months: null,
      biggest_obstacle: null, pct_depends_on_me: null, coach_role: null, injuries: [] },
    benchmarks: [], race_history: [], devices: [], target_event: null, goal_notes: null,
    intake_structured: { goal_type: null, run_experience: null, strength_experience: null,
      sleep_quality: null, stress_level: null, commitment_level: null, program_days: [], availability: {},
      available_from: null, available_to: null, session_minutes: null, schedule_flexible: null,
      facility_type: null, facility_other_text: null, has_track: null, has_flat_run: null,
      preferred_week: {}, owned_equipment: [], missing_equipment_tags: [], equipment_incompatible_count: 0,
      injury_contraindications: [] },
    suggestions: { block_specs: [], level: 1, level_rationale: '', baseline_tests: [], welcome_draft: '',
      total_days: 0, is_compressive: false, block_emphasis: { bias: 'balanced', note: '' } },
    warnings: [],
  },
  plan_options: { today: '2026-09-23', auto_publish_days: 2, mondays: ['2026-09-28'], current: null, current_group: null,
    groups: [], programs: [] },
  classification: { level_id: null, level_name: null, suggested_level_id: null, suggested_level_name: null,
    suggested_level_reason: null, training_days_per_week: null, levels: [], suggestion_gap: null,
    days_band: { min: 1, max: 7 }, level_axis_label: 'Nivel' },
  races: { past: [], upcoming: [] },
};
const estado: FichaEstado = { readiness: null, sleep: null, last_checkin: null, checkin_week: [],
  injury: { id: '22', zone_label: 'Rodilla derecha', severity_label: 'Moderada', status: 'activa', onset_date: '2026-09-20' },
  note: null, markers: [] };

function render(calendar: FichaCalendar | null = null, detail: FichaEstado | null = estado) {
  const value: FichaActions = { shell: shell({ intake_pending: true, has_upcoming_plan: false }),
    openChat: vi.fn(), openComposer: vi.fn(), openAssign: vi.fn(), openSession: vi.fn(),
    openWeekTool: vi.fn(), calendarVersion: 0, bumpCalendar: vi.fn(), refresh: vi.fn() };
  return load(renderToStaticMarkup(createElement(ToastProvider, null,
    createElement(FichaContext.Provider, { value }, createElement(PlanTab, { calendar, estado: detail, intake })))));
}

describe('Alta pendiente — conserva asignador y estado sin exigir un plan', () => {
  it('la revisión dedicada mantiene primer plan personal y Asignar plan incluso sin biblioteca', () => {
    const $ = load(renderToStaticMarkup(createElement(ToastProvider, null,
      createElement(IntakeReview, { review: intake, athleteId: '11' }))));
    expect($.text()).toContain('Plan solo para él');
    const assign = $('button').filter((_, e) => $(e).text().includes('Asignar plan'));
    expect(assign).toHaveLength(1);
    expect(assign.attr('disabled')).toBeUndefined();
    expect($.text()).toContain('Un programa');
  });

  it('Ver estado tiene un ancla real con lesión y ausencia de lecturas, junto al alta completa sin plan', () => {
    const $ = render();
    expect($('details#estado-atleta')).toHaveLength(1);
    expect($('#estado-atleta summary').text()).toContain('Rodilla derecha');
    expect($('#estado-atleta').text()).toContain('Sin lecturas todavía');
    expect($('#estado-atleta').text()).toContain('Rodilla derecha · moderada');
    expect($('button').filter((_, e) => $(e).text().includes('Asignar plan')).attr('disabled')).toBeUndefined();
    expect($.text()).not.toContain('No se ha podido cargar el calendario');
  });

  it('estado no disponible conserva destino, error y reintento; no se convierte en sano', () => {
    const $ = render(null, null);
    expect($('details#estado-atleta')).toHaveLength(1);
    expect($('#estado-atleta').text()).toContain('No se ha podido cargar su estado');
    expect($('#estado-atleta button')).toHaveLength(1);
    expect($('#estado-atleta').text()).not.toContain('Sin lesión activa');
  });

  it('si ya hay una sesión futura mantiene Adaptar sesiones para la lesión junto al alta', () => {
    const calendar: FichaCalendar = { zoom: 'semana', from: '2026-09-21', to: '2026-09-27', today: '2026-09-23',
      weeks: buildCalendarWeeks({ from: '2026-09-21', to: '2026-09-27', today: '2026-09-23', weekStates: new Map(),
        sessions: [{ id: '31', date: '2026-09-25', title: 'Rodaje', modality: 'carrera', modality_label: 'Carrera',
          status: 'scheduled', done: false, missed: false, excluded: false, planned_min: 30, planned_open: false,
          has_content: true, editable: true, rpe: null, libre: false }] }) };
    const $ = render(calendar);
    const adapt = $('#estado-atleta button').filter((_, e) => $(e).text() === 'Adaptar sesiones');
    expect(adapt).toHaveLength(1);
    expect(adapt.attr('disabled')).toBeUndefined();
    expect($.text()).toContain('Plan solo para él');
  });
});

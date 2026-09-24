/**
 * Ajustes › Tu club no puede tirar: si la piel o el perfil no se leen, el
 * panel dice que no ha podido cargar (con reintentar) en vez de «Algo ha
 * fallado»; si se leen, el formulario recibe el club + box + dirección, que
 * es la única forma de que haya UN editor por campo.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn(), getLocale: vi.fn(async () => 'es') }));
vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/coach/club-skin', () => ({ getClubSkin: vi.fn() }));
vi.mock('@/lib/coach/profile', () => ({ getCoachProfile: vi.fn() }));
vi.mock('@/lib/coach/coach-timezone', () => ({ getCoachTimezoneSetting: vi.fn() }));
vi.mock('@/lib/time-zones', () => ({ loadOfferableTimezones: vi.fn() }));
vi.mock('@/components/v2/club/ClubForm', () => ({
  ClubForm: function ClubForm(props: { initial: unknown }) {
    return { type: 'ClubForm', props };
  },
}));
vi.mock('@/components/v2/ajustes/AjustesLoadError', () => ({
  AjustesLoadError: function AjustesLoadError(props: { what: string }) {
    return { type: 'AjustesLoadError', props };
  },
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { getClubSkin } = await import('@/lib/coach/club-skin');
const { getCoachProfile } = await import('@/lib/coach/profile');
const { getCoachTimezoneSetting } = await import('@/lib/coach/coach-timezone');
const { loadOfferableTimezones } = await import('@/lib/time-zones');
const { default: ClubPage } = await import('@/app/[locale]/(v2)/ajustes/(area)/club/page');

function find(node: unknown, name: string): { props: Record<string, unknown> } | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const n = node as { type?: unknown; props?: Record<string, unknown> & { children?: unknown } };
  if (typeof n.type === 'function' && (n.type as { name: string }).name === name) return n as { props: Record<string, unknown> };
  const children = n.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const hit = find(child, name);
    if (hit) return hit;
  }
  return undefined;
}

const profile = {
  full_name: 'Coach',
  email: 'c@example.com',
  bio: null,
  avatar_url: null,
  specialties: [],
  certifications: [],
  studio_name: 'Box Norte',
  location: 'Calle 1',
};

const tzSetting = { timezone: null, effective: 'Europe/Madrid', default_timezone: 'Europe/Madrid' };

describe('Ajustes › Tu club', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset().mockResolvedValue({ coach_id: BigInt(7) } as Awaited<
      ReturnType<typeof getCoachSession>
    >);
    vi.mocked(getClubSkin).mockReset();
    vi.mocked(getCoachProfile).mockReset().mockResolvedValue(profile);
    vi.mocked(getCoachTimezoneSetting).mockReset().mockResolvedValue(tzSetting);
    vi.mocked(loadOfferableTimezones).mockReset().mockResolvedValue(['Asia/Kolkata', 'Europe/Kyiv', 'Europe/Madrid']);
  });

  test('si la piel no se lee (columnas ausentes), dice que no ha cargado en vez de tirar', async () => {
    vi.mocked(getClubSkin).mockRejectedValue(Object.assign(new Error('column does not exist'), { code: '42703' }));
    const tree = await ClubPage({ params: Promise.resolve({ locale: 'es' }) });
    expect(find(tree, 'AjustesLoadError')).toBeDefined();
    expect(find(tree, 'ClubForm')).toBeUndefined();
  });

  test('el formulario recibe la piel y el box + dirección del perfil', async () => {
    vi.mocked(getClubSkin).mockResolvedValue({ name: 'Norte', logo_url: null, accent_hex: '#2e86ff', notify_email: null });
    const tree = await ClubPage({ params: Promise.resolve({ locale: 'es' }) });
    expect(find(tree, 'ClubForm')?.props.initial).toEqual({
      club: { name: 'Norte', logo_url: null, accent_hex: '#2e86ff', notify_email: null },
      studio_name: 'Box Norte',
      location: 'Calle 1',
    });
  });

  test('el combo del huso recibe la lista del servidor (husos que conocen Intl y Postgres), no la del navegador', async () => {
    vi.mocked(getClubSkin).mockResolvedValue({ name: 'Norte', logo_url: null, accent_hex: '#2e86ff', notify_email: null });
    const tree = await ClubPage({ params: Promise.resolve({ locale: 'es' }) });
    expect(find(tree, 'TimezoneSetting')?.props).toEqual({
      initial: tzSetting,
      zones: ['Asia/Kolkata', 'Europe/Kyiv', 'Europe/Madrid'],
    });
  });

  test('si la lista de husos no se lee, el huso dice que no ha cargado en vez de ofrecer una lista sin filtrar', async () => {
    vi.mocked(getClubSkin).mockResolvedValue({ name: 'Norte', logo_url: null, accent_hex: '#2e86ff', notify_email: null });
    vi.mocked(loadOfferableTimezones).mockRejectedValue(new Error('connection refused'));
    const tree = await ClubPage({ params: Promise.resolve({ locale: 'es' }) });
    expect(find(tree, 'TimezoneSetting')).toBeUndefined();
    expect(find(tree, 'AjustesLoadError')?.props).toEqual({ what: 'tu huso horario' });
  });
});

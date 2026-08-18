/**
 * /es/club no puede tirar: el layout ya degrada getClubSkin;
 * la página, no — Preview demo pinta «Algo ha fallado».
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }));
vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/coach/club-skin', () => ({ getClubSkin: vi.fn() }));
vi.mock('@/components/v2/club/ClubSkinForm', () => ({
  ClubSkinForm: function ClubSkinForm(props: { initial: unknown }) {
    return { type: 'ClubSkinForm', props };
  },
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { getClubSkin } = await import('@/lib/coach/club-skin');
const { default: ClubPage } = await import('@/app/[locale]/(v2)/club/page');

const empty = { name: null, logo_url: null, accent_hex: null };

function walkInitial(node: unknown): unknown {
  if (!node || typeof node !== 'object') return undefined;
  const n = node as { type?: unknown; props?: { initial?: unknown; children?: unknown } };
  if (n.type === 'ClubSkinForm' || (typeof n.type === 'function' && n.type.name === 'ClubSkinForm')) {
    return n.props?.initial;
  }
  const children = n.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = walkInitial(child);
      if (found !== undefined) return found;
    }
  } else if (children !== undefined) {
    return walkInitial(children);
  }
  return undefined;
}

describe('ClubPage', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(getClubSkin).mockReset();
  });

  test('si getClubSkin tira (columnas 0199 ausentes), pinta la ficha vacía', async () => {
    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(7) } as Awaited<
      ReturnType<typeof getCoachSession>
    >);
    vi.mocked(getClubSkin).mockRejectedValue(
      Object.assign(new Error('column "club_skin_name" does not exist'), { code: '42703' }),
    );

    const tree = await ClubPage({ params: Promise.resolve({ locale: 'es' }) });
    expect(tree).not.toBeNull();
    expect(walkInitial(tree)).toEqual(empty);
  });
});

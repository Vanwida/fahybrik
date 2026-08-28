import { describe, expect, test } from 'vitest';
import { getClubSkin } from '@/lib/coach/club-skin';
import { createFakeSql } from '../utils/fake-sql';

describe('getClubSkin · columnas 0199 ausentes', () => {
  test('select * — no nombra club_skin_*', async () => {
    const seen: string[] = [];
    const sql = createFakeSql((text) => {
      seen.push(text);
      if (text.includes('club_notify_email')) return [{ club_notify_email: null }];
      return [{ id: 7 }];
    });
    await getClubSkin(7, sql);
    const skinSql = seen.find((s) => s.includes('select * from coaches'));
    expect(skinSql).toBeDefined();
    expect(skinSql).not.toMatch(/club_skin_name/);
    expect(skinSql).not.toMatch(/club_logo_url/);
    expect(skinSql).not.toMatch(/club_accent_hex/);
  });

  test('fila sin claves 0199 → piel vacía, no throw', async () => {
    const sql = createFakeSql((text) => {
      if (text.includes('club_notify_email')) return [{ club_notify_email: null }];
      return [{ id: 7, name: 'Coach' }];
    });
    const skin = await getClubSkin(7, sql);
    expect(skin).toEqual({
      name: null,
      logo_url: null,
      accent_hex: null,
      notify_email: null,
    });
  });

  test('claves presentes se leen', async () => {
    const sql = createFakeSql((text) => {
      if (text.includes('club_notify_email')) return [{ club_notify_email: 'a@b.co' }];
      return [{
        id: 7,
        club_skin_name: 'North Box',
        club_logo_url: 'https://imagedelivery.net/acct/76b484a7-fa1a-45be-678c-d86c53e33600',
        club_accent_hex: '#112233',
      }];
    });
    const skin = await getClubSkin(7, sql);
    expect(skin?.name).toBe('North Box');
    expect(skin?.accent_hex).toBe('#112233');
  });
});

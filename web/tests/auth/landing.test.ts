import { describe, expect, it } from 'vitest';
import { landingPathFor } from '@/lib/auth/landing';

describe('landing por rol tras entrar', () => {
  it('coach → Hoy (aunque también sea admin)', () => {
    expect(landingPathFor({ coach: true, admin: false })).toBe('/es/hoy');
    expect(landingPathFor({ coach: true, admin: true })).toBe('/es/hoy');
  });
  it('solo admin → admin; nadie → la web (nunca el panel: sería un bucle)', () => {
    expect(landingPathFor({ coach: false, admin: true })).toBe('/es/admin');
    expect(landingPathFor({ coach: false, admin: false })).toBe('/');
  });
});

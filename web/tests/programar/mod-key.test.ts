// Los atajos dicen la tecla del sistema: ⌘ en Mac, Ctrl en el resto.
import { describe, expect, it } from 'vitest';
import { isMacPlatform, modKey } from '@/components/v2/planes/mod-key';

describe('modKey', () => {
  it('Mac → ⌘C; Windows/Linux → Ctrl C', () => {
    expect(modKey('C', true)).toBe('⌘C');
    expect(modKey('C', false)).toBe('Ctrl C');
  });
  it('reconoce la plataforma', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('iPhone')).toBe(true);
    expect(isMacPlatform('Linux x86_64')).toBe(false);
    expect(isMacPlatform('Win32')).toBe(false);
  });
});

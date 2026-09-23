// El script previo al pintado del panel: pone el tema en `.v2-root` y el fondo de
// <body> al lienzo del tema, para que una carga en frío con el tema claro no
// enseñe el negro del <body> raíz (#0A0A0A).
import { describe, expect, it } from 'vitest';
import { V2ThemeScript } from '@/components/v2/theme/V2ThemeScript';
import { V2_THEME_CANVAS } from '@/components/v2/theme/theme-config';

function run(stored: string | null) {
  const el = { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } };
  const body = { style: {} as Record<string, string> };
  const document = { body, querySelector: () => el, querySelectorAll: () => [] as unknown[] };
  const localStorage = { getItem: () => stored };
  const js = (V2ThemeScript().props as { dangerouslySetInnerHTML: { __html: string } }).dangerouslySetInnerHTML.__html;
  new Function('document', 'localStorage', js)(document, localStorage);
  return { theme: el.attrs['data-theme'], body: body.style };
}

describe('V2ThemeScript', () => {
  it('tema claro guardado → body con el lienzo claro', () => {
    expect(run('light')).toEqual({ theme: 'light', body: { backgroundColor: V2_THEME_CANVAS.light, colorScheme: 'light' } });
  });
  it('sin nada guardado → oscuro, body con el lienzo oscuro', () => {
    expect(run(null)).toEqual({ theme: 'dark', body: { backgroundColor: V2_THEME_CANVAS.dark, colorScheme: 'dark' } });
  });
});

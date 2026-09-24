// El panel pinta el fondo de <body> con el lienzo de SU tema desde el primer
// fotograma (CSS por `data-theme`, sin tocar atributos de <body> antes de
// hidratar), para que una carga en frío con el tema claro no enseñe el negro del
// <body> raíz (#0A0A0A). Y el script previo al pintado pone el tema guardado.
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { V2ThemeScript } from '@/components/v2/theme/V2ThemeScript';
import { V2_THEME_CANVAS } from '@/components/v2/theme/theme-config';

type Html = { dangerouslySetInnerHTML: { __html: string } };
const parts = () => (V2ThemeScript().props as { children: ReactElement<Html>[] }).children;

function run(stored: string | null) {
  const el = { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } };
  const body = { style: {} as Record<string, string> };
  const document = { body, querySelector: () => el, querySelectorAll: () => [] as unknown[] };
  const js = parts()[1]!.props.dangerouslySetInnerHTML.__html;
  new Function('document', 'localStorage', js)(document, { getItem: () => stored });
  return { theme: el.attrs['data-theme'], bodyTouched: Object.keys(body.style).length > 0 };
}

describe('V2ThemeScript', () => {
  it('el CSS da a <body> el lienzo de cada tema', () => {
    const css = parts()[0]!.props.dangerouslySetInnerHTML.__html;
    expect(css).toContain(`body:has(.v2-root[data-theme="light"]){background-color:${V2_THEME_CANVAS.light};color-scheme:light}`);
    expect(css).toContain(`body:has(.v2-root[data-theme="dark"]){background-color:${V2_THEME_CANVAS.dark};color-scheme:dark}`);
  });
  it('el script pone el tema guardado (o el oscuro) y no toca <body>', () => {
    expect(run('light')).toEqual({ theme: 'light', bodyTouched: false });
    expect(run(null)).toEqual({ theme: 'dark', bodyTouched: false });
  });
});

// Selector de tema del panel: lo que se guarda, lo que dice el sistema, el
// defecto. El botón vive en el cromo; esta pieza es la regla que lo mueve.

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ThemeToggle } from '@/components/v2/theme/ThemeToggle';
import { V2ThemeProvider } from '@/components/v2/theme/V2ThemeProvider';
import {
  V2_THEME_DEFAULT,
  V2_THEME_STORAGE_KEY,
  resolveV2Theme,
} from '@/components/v2/theme/theme-config';

describe('resolveV2Theme', () => {
  test('lo guardado manda, aunque el sistema diga lo contrario', () => {
    expect(resolveV2Theme('light', true)).toBe('light');
    expect(resolveV2Theme('dark', false)).toBe('dark');
  });

  test('sin guardado, sigue el sistema', () => {
    expect(resolveV2Theme(null, true)).toBe('dark');
    expect(resolveV2Theme(null, false)).toBe('light');
    expect(resolveV2Theme(undefined, false)).toBe('light');
  });

  test('un valor inventado no cuenta: cae al sistema o al defecto', () => {
    expect(resolveV2Theme('auto', true)).toBe('dark');
    expect(resolveV2Theme('auto', false)).toBe('light');
    expect(resolveV2Theme('', false)).toBe('light');
  });

  test('el defecto del panel es el claro FLEXR; la clave no se reescribe', () => {
    expect(V2_THEME_DEFAULT).toBe('light');
    expect(V2_THEME_STORAGE_KEY).toBe('fahybrid:v2-theme');
  });
});

describe('ThemeToggle', () => {
  test('el botón está y anuncia el lado al que cambia (defecto = claro → oscuro)', () => {
    const html = renderToString(
      createElement(V2ThemeProvider, null, createElement(ThemeToggle)),
    );
    expect(html).toContain('Cambiar a tema oscuro');
    expect(html).toContain('dark_mode');
    expect(html).toMatch(/<button\b/);
  });
});

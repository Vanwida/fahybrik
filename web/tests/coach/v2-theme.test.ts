// Selector de tema del panel: lo que se guarda y el defecto (oscuro). El botón
// vive en el cromo; esta pieza es la regla que lo mueve.

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ThemeToggle } from '@/components/v2/theme/ThemeToggle';
import { V2ThemeProvider } from '@/components/v2/theme/V2ThemeProvider';
import {
  V2_THEME_CANVAS,
  V2_THEME_DEFAULT,
  V2_THEME_STORAGE_KEY,
  resolveV2Theme,
} from '@/components/v2/theme/theme-config';

describe('resolveV2Theme', () => {
  test('lo guardado manda', () => {
    expect(resolveV2Theme('light')).toBe('light');
    expect(resolveV2Theme('dark')).toBe('dark');
  });

  test('sin guardado, OSCURO (el sistema ya no decide)', () => {
    expect(resolveV2Theme(null)).toBe('dark');
    expect(resolveV2Theme(undefined)).toBe('dark');
  });

  test('un valor inventado no cuenta: cae al defecto', () => {
    expect(resolveV2Theme('auto')).toBe('dark');
    expect(resolveV2Theme('')).toBe('dark');
  });

  test('el defecto del panel es el oscuro; la clave no se reescribe', () => {
    expect(V2_THEME_DEFAULT).toBe('dark');
    expect(V2_THEME_STORAGE_KEY).toBe('fahybrid:v2-theme');
  });

  test('theme-color = lienzo de cada tema', () => {
    expect(V2_THEME_CANVAS.dark).toBe('#0B0B0C');
    expect(V2_THEME_CANVAS.light).toBe('#F4F4F2');
  });
});

describe('ThemeToggle', () => {
  test('el botón está y anuncia el lado al que cambia (defecto = oscuro → claro)', () => {
    const html = renderToString(createElement(V2ThemeProvider, null, createElement(ThemeToggle)));
    expect(html).toContain('Cambiar a tema claro');
    expect(html).toContain('data-theme="dark"');
    expect(html).toMatch(/<button\b/);
  });
});

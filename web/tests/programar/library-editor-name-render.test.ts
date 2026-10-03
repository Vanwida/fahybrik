import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/v2/ui';
import { LibraryItemEditor, type LibraryItemModel } from '@/components/v2/biblioteca/LibraryItemEditor';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

function render(kind: LibraryItemModel['kind'], id: string | null) {
  const model: LibraryItemModel = {
    kind, id, title: id ? 'Trabajo de ejemplo' : '', prose: kind === 'bloque' ? 'Texto original de ejemplo' : null,
    blocks: [], tags: [], methodology_group_id: null, format: null, is_draft: false,
  };
  const providerProps = {
    locale: 'es', messages: {},
    children: createElement(ToastProvider, null, createElement(LibraryItemEditor, { model, cola: false, nextReviewId: null })),
  };
  return load(renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps)));
}

describe('nombre visible al crear y editar piezas de Biblioteca', () => {
  it.each([
    ['bloque', null], ['bloque', '7'], ['entreno', null], ['entreno', '8'],
  ] as const)('%s (%s): campo con etiqueta, borde, ayuda y vínculo accesible', (kind, id) => {
    const $ = render(kind, id);
    const label = $('label').filter((_i, element) => $(element).text() === `Nombre del ${kind}`);
    expect(label.length).toBe(1);
    const input = $(`input[id="${label.attr('for')}"]`);
    expect(input.length).toBe(1);
    expect(input.attr('required')).toBeDefined();
    expect(input.attr('maxlength')).toBe('160');
    expect(input.attr('placeholder')).toBeTruthy();
    expect(input.attr('value')).toBe(id ? 'Trabajo de ejemplo' : '');
    expect(input.attr('class')).toContain('border-v2-border');
    expect(input.attr('class')).not.toContain('border-transparent');
    expect($(`[id="${input.attr('aria-describedby')}"]`).text()).toContain('Obligatorio');
    expect(input.parents('header').length).toBe(0);
    expect($('h1').text()).toBe(`${id ? 'Editar' : 'Nuevo'} ${kind}`);
    expect($('button').filter((_i, element) => $(element).text() === 'Guardar').length).toBe(1);
  });
});

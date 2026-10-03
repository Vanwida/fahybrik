import { describe, expect, it, vi, afterEach } from 'vitest';
import { FilterChip } from '@/components/v2/ui';
import { linkAnchor, scrollExistingLinkAnchor } from '@/components/v2/shared/anchor-link';

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
afterEach(() => vi.unstubAllGlobals());

describe('Enlaces de lectura — volver a un destino visible sin cambiar el href', () => {
  it('repetir el mismo hash vuelve a desplazar la sección cada vez', () => {
    const scrollIntoView = vi.fn();
    const getElementById = vi.fn(() => ({ scrollIntoView }));
    vi.stubGlobal('document', { getElementById });
    scrollExistingLinkAnchor(click, '#historial');
    scrollExistingLinkAnchor(click, '#historial');
    expect(getElementById).toHaveBeenCalledWith('historial');
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start' });
  });

  it('Todo → enlace de comunicados usa el destino de sección aunque la URL haya cambiado', () => {
    const scrollIntoView = vi.fn();
    vi.stubGlobal('document', { getElementById: vi.fn(() => ({ scrollIntoView })) });
    const href = '/atletas/11?tab=perfil&seccion=historial&historial=comunicado';
    expect(linkAnchor(href)).toBe('historial');
    scrollExistingLinkAnchor(click, href);
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const)('%s conserva el comportamiento del navegador sin scroll local', (modifier) => {
    const getElementById = vi.fn();
    vi.stubGlobal('document', { getElementById });
    scrollExistingLinkAnchor({ ...click, [modifier]: true }, '#historial');
    expect(getElementById).not.toHaveBeenCalled();
  });

  it.each([{ button: 1 }, { defaultPrevented: true }])('clic no ordinario %o no desplaza', (over) => {
    const getElementById = vi.fn();
    vi.stubGlobal('document', { getElementById });
    scrollExistingLinkAnchor({ ...click, ...over }, '#historial');
    expect(getElementById).not.toHaveBeenCalled();
  });

  it('destino aún ausente deja seguir la navegación y no inventa un ancla', () => {
    const getElementById = vi.fn(() => null);
    vi.stubGlobal('document', { getElementById });
    expect(() => scrollExistingLinkAnchor(click, '/atletas/11?tab=perfil&seccion=historial')).not.toThrow();
    expect(linkAnchor('/atletas/11/intake')).toBeNull();
    expect(linkAnchor('#%malformed')).toBeNull();
  });

  it('FilterChip reenvía onClick a su enlace conservando href y sigue admitiendo botón', () => {
    const onClick = vi.fn();
    const link = FilterChip({ href: '#historial', onClick, children: 'Historial' });
    expect(link.props.href).toBe('#historial');
    expect(link.props.onClick).toBe(onClick);
    const button = FilterChip({ onClick, children: 'Todo' });
    expect(button.type).toBe('button');
    expect(button.props.onClick).toBe(onClick);
  });
});

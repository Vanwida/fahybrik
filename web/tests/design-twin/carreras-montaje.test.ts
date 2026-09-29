// LAS VEINTE ESCENAS Y LAS HOJAS MONTAN, sin servidor: se renderizan a HTML estático con
// react-dom/server. No sustituye a mirarlas (eso son las capturas), pero caza lo que una
// captura tarda en cazar: una escena que lanza al montarse, un texto prohibido, un estado
// que se pinta sin su salida.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CASOS_CARRERAS } from '@/components/design-twin/kit-carreras/casos';
import { CALENDARIO, proxima } from '@/components/design-twin/kit-carreras/datos';
import { Screen } from '@/components/design-twin/screens/carreras-rehecho';
import { Fijar } from '@/components/design-twin/screens/carreras-rehecho/fijar';
import { Confirmacion, MenuAcciones } from '@/components/design-twin/screens/carreras-rehecho/hojas';
import { HojaImportar } from '@/components/design-twin/screens/carreras-rehecho/importar';
import { HojaMeta } from '@/components/design-twin/screens/carreras-rehecho/meta';

const nada = () => {};
const PROHIBIDO = /—|–|pablo|fabrik|fahybrik|\bHR\b|bpm|PM5|FTMS|tune-up|\bsplits?\b|benchmark/i;

const monta = (escenario: string, appearance: 'light' | 'dark') =>
  renderToStaticMarkup(createElement(Screen, { escenario, appearance, orientation: 'portrait', vista: 'propuesta', onLog: nada }));

describe('las veinte escenas montan', () => {
  for (const c of CASOS_CARRERAS) {
    for (const tema of ['light', 'dark'] as const) {
      it(`${c.id} · ${tema}`, () => {
        const html = monta(c.id, tema);
        expect(html.length).toBeGreaterThan(2000);
        expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(PROHIBIDO);
        // El sujeto siempre existe: o un póster (foto), o el esqueleto, o el error.
        expect(/twin\/hoy\/race-|aria-busy|No pudimos cargar tus carreras/.test(html)).toBe(true);
      });
    }
  }

  it('sin coach no hay chat, ni «coach» en ninguna parte del texto visible', () => {
    const html = monta('sin-coach', 'dark');
    expect(html).not.toContain('Chat con tu coach');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/coach|entrenador/i);
  });

  it('con coach hay chat', () => {
    expect(monta('lleno', 'dark')).toContain('Chat con tu coach');
  });

  it('cada sujeto pinta su salida', () => {
    const texto = (id: string) => monta(id, 'dark').replace(/<[^>]+>/g, ' ');
    expect(texto('vacio')).toMatch(/Buscar carrera[\s\S]*Importar mi historial/);
    expect(texto('ayer')).toContain('Importar mi resultado');
    expect(texto('solo-historial')).toContain('Fijar mi próxima carrera');
    expect(texto('sin-principal')).toContain('Hacer objetivo principal');
    expect(texto('sin-coach')).toContain('Fijar tiempo objetivo');
    expect(texto('sin-pareja')).toContain('Conecta a tu pareja');
    expect(texto('error')).toContain('Reintentar');
    expect(texto('lleno')).toContain('Ver mi camino');
  });

  it('el predicho parcial NO pinta una cifra de predicho', () => {
    const html = monta('parcial', 'dark').replace(/<[^>]+>/g, ' ');
    expect(html).toContain('Aún sin cifra');
    expect(html).toContain('8 de 10 tramos medidos');
    expect(html).not.toMatch(/Predicho hoy\s+\d+:\d\d/);
  });
});

describe('las hojas montan', () => {
  const texto = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('«Fijar objetivo» pregunta lo que toca según la familia de la carrera', () => {
    const porFamilia = (id: string) => CALENDARIO.find((e) => e.id === id)!;
    const fijar = (id: string, principal = null as ReturnType<typeof proxima> | null) =>
      texto(createElement(Fijar, { evento: porFamilia(id), principal, falla: false, onFija: nada, onAtras: nada }));
    const hybrid = fijar('e1');
    expect(hybrid).toMatch(/Formato.*División.*Categoría/);
    expect(hybrid).toContain('Sub-60');
    const running = fijar('e7');
    expect(running).toContain('Distancia');
    expect(running).toContain('Carrera homologada');
    expect(running).not.toContain('Sub-60');
    expect(running).toContain('Sin tiempo objetivo');
    const crossfit = fijar('e8');
    expect(renderToStaticMarkup(createElement(Fijar, { evento: porFamilia('e8'), principal: null, falla: false, onFija: nada, onAtras: nada }))).toContain('placeholder="Ej. RX');
    expect(crossfit).toContain('División');
    expect(crossfit).not.toMatch(/Formato/);
    expect(fijar('e6')).toContain('aún no tiene fecha confirmada');
    expect(fijar('e1', proxima(1, 'HYROX Madrid', 12))).toContain('«HYROX Madrid» pasará a ser secundaria');
  });

  it('el menú de acciones: el principal no se «hace principal», y sin coach no se le pregunta', () => {
    const menu = (principal: boolean, conCoach: boolean) =>
      texto(createElement(MenuAcciones, { carrera: proxima(1, 'HYROX Madrid', 12), principal, conCoach, onElige: nada, onCerrar: nada }));
    expect(menu(true, true)).toContain('Preguntar al coach');
    expect(menu(true, true)).not.toContain('Hacer objetivo principal');
    expect(menu(false, true)).toContain('Hacer objetivo principal');
    expect(menu(false, false)).not.toContain('Preguntar al coach');
    expect(menu(false, false)).toContain('Eliminar carrera');
  });

  it('las confirmaciones dicen qué se borra', () => {
    const t = texto(createElement(Confirmacion, { titulo: '¿Quitar este objetivo?', mensaje: 'HYROX Madrid dejará de contar para tu cuenta atrás.', destructivo: 'Quitar objetivo', onConfirmar: nada, onCancelar: nada }));
    expect(t).toContain('Quitar objetivo');
    expect(t).toContain('Cancelar');
  });

  it('importar abre en la búsqueda, o ya importando si se le pide', () => {
    expect(texto(createElement(HojaImportar, { onCerrar: nada, onImportado: nada }))).toContain('Busca tu nombre');
    const en = texto(createElement(HojaImportar, { candidatoInicial: { id: 'c', nombre: 'Marc Vila Soler', slug: 'marc-vila-soler', nCarreras: 5, pais: 'ESP', nivel: null }, onCerrar: nada, onImportado: nada }));
    expect(en).toContain('¿Eres tú?');
    expect(en).toContain('Importando…');
  });

  it('la hoja del tiempo parte de lo que ya estaba fijado: un peldaño se marca, un tiempo exacto abre su reloj', () => {
    const hoja = (metaS: number | null) => renderToStaticMarkup(createElement(HojaMeta, { carrera: proxima(1, 'HYROX Madrid', 12, { metaS }), hoy: '2026-09-29', onGuarda: nada, onCerrar: nada }));
    const peldano = hoja(3600);
    expect(peldano).toContain('Ahora: Sub-60');
    expect(peldano).toMatch(/aria-checked="true"[^>]*aria-label="Sub-60, élite"/);
    expect(peldano.replace(/<[^>]+>/g, ' ')).toContain('Prefiero un tiempo exacto');
    // 68:00 no es un peldaño: abre el tiempo exacto ya marcado a 1 h 8 min 0 s.
    const exacto = hoja(4080);
    expect(exacto).toContain('Ahora: Sub-68');
    expect(exacto).toMatch(/aria-label="Horas"[^>]*value="1"|value="1"[^>]*aria-label="Horas"/);
    expect(exacto).toMatch(/aria-label="Minutos"[^>]*value="8"|value="8"[^>]*aria-label="Minutos"/);
    // Sin meta no hay nada elegido y guardar no está activo.
    expect(hoja(null)).toContain('Sin tiempo fijado');
  });
});

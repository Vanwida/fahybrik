// LOS AVISOS = §6 DEL MODELO: vibración por número de pulsos + tono por
// melodía, sin voz. Completitud: ningún evento del motor de kit-reloj queda
// sin aviso definido o sin «ninguno» dicho explícitamente; cada fila de §6
// está, y dice lo mismo; todo cabe en una llamada a `Attention.vibrate`.

import { describe, expect, it } from 'vitest';
import {
  AVISOS,
  MAX_PERFILES,
  componerAvisos,
  esAviso,
  eventosDeTransicion,
  fmtPulsos,
  fmtTono,
  perfilesDe,
  sistemaDe,
  type EventoGarmin,
} from '@/components/design-twin/kit-garmin';
import { VOCABULARIO } from '@/components/design-twin/kit-reloj/eventos';
import type { Transicion } from '@/components/design-twin/kit-reloj/gancho';
import type { EstadoSecuencia, LecturaSim } from '@/components/design-twin/kit-reloj/secuencia';
import { normal, tablaDe } from './garmin-modelo';

const TABLA = tablaDe('## 6. Vocabulario de aviso');

describe('§6 — completitud', () => {
  it('cada evento del motor de la muñeca tiene su fila de aviso o un «ninguno» con motivo', () => {
    for (const e of Object.keys(VOCABULARIO) as EventoGarmin[]) {
      const a = AVISOS[e];
      expect(a, e).toBeDefined();
      if (!esAviso(a)) expect(a.ninguno.length, e).toBeGreaterThan(10);
    }
  });

  it('cada fila de §6 está en la tabla del código, y dice lo mismo (vibración y tono)', () => {
    expect(TABLA.length).toBe(14);
    const avisos = Object.values(AVISOS).filter(esAviso);
    for (const [evento, vibracion, tono] of TABLA) {
      const a = avisos.find((x) => normal(x.nombre) === normal(evento!));
      expect(a, evento).toBeDefined();
      expect(fmtPulsos(a!), evento).toBe(normal(vibracion!));
      expect(fmtTono(a!), evento).toBe(normal(tono!));
    }
    // Y ninguno de más: cada aviso del código es una fila de §6.
    expect(avisos.length).toBe(TABLA.length);
  });

  it('la voz no existe (H5): fin de serie no avisa, y lo dice', () => {
    const f = AVISOS['fin-serie'];
    expect(esAviso(f)).toBe(false);
  });

  it('las melodías de afloja y aprieta bajan y suben de verdad', () => {
    const afloja = AVISOS.afloja;
    const aprieta = AVISOS.aprieta;
    if (!esAviso(afloja) || !esAviso(aprieta) || !('melodia' in afloja.tono) || !('melodia' in aprieta.tono)) throw new Error('sin melodía');
    expect(afloja.tono.melodia[1]!.hz).toBeLessThan(afloja.tono.melodia[0]!.hz);
    expect(aprieta.tono.melodia[1]!.hz).toBeGreaterThan(aprieta.tono.melodia[0]!.hz);
  });
});

describe('cómo suena un instante', () => {
  it('el acuse de la tecla va delante y todo cabe en una llamada (≤ 8 perfiles)', () => {
    for (const e of Object.keys(AVISOS) as EventoGarmin[]) {
      const x = componerAvisos(1, ['paso-a-mano', e]);
      expect(x.perfiles.length, e).toBeLessThanOrEqual(MAX_PERFILES);
      expect(x.acuse).toBe('paso-a-mano');
    }
  });

  it('suena UN aviso: el de más prioridad (cerrar una serie = acuse + recupera, no fin de serie)', () => {
    const x = componerAvisos(1, ['paso-a-mano', 'fin-serie', 'recupera']);
    expect(x.suena).toBe('recupera');
    expect(x.linea).toContain('vibra 1 muy corta, luego 1 larga');
    expect(x.linea).toContain('tono KEY, luego STOP');
    expect(componerAvisos(2, ['accion']).linea).toContain('sin aviso');
  });

  it('los pulsos se separan con silencios: 3 largas son 5 perfiles', () => {
    const p = perfilesDe(['larga', 'larga', 'larga']);
    expect(p.map((x) => x.intensidad)).toEqual([100, 0, 100, 0, 100]);
  });
});

describe('de la transición del motor a los avisos de Garmin', () => {
  const lect = (x: Partial<LecturaSim>): LecturaSim => ({ ritmo: 300, ppm: 150, gps: 'listo', ...x });
  const est = (l: LecturaSim) => ({ lect: l }) as unknown as EstadoSecuencia;
  const t = (quien: 'motor' | 'atleta', eventos: Transicion['eventos'], antes = lect({}), despues = lect({})): Transicion =>
    ({ plan: null, antes: est(antes), despues: est(despues), quien, eventos }) as unknown as Transicion;

  it('un cierre del atleta es el acuse de su tecla; uno del motor, no', () => {
    expect(eventosDeTransicion(t('atleta', [{ evento: 'accion' }, { evento: 'recupera' }]))).toEqual(['paso-a-mano', 'recupera']);
    expect(eventosDeTransicion(t('motor', [{ evento: 'go', voz: 'Serie 3' }]))).toEqual(['go']);
  });

  it('el GPS o el pulso que se pierden avisan «perdido»; al volver, «recuperado»', () => {
    expect(sistemaDe(lect({}), lect({ gps: 'buscando' }))).toEqual(['enlace']);
    expect(sistemaDe(lect({ gps: 'buscando' }), lect({}))).toEqual(['recuperado']);
    expect(sistemaDe(lect({}), lect({ ppm: null }))).toEqual(['enlace']);
    expect(sistemaDe(lect({}), lect({}))).toEqual([]);
  });

  it('sin repetidos: si el motor ya dijo «enlace», el sensor perdido no lo repite', () => {
    const x = eventosDeTransicion(t('motor', [{ evento: 'enlace' }], lect({}), lect({ ppm: null })));
    expect(x).toEqual(['enlace']);
  });
});

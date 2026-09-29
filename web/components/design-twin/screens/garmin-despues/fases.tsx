'use client';

// LAS FASES DE DESPUÉS — lo que sigue al vivo: la sesión completada, el RPE y el
// resumen con el estado de envío. Cada una es una carcasa de cinco botones con
// su cara (`vistas.tsx`) y sus botones (`mandosFin.ts`): los rótulos junto a
// cada botón dicen lo que hace ahí y solo eso (en el reposo, la carcasa los
// pinta). Ninguna resuelve una tecla por su cuenta: todo pasa por la celda que
// dice la pantalla (`mandoDe`) y, de ahí, por la acción de §5.
//
// Sin lógica de dominio: qué es completo, qué es parcial y qué series cuentan
// lo decide `completitud` de kit-reloj; el estado de envío lo mueven los acuses
// que le llegan (en el doble, los del guion del escenario).

import { useEffect, useRef, useState } from 'react';
import { CarcasaGarmin, NOMBRE_BOTON, accionDe, type BotonGarmin, type EmisionGarmin, type IdAccion, type Mando } from '../../kit-garmin';
import { RPE_PALABRA_DEFECTO, completitud, useGuion, type MetodoResumen } from '../../kit-reloj';
import type { Resultado } from '../reloj-antes-despues/calculo';
import type { Familia } from '../reloj-antes-despues/sesiones';
import type { AcuseEnvio } from './escena';
import { TEXTO_ENVIO, pideDecidir, type EstadoEnvio } from './envio';
import { disponerFin } from './fin';
import { mandosDe, type PantallaFin } from './mandosFin';
import { paginasDeResumen } from './paginas';
import { disponerRpe, moverRpe } from './rpe';
import { CaraDeFin, CaraSalida } from './vistas';

/** Cuánto tarda un «Reintentar» en volver a contestar el servidor (solo el doble: el guion de su cronología). */
export const REINTENTO_DOBLE_MS = 1600;

type Guion = Array<{ en: number; boton: BotonGarmin }> | undefined;

/**
 * Los botones de una fase: lo que la carcasa entrega (el botón y la celda de su
 * pantalla) y el guion del escenario, por el MISMO camino que la tecla.
 */
function useBotonera(pantalla: PantallaFin, actuar: (accion: IdAccion, b: BotonGarmin) => void, guion: Guion, onLog: (l: string) => void) {
  const alBoton = (b: BotonGarmin, m: Mando | null) => {
    if (!m) return onLog(`${NOMBRE_BOTON[b]} → nada aquí`);
    if (m.accion !== 'luz') onLog(`${NOMBRE_BOTON[b]} → ${m.rotulo}`);
    actuar(m.accion, b);
  };
  const mandos = mandosDe(pantalla);
  useGuion(guion?.map((g) => ({ en: g.en, gesto: g.boton })), (b: BotonGarmin) => alBoton(b, mandos(b, accionDe('resumen', b))));
  return { alBoton, mandos };
}

// ---------------------------------------------------------------------------
// G27 · Sesión completada
// ---------------------------------------------------------------------------

export function FaseFin(p: {
  r: Resultado;
  natural: boolean;
  recuperada: boolean;
  /** Se guardó sola tras este rato quieto. */
  sola: number | null;
  metodo: MetodoResumen;
  ultimo: EmisionGarmin | null;
  guion: Guion;
  onGuardar: () => void;
  onSeguir: () => void;
  onSigue: () => void;
  onLog: (l: string) => void;
}) {
  const { r } = p;
  const c = completitud(r, p.metodo);
  // Aún hay que decidir mientras el motor cerró el último paso a su ritmo: lo terminado a mano, lo recuperado,
  // lo guardado solo y lo que ya siguió grabando libre no vuelven a preguntar.
  const decide = p.natural && !p.recuperada && r.libreS === 0 && p.sola == null;
  const { alBoton, mandos } = useBotonera(
    decide ? { tipo: 'decide' } : { tipo: 'guardada' },
    (accion) => {
      if (accion === 'confirmar') return decide ? p.onGuardar() : p.onSigue();
      if (accion === 'atras' && decide) return p.onSeguir();
    },
    p.guion,
    p.onLog,
  );
  return (
    <CarcasaGarmin estado="resumen" mandos={mandos} onBoton={alBoton} ultimo={p.ultimo} onLog={p.onLog}>
      <CaraDeFin
        haz={(D) => disponerFin({ natural: p.natural, recuperada: p.recuperada, t: r.t, metros: r.metros, c, libreS: r.libreS, solaTrasS: p.sola, decide }, D)}
      />
    </CarcasaGarmin>
  );
}

// ---------------------------------------------------------------------------
// G28 · RPE
// ---------------------------------------------------------------------------

export function FaseRpe(p: {
  palabras?: Record<number, string>;
  ultimo: EmisionGarmin | null;
  guion: Guion;
  onHecho: (rpe: number | null) => void;
  onLog: (l: string) => void;
}) {
  const palabras = p.palabras ?? RPE_PALABRA_DEFECTO;
  const [valor, setValor] = useState<number | null>(null);
  const { alBoton, mandos } = useBotonera(
    { tipo: 'rpe', conValor: valor != null },
    (accion) => {
      if (accion === 'valor-mas' || accion === 'valor-menos') {
        const n = moverRpe(valor, accion === 'valor-mas' ? 1 : -1);
        if (n !== valor) p.onLog(`RPE ${n} · ${palabras[n] ?? ''}`);
        return setValor(n);
      }
      if (accion === 'confirmar' && valor != null) {
        p.onLog(`RPE ${valor} · ${palabras[valor] ?? ''} → a la sesión (viaja como perceived_exertion)`);
        return p.onHecho(valor);
      }
      if (accion === 'atras') {
        p.onLog('RPE saltado → la sesión se guarda con RPE nulo: nunca inventado');
        return p.onHecho(null);
      }
    },
    p.guion,
    p.onLog,
  );
  return (
    <CarcasaGarmin estado="resumen" mandos={mandos} onBoton={alBoton} ultimo={p.ultimo} onLog={p.onLog}>
      <CaraDeFin haz={(D) => disponerRpe(valor, D, palabras)} />
    </CarcasaGarmin>
  );
}

// ---------------------------------------------------------------------------
// G29–G31 · El resumen y el estado de envío
// ---------------------------------------------------------------------------

export function FaseResumen(p: {
  r: Resultado;
  familia: Familia;
  metodo: MetodoResumen;
  /** Cómo llega el envío y qué le va pasando (el doble los guioniza). */
  envio: { inicial: EstadoEnvio; acuses: AcuseEnvio[] };
  inicial?: { pagina?: number };
  ultimo: EmisionGarmin | null;
  guion: Guion;
  onLog: (l: string) => void;
}) {
  const [estado, setEstado] = useState<EstadoEnvio>(p.envio.inicial);
  // Cuántas veces ha contestado que no el servidor (la segunda vez la pantalla lo dice: repetirlo da lo mismo).
  const [rechazos, setRechazos] = useState(estado === 'rechazado' ? 1 : 0);
  const [n, setN] = useState(p.inicial?.pagina ?? 0);
  const [salio, setSalio] = useState(false);
  const c = completitud(p.r, p.metodo);
  const paginas = paginasDeResumen(p.r, p.familia, c, { metodo: p.metodo, envio: { estado, intentos: rechazos } });
  const de = paginas.length;
  const actual = Math.min(n, de - 1);
  const rechazo = paginas[actual]!.envio === true && pideDecidir(estado);

  // El envío cambia con lo que el reloj sabe. Un rechazo pide al atleta: el resumen salta a esa página.
  const alEstado = (nuevo: EstadoEnvio, como: string) => {
    setEstado(nuevo);
    if (nuevo === 'rechazado') setRechazos((x) => x + 1);
    p.onLog(`Envío → «${TEXTO_ENVIO[nuevo].titulo}» (${como})`);
    if (pideDecidir(nuevo)) setN(de - 1);
  };
  const ref = useRef({ alEstado, de });
  const reintento = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    ref.current = { alEstado, de };
  });
  useEffect(() => {
    const t = p.envio.acuses.map((a) => setTimeout(() => ref.current.alEstado(a.estado, TEXTO_ENVIO[a.estado].cronologia), a.en));
    return () => {
      t.forEach(clearTimeout);
      if (reintento.current) clearTimeout(reintento.current);
    };
    // Los acuses son fijos por montaje (cada escenario remonta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const irPagina = (dir: 1 | -1) => {
    const k = (actual + dir + de) % de;
    setN(k);
    p.onLog(`Página ${k + 1}/${de} · ${paginas[k]!.titulo}`);
  };
  const pantalla: PantallaFin = salio ? { tipo: 'salida' } : { tipo: 'pagina', n: actual, de, rechazo };
  const { alBoton, mandos } = useBotonera(
    pantalla,
    (accion) => {
      if (accion === 'pagina-anterior') return irPagina(-1);
      if (accion === 'pagina-siguiente') return irPagina(1);
      if (accion === 'confirmar') {
        if (rechazo) {
          alEstado('enviando', 'Reintentar: se vuelve a mandar');
          reintento.current = setTimeout(() => ref.current.alEstado('rechazado', 'el servidor contesta lo mismo: repetir un 4xx da el mismo 4xx'), REINTENTO_DOBLE_MS);
          return;
        }
        if (actual === de - 1) {
          p.onLog('Listo → la app se cierra; el reloj vuelve a su esfera (el envío sigue en la cola hasta el acuse)');
          return setSalio(true);
        }
        return irPagina(1);
      }
      if (accion === 'atras') {
        if (rechazo) return alEstado('sin-subir', 'Guardar en el reloj: se deja de intentar');
        if (actual > 0) return irPagina(-1);
      }
    },
    p.guion,
    p.onLog,
  );
  return (
    <CarcasaGarmin estado="resumen" mandos={mandos} onBoton={alBoton} ultimo={p.ultimo} onLog={p.onLog}>
      {salio ? <CaraSalida /> : <CaraDeFin haz={paginas[actual]!.disponer} />}
    </CarcasaGarmin>
  );
}

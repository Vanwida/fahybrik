'use client';

// LA MUÑECA — la carcasa nativa de TODO el vivo (P4, gramática de Apple Entreno).
//
//   [ Controles | Vivo | Ahora suena ]   ← deslizar en horizontal
//                  │
//                  ├─ Paso          ← la corona recorre la pila en vertical
//                  ├─ Datos
//                  ├─ Vueltas
//                  └─ Estructura
//
// Lo que la carcasa hace cumplir, y por eso ninguna pantalla puede saltárselo:
//   · Se abre en Vivo, página 1. Bajar y subir la muñeca vuelve ahí.
//   · UN toque en el vivo NO cierra nada (queda en la cronología, para que se vea).
//   · La acción del momento sale por doble toque — dos toques seguidos en la
//     pantalla (como Apple Entreno pasa de intervalo; todo reloj) o el gesto
//     de la mano (S9 / Ultra 2+) —, botón Acción (Ultra) o un botón visible y
//     acotado de la propia cara; si se puede deshacer, sale el aviso
//     «Deshacer» 5 s, en la franja del pie (nunca sobre el héroe, P3).
//   · Una cara puede ENFOCAR la corona en un valor (`corona`: anotar la carga,
//     la puntuación del AMRAP): entonces la corona, la rueda, el bisel y los
//     mandos giran ese valor y no pasan página.
//   · Pausa: el vivo se atenúa con «EN PAUSA» y Reanudar (doble toque = Reanudar).
//   · Always-On: sin tintes, tinta al 60 %, aro atenuado.
//   · Water Lock: la esfera ignora el dedo; se sale girando la corona.
//   · Terminar siempre pide «¿Terminar y guardar?».
//
// Los mandos simulados (doble toque, Acción, corona, muñeca) van FUERA del
// lienzo, en `mandos.tsx`.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { EventoVivo, Eventos } from './eventos';
import { useArrastreValor, useDestinos, useGuion, useRueda, type Direccion, type GestoGuion, type OrigenPrimario } from './gestos';
import { CoronaBisel, Mandos, type Area } from './mandos';
import { ConfirmarTerminar, PaginaControles, AhoraSuena, type PaginaControlesProps } from './paginas';
import { PrimariaContexto, RelojContexto, type ModeloReloj } from './piezas';
import {
  AvisoDeshacer,
  CapaAro,
  Fondo,
  GotaAgua,
  KEYFRAMES,
  PASOS_AGUA,
  PuntosAreas,
  PuntosVerticales,
  Terminado,
  VeloPausa,
  VeloPie,
} from './carcasa';
import { AOD, C, TINTE_ZONA_PCT, tinte as mezclar } from './tokens';

export type { Area, GestoGuion };

export interface PaginaVivo {
  id: string;
  /** Para la cronología y el lector del estudio: «Paso», «Datos»… */
  titulo: string;
  contenido: ReactNode;
}

export interface AccionPrimaria {
  /** Lo que hace, dicho corto y en minúscula: «empezar ya», «estación hecha». */
  etiqueta: string;
  hacer: () => void;
  /** Si el cierre se puede deshacer: el aviso («Sled Push hecho») y cómo se deshace. */
  deshacer?: { aviso: string; hacer: () => void };
}

export interface MunecaProps {
  /** La pila vertical del Vivo. La 1 es la del paso. */
  paginas: PaginaVivo[];
  /** El aro del bisel: la sesión entera (reutiliza `AroEstructura` de kit-watch). */
  aro?: ReactNode;
  /** Tinte de zona de fondo — SOLO si el paso va a zona (P6). */
  tinte?: string | null;
  /** Capa a pantalla completa sobre el vivo: el 3-2-1, el GO, el km recién hecho. */
  capa?: ReactNode;
  pausado: boolean;
  onPausa: (pausar: boolean) => void;
  /** El control contextual: «Siguiente paso», «Vuelta», «Siguiente serie». Con `deshacer`, deja el aviso de 5 s. */
  siguiente?: PaginaControlesProps['siguiente'] & { deshacer?: AccionPrimaria['deshacer'] };
  /** La sesión acabó sola (final natural): pantalla «Sesión completada». */
  completada?: boolean;
  onTerminar?: () => void;
  /** La acción del momento para doble toque y botón Acción. Sin ella, no hacen nada. */
  accion?: AccionPrimaria | null;
  eventos: Eventos;
  /** Cambia este valor (el id del paso) y la muñeca vuelve a Vivo · página 1. */
  alPaso?: string | number;
  inicial?: { area?: Area; pagina?: number; muneca?: 'arriba' | 'abajo'; agua?: boolean };
  /**
   * Gestos guionizados para un escenario de demostración: «a los 2 s baja la
   * muñeca», «a los 3 s doble toque». Pasan por el MISMO camino que los mandos.
   */
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  modelo?: ModeloReloj;
  /**
   * La cara enfoca la corona en un valor: se llama con cada paso de corona
   * (`1` = abajo, `-1` = arriba; arriba es «más»). Si devuelve `true`, el
   * paso era suyo: ni el bisel, ni la rueda, ni «Corona ▲▼» pasan página.
   */
  corona?: (dir: Direccion) => boolean;
  /** Cualquier entrada del atleta (toque, corona, mandos): el guardado por inactividad la escucha. */
  onEntrada?: () => void;
  onLog: (linea: string) => void;
}

const AREAS: Area[] = ['controles', 'vivo', 'musica'];
const DESLIZ = 30;
/** Dos toques en la pantalla a menos de esto son UN doble toque (el de Apple Entreno). */
const DOBLE_TOQUE_MS = 300;
/** …y a menos de esto uno del otro (el mismo sitio, no dos dedos distintos). */
const DOBLE_TOQUE_PX = 30;
/** Los cambios de paso llevan destello de luz (sin háptico propio); los avisos, no. */
const DESTELLA: ReadonlySet<EventoVivo> = new Set(['go', 'recupera', 'bloque', 'sesion']);


export function Muneca(props: MunecaProps) {
  const { paginas, eventos, onLog, accion, pausado, modelo = 'doble-toque', onEntrada } = props;
  const [area, setArea] = useState<Area>(props.inicial?.area ?? 'vivo');
  const [pagina, setPagina] = useState(props.inicial?.pagina ?? 0);
  const [muneca, setMuneca] = useState<'arriba' | 'abajo'>(props.inicial?.muneca ?? 'arriba');
  const [agua, setAgua] = useState(props.inicial?.agua ?? false);
  const [giroAgua, setGiroAgua] = useState(0);
  const [confirmar, setConfirmar] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const [toast, setToast] = useState<{ n: number; aviso: string; hacer: () => void } | null>(null);
  const [pasoVisto, setPasoVisto] = useState(props.alPaso);
  const [movido, setMovido] = useState({ pagina: 0, area: 0 });
  const toque = useRef<{ x: number; y: number } | null>(null);
  /** El toque anterior en la pantalla, para reconocer el doble toque. */
  const ultimoToque = useRef<{ t: number; x: number; y: number } | null>(null);
  const { raiz, destinos } = useDestinos();

  const activa = Math.min(pagina, paginas.length - 1);
  const aod = muneca === 'abajo';

  // Un paso nuevo devuelve a Vivo · página 1 (estado derivado, sin efecto).
  if (props.alPaso !== pasoVisto) {
    setPasoVisto(props.alPaso);
    if (area !== 'vivo' || activa !== 0) {
      setArea('vivo');
      setPagina(0);
    }
  }

  // El aviso de deshacer vive 5 s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((x) => (x?.n === toast.n ? null : x)), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const irArea = (a: Area) => {
    if (a === area) return;
    setArea(a);
    setMovido((m) => ({ ...m, area: m.area + 1 }));
    onLog(`Área → ${a === 'controles' ? 'Controles' : a === 'vivo' ? 'Vivo' : 'Ahora suena'}`);
  };

  /** ¿Enfoca una cara la corona? Si sí, el paso es suyo (solo en el vivo, sin agua ni muñeca abajo). */
  const capturar = (dir: Direccion): boolean => {
    if (agua || aod || area !== 'vivo' || !props.corona) return false;
    const suyo = props.corona(dir);
    if (suyo) onEntrada?.();
    return suyo;
  };

  const girar = (dir: Direccion) => {
    onEntrada?.();
    if (agua) {
      const g = giroAgua + 1;
      if (g >= PASOS_AGUA) {
        setAgua(false);
        setGiroAgua(0);
        onLog('Corona girada → sale el agua · pantalla desbloqueada');
      } else {
        setGiroAgua(g);
        onLog(`Corona (Water Lock) ${g}/${PASOS_AGUA}`);
      }
      return;
    }
    if (aod) {
      subirMuneca();
      return;
    }
    if (area !== 'vivo') {
      onLog('Corona fuera del Vivo — no mueve nada');
      return;
    }
    if (capturar(dir)) return;
    const n = Math.min(paginas.length - 1, Math.max(0, activa + dir));
    if (n === activa) return;
    setPagina(n);
    setMovido((m) => ({ ...m, pagina: m.pagina + 1 }));
    onLog(`Corona → página ${n + 1}/${paginas.length} · ${paginas[n]!.titulo}`);
  };

  const subirMuneca = () => {
    setMuneca('arriba');
    setArea('vivo');
    setPagina(0);
    onLog('Muñeca arriba → Vivo, página 1');
  };

  const alternarMuneca = () => {
    onEntrada?.();
    if (aod) subirMuneca();
    else {
      setMuneca('abajo');
      onLog('Muñeca abajo → Always-On (sin tintes, tinta al 60 %, 1 Hz)');
    }
  };

  const gestoPrimario = (origen: OrigenPrimario) => {
    onEntrada?.();
    if (origen === 'Doble toque' && modelo !== 'doble-toque') {
      onLog('Este reloj no tiene doble toque con la mano — la acción está en pantalla');
      return;
    }
    if (origen === 'Botón Acción' && modelo === 'sin-gesto') {
      onLog('Este reloj no tiene botón Acción — la acción está en pantalla');
      return;
    }
    if (aod) {
      onLog(`${origen} con la muñeca abajo — no hace nada`);
      return;
    }
    if (agua && origen === 'Doble toque') {
      onLog('Doble toque con Water Lock — ignorado');
      return;
    }
    if (terminado || confirmar) {
      onLog(`${origen} en una confirmación — se elige con el dedo`);
      return;
    }
    if (pausado) {
      props.onPausa(false);
      onLog(`${origen} → Reanudar`);
      return;
    }
    if (!accion) {
      onLog(`${origen} — nada que cerrar aquí`);
      return;
    }
    onLog(`${origen} → ${accion.etiqueta}`);
    accion.hacer();
    avisarDeshacer(accion.deshacer);
  };

  const avisarDeshacer = (d: AccionPrimaria['deshacer']) => {
    if (d) setToast((t) => ({ n: (t?.n ?? 0) + 1, aviso: d.aviso, hacer: d.hacer }));
  };

  const arrastre = useArrastreValor(capturar);
  const abajo = (e: ReactPointerEvent) => {
    onEntrada?.();
    toque.current = { x: e.clientX, y: e.clientY };
    arrastre.abajo(e);
  };
  const arriba = (e: ReactPointerEvent) => {
    const o = toque.current;
    toque.current = null;
    arrastre.suelta();
    if (!o || aod || arrastre.arrastrado()) return;
    const dx = e.clientX - o.x;
    const dy = e.clientY - o.y;
    const enBoton = (e.target as HTMLElement).closest('button');
    if (agua) {
      if (!enBoton) onLog('Water Lock — la esfera ignora el dedo');
      return;
    }
    if (Math.abs(dx) >= DESLIZ && Math.abs(dx) > Math.abs(dy)) {
      const i = AREAS.indexOf(area) + (dx < 0 ? 1 : -1);
      if (i >= 0 && i < AREAS.length) irArea(AREAS[i]!);
      return;
    }
    if (Math.abs(dy) >= DESLIZ && area === 'vivo') {
      girar(dy < 0 ? 1 : -1);
      return;
    }
    if (enBoton || area !== 'vivo') return;
    // Dos toques seguidos en el mismo sitio = la acción del momento (Apple
    // Entreno: doble toque en la pantalla pasa de intervalo). Uno solo, nada.
    const ahora = Date.now();
    const previo = ultimoToque.current;
    if (previo && ahora - previo.t <= DOBLE_TOQUE_MS && Math.hypot(e.clientX - previo.x, e.clientY - previo.y) <= DOBLE_TOQUE_PX) {
      ultimoToque.current = null;
      gestoPrimario('Doble toque en pantalla');
      return;
    }
    ultimoToque.current = { t: ahora, x: e.clientX, y: e.clientY };
    if (!pausado) onLog('Toque en la pantalla — corriendo no cierra nada');
  };

  const onWheel = useRueda(girar, capturar);

  useGuion(props.guion, (g: GestoGuion) => {
    if (g === 'doble-toque') gestoPrimario('Doble toque');
    else if (g === 'accion') gestoPrimario('Botón Acción');
    else if (g === 'bajar' && !aod) alternarMuneca();
    else if (g === 'subir' && aod) alternarMuneca();
    else if (g === 'corona-abajo') girar(1);
    else if (g === 'corona-arriba') girar(-1);
    else if (g === 'controles') irArea('controles');
    else if (g === 'vivo') irArea('vivo');
  });

  const idx = AREAS.indexOf(area);
  const fondo = props.tinte && !aod ? mezclar(props.tinte, TINTE_ZONA_PCT) : C.fondo;

  return (
    <RelojContexto.Provider value={{ modelo, aod }}>
      <PrimariaContexto.Provider value={() => gestoPrimario('Botón en pantalla')}>
      <style>{KEYFRAMES}</style>
      <div
        ref={raiz}
        onPointerDown={abajo}
        onPointerMove={arrastre.mueve}
        onPointerUp={arriba}
        onWheel={onWheel}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          background: C.fondo,
          color: C.tinta,
          fontFamily: 'var(--twin-font-sans)',
          fontVariantNumeric: 'tabular-nums',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <Fondo color={fondo} visible={area === 'vivo'} />

        {/* Las tres áreas, en fila. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            width: '300%',
            transform: `translateX(${-idx * (100 / 3)}%)`,
            transition: 'transform 300ms cubic-bezier(.2,.8,.2,1)',
            opacity: aod ? AOD.tinta : 1,
          }}
        >
          <section style={{ position: 'relative', width: '33.3334%', height: '100%' }} aria-label="Controles">
            <PaginaControles
              pausado={pausado}
              onPausa={() => {
                props.onPausa(!pausado);
                onLog(pausado ? 'Controles → Reanudar' : 'Controles → Pausa');
                if (!pausado) {
                  setArea('vivo');
                  setPagina(0);
                }
              }}
              siguiente={
                props.siguiente
                  ? {
                      ...props.siguiente,
                      onPulsa: () => {
                        onLog(`Controles → ${props.siguiente!.etiqueta}`);
                        props.siguiente!.onPulsa();
                        avisarDeshacer(props.siguiente!.deshacer);
                        setArea('vivo');
                        setPagina(0);
                      },
                    }
                  : undefined
              }
              agua={agua}
              onAgua={() => {
                setAgua(true);
                setGiroAgua(0);
                setArea('vivo');
                eventos.emitir('accion');
                onLog('Controles → Water Lock: la esfera deja de responder al dedo');
              }}
              onTerminar={() => {
                setConfirmar(true);
                onLog('Controles → Terminar: «¿Terminar y guardar?»');
              }}
            />
            {confirmar ? (
              <ConfirmarTerminar
                onTerminar={() => {
                  setConfirmar(false);
                  setTerminado(true);
                  eventos.emitir('accion');
                  props.onTerminar?.();
                  onLog('Terminar y guardar → confirmado');
                }}
                onSeguir={() => {
                  setConfirmar(false);
                  onLog('¿Terminar? → Seguir');
                }}
              />
            ) : null}
          </section>

          <section style={{ position: 'relative', width: '33.3334%', height: '100%', overflow: 'hidden' }} aria-label="Vivo">
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `translateY(${-activa * 100}%)`,
                transition: 'transform 320ms cubic-bezier(.2,.8,.2,1)',
                opacity: pausado ? 0.32 : 1,
              }}
            >
              {paginas.map((p, i) => (
                <div key={p.id} style={{ position: 'absolute', left: 0, right: 0, top: `${i * 100}%`, height: '100%' }}>
                  {p.contenido}
                </div>
              ))}
            </div>
            {toast && !aod ? <VeloPie key={`velo-${toast.n}`} /> : null}
            {props.capa}
            {pausado && !terminado ? <VeloPausa onReanudar={() => props.onPausa(false)} /> : null}
          </section>

          <section style={{ position: 'relative', width: '33.3334%', height: '100%' }} aria-label="Ahora suena">
            <AhoraSuena />
          </section>
        </div>

        {/* El aviso de deshacer, en la franja del pie (su velo, `VeloPie`, va dentro del Vivo). */}
        {toast && !aod ? (
          <AvisoDeshacer
            key={`deshacer-${toast.n}`}
            aviso={toast.aviso}
            onDeshacer={() => {
              toast.hacer();
              setToast(null);
              onLog(`Deshacer → ${toast.aviso}: vuelve atrás`);
            }}
          />
        ) : null}
        {props.aro ? <CapaAro opacidad={area !== 'vivo' ? 0 : aod ? AOD.aro : 1}>{props.aro}</CapaAro> : null}

        {/* El destello de un evento con háptico: luz, sin háptico propio. */}
        {eventos.ultimo?.vibra && DESTELLA.has(eventos.ultimo.vibra) && !aod ? (
          <div
            key={`destello-${eventos.ultimo.n}`}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: C.tinta, opacity: 0, animation: 'reloj-destello 380ms ease-out' }}
          />
        ) : null}

        {area === 'vivo' && paginas.length > 1 ? <PuntosVerticales total={paginas.length} activa={activa} n={movido.pagina} /> : null}
        <PuntosAreas activa={idx} n={movido.area} />

        {agua ? <GotaAgua giro={giroAgua} /> : null}
        {terminado || props.completada ? <Terminado titulo={terminado ? 'Terminado' : 'Sesión completada'} /> : null}
      </div>

      {destinos?.bisel ? <CoronaBisel destino={destinos.bisel} onCorona={girar} /> : null}
      {destinos ? (
        <Mandos
          destino={destinos.escena}
          suelto={destinos.suelto}
          area={area}
          pagina={activa}
          paginas={paginas.map((p) => p.titulo)}
          muneca={muneca}
          ultimo={eventos.ultimo}
          onArea={(a) => {
            onEntrada?.();
            if (aod) subirMuneca();
            irArea(a);
          }}
          onCorona={girar}
          onDobleToque={() => gestoPrimario('Doble toque')}
          onAccion={() => gestoPrimario('Botón Acción')}
          onMuneca={alternarMuneca}
        />
      ) : null}
      </PrimariaContexto.Provider>
    </RelojContexto.Provider>
  );
}

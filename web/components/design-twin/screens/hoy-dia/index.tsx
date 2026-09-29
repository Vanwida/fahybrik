'use client';

// HOY · EL DÍA — propuesta de la portada del atleta (29-sep).
//
// TESIS: el atleta no abre la app para ver el mismo panel siempre, la abre para
// saber qué le toca AHORA, y eso cambia a lo largo del día. La portada es
// ADAPTATIVA: `momento(lectura)` (momento.ts, puro, con test sobre los catorce
// casos) decide el SUJETO con una precedencia objetiva, y todo lo demás se
// subordina a él. Una cosa enorme, el resto discreto.
//
// Recibe una `LecturaHoy` (kit-hoy/contrato) y solo PINTA: no decide, no calcula.
// La altura es `llena` (CONTRATO-UI §6.1): cromo y barra de pestañas fijos, el
// cuerpo scrollea cuando desborda y, cuando NO llega al alto, el sobrante entra
// en el propio sujeto (entre su título y su acción), jamás en una cola muerta.
//
// LAS DECISIONES DE JERARQUÍA, una línea cada una:
//  1. El sujeto es el único bloque que pasa de 40 px, con tinte propio por
//     momento: si todo pesara lo mismo, el momento no se leería.
//  2. El naranja sólido es solo para «haz esto ahora» (sesión, retomar, montar):
//     el color de marca no se gasta en informar, se guarda para actuar.
//  3. La acción es una pastilla de tinta invertida y sola: el sujeto es lo que
//     miras, la acción es lo que tocas, y no compiten en peso (§10.5).
//  4. Ningún sujeto arranca un entreno: el Plan es la única puerta (DECISIONS
//     6-ago). Hoy dice el ESTADO y lleva allí.
//  5. La línea del día va por encima y es sobria (tres trazos y una palabra):
//     dice dónde estás sin inventar horarios que el plan no tiene.
//  6. «Cómo llegas» baja a una tira compacta: es el contexto con el que vives el
//     sujeto, no el sujeto (la cifra 36 px, el resto a 15-17).
//  7. El camino es un póster con la única foto de la pantalla: la fotografía se
//     gasta en un solo sitio, y la cuenta atrás en cifras enormes es lo único que
//     compite con el sujeto.
//  8. «Contigo» es UNA superficie plegable en el orden en que caduca cada cosa;
//     si no hay nada que reclame, no existe (sin ruido gris).
//  9. Marca reciente y pasos son dos teselas del mismo peso: son pruebas, no
//     protagonistas; el progreso entero vive en Analíticas.
// 10. «Crear entreno libre» es la acción secundaria, una fila con contorno, y
//     desaparece cuando el sujeto YA es el constructor (o ya es su acción).
//
// Cada pieza resuelve sus cuatro estados: con datos, en frío (esqueletos con la
// forma final), vacío (invitación con su salida) y error («Reintentar»).

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { TabBar, Pantalla } from '../../kit-composicion/chrome';
import { CROMO } from '../../kit-composicion/tokens';
import { CASOS_HOY, casoHoy } from '../../kit-hoy/casos';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Camino } from './camino';
import { Contigo } from './contigo';
import { Cromo } from './cromo';
import { Disposicion } from './disposicion';
import { Estilos } from '../../kit-dia/estilos';
import { LineaDia } from './linea-dia';
import { instanteDelDia, itemsContigo, momento, puedeUnirse, testsDelPrimerDia } from './momento';
import { IcoCheck } from '../../kit-dia/iconos';
import { fuente, MARGEN, RADIO, TAM } from '../../kit-dia/tokens';
import { Sujeto } from './sujeto';
import { EntrenoLibre, Teselas } from './teselas';

export const meta: TwinMeta = {
  id: 'hoy-dia',
  titulo: 'Hoy · El día',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'La portada cambia de sujeto según el momento del día: el check-in, la sesión que toca, «retoma tu entreno», «hecho hoy», el descanso con lo de mañana o el primer día. Un bloque editorial enorme con su tinte y su única acción; encima una línea del día (antes, entreno, después); debajo la disposición en una tira, el camino a la carrera como póster con foto y cuenta atrás, «Contigo» plegado y dos teselas (marca y pasos). Prueba el check-in: cinco toques y el sujeto pasa a lo siguiente.',
  fuentes: [],
  enApp:
    'Hoy es InicioView.swift, una pila de tarjetas iguales: camino a la carrera, ¿cómo llegas hoy?, progreso, «¿Hoy lo tuyo?», pareja, pasos y proyección, más la tira de entreno a medias y el fallo de carga. Ya no lleva la sesión de hoy (vive en el Plan desde el 6-ago) y el progreso entero se va a Analíticas. Esto sustituye la pila por un sujeto adaptativo, sin cambiar de dónde sale cada dato.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = CASOS_HOY.map((c) => ({ id: c.id, titulo: c.titulo, descripcion: c.mira }));

/** Cuánto dura el aviso de «check-in guardado» antes de irse solo. */
const AVISO_MS = 3400;

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const base = casoHoy(escenario).lectura;
  // El check-in se cierra aquí mismo: `momento()` se recalcula y el sujeto cambia.
  const [cierre, setCierre] = useState<'hecho' | 'saltado' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const l = useMemo(() => (cierre ? { ...base, checkinPendiente: false } : base), [base, cierre]);
  const m = momento(l);
  const instante = instanteDelDia(l);
  const items = itemsContigo(l, m);
  const urgente = items[0]?.clave === 'pareja-en-vivo';

  useEffect(() => {
    onLog(`Sujeto: ${m.tipo}${m.tipo === 'sesion' ? ` · ${m.sesion.titulo}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.tipo]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), AVISO_MS);
    return () => clearTimeout(t);
  }, [aviso]);

  const cierraCheckin = (como: 'hecho' | 'saltado') => {
    setCierre(como);
    setAviso(como === 'hecho' ? 'Check-in guardado. Tu cifra se actualiza en unos segundos.' : 'Sin check-in hoy. Puedes hacerlo mañana.');
  };

  // «Crear entreno libre» solo cuando el sujeto no es ya el constructor ni su acción.
  const sujetoEsConstructor = m.tipo === 'libre' || (m.tipo === 'primer-dia' && !testsDelPrimerDia(l));
  const verLibre = !sujetoEsConstructor;

  // Sin reclamos no hay sección ni hueco: ni siquiera el envoltorio (el `gap` se sumaría dos veces).
  const contigo =
    items.length > 0 ? (
      <div className="hd-sube" style={{ '--i': 3 } as CSSProperties}>
        <Contigo l={l} items={items} puedeUnirse={puedeUnirse(l)} onLog={onLog} />
      </div>
    ) : null;

  return (
    <div className="twin-screen-safe">
      <Estilos />
      <Pantalla estrategia="llena" cabecera={<Cromo l={l} appearance={appearance} onLog={onLog} />} tabBar={<TabBar activa="Inicio" />}>
        <div
          style={{
            minHeight: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            padding: `6px ${MARGEN}px 32px`,
          }}
        >
          <div className="hd-sube" style={{ '--i': 0 } as CSSProperties}>
            <LineaDia l={l} instante={instante} />
          </div>

          {/* La `key` por momento: al cambiar de sujeto, el bloque nuevo entra, no se reescribe. */}
          <div key={m.tipo} className="hd-sube" style={{ '--i': 1, display: 'flex', flexDirection: 'column', flex: '1 0 auto' } as CSSProperties}>
            <Sujeto l={l} m={m} onLog={onLog} onCheckin={cierraCheckin} />
          </div>

          <div className="hd-sube" style={{ '--i': 2 } as CSSProperties}>
            <Disposicion l={l} m={m} cierre={cierre} onLog={onLog} />
          </div>

          {/* Lo que caduca en minutos (tu pareja entrenando) sube: no puede quedar tras el póster. */}
          {urgente ? contigo : null}

          <div className="hd-sube" style={{ '--i': 3 } as CSSProperties}>
            <Camino l={l} onLog={onLog} />
          </div>

          {!urgente ? contigo : null}

          <div className="hd-sube" style={{ '--i': 4 } as CSSProperties}>
            <Teselas l={l} onLog={onLog} />
          </div>

          {verLibre ? (
            <div className="hd-sube" style={{ '--i': 5 } as CSSProperties}>
              <EntrenoLibre cargando={l.cargando} onLog={onLog} />
            </div>
          ) : null}
        </div>
      </Pantalla>
      {aviso ? (
        // Un aviso pasajero: sobre la barra de pestañas, donde el pulgar no lo tapa y no pisa el saludo.
        <div
          role="status"
          className="hd-aviso"
          style={{
            position: 'absolute',
            left: MARGEN,
            right: MARGEN,
            bottom: `calc(var(--twin-safe-bottom) + ${CROMO.tabBar}px + 12px)`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minHeight: 52,
            padding: '10px 18px',
            boxSizing: 'border-box',
            borderRadius: RADIO.tarjeta,
            background: 'var(--twin-fg)',
            color: 'var(--twin-bg)',
            ...fuente(700, TAM.suelo, 1.3),
            boxShadow: 'var(--twin-shadow-hero)',
            zIndex: 6,
          }}
        >
          <IcoCheck tam={20} />
          {aviso}
        </div>
      ) : null}
    </div>
  );
}

'use client';

// LISTO PARA SALIR — lo que pasa entre «Empezar» y el primer paso (P9, P13).
//
//   Dónde        solo si la prescripción no dice calle, cinta o pista (M3).
//                Nunca se pregunta a mitad de sesión.
//   GPS          si hace falta y aún no ha fijado: se espera aquí, y la
//                sesión arranca SOLA al fijar («GPS listo» = .success). Se
//                puede salir antes: el ritmo será «—» hasta que fije, nunca
//                un cero (lo del escenario «GPS honesto» de correr).
//   Día libre    sin sesión o con descanso: «Correr libre» y «Entreno libre»
//                (hoy no se puede empezar nada, P1-18).

import type { ReactNode } from 'react';
import {
  BotonAccion,
  C,
  Columna,
  ContextoLinea,
  Corazon,
  FILA,
  Instruccion,
  Nota,
  Pila,
  T,
  hoyDe,
  type Emision,
  type Entorno,
  type GestoGuion,
  type PasoBase,
} from '../../kit-reloj';

const SIN_LADOS = 'Antes de empezar no hay Controles ni Ahora suena';
const NOMBRE_ENTORNO: Record<Entorno, string> = { calle: 'Calle', cinta: 'Cinta', pista: 'Pista' };

function Hueco() {
  return <div style={{ flex: 1, minHeight: 0 }} />;
}

function Botones({ children }: { children: ReactNode }) {
  return <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px', boxSizing: 'border-box' }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// ¿Dónde corres?
// ---------------------------------------------------------------------------

export function Donde({ onElige, ultimo, onLog }: { onElige: (e: Entorno) => void; ultimo: Emision | null; onLog: (l: string) => void }) {
  const elegir = (e: Entorno) => {
    onLog(`Dónde → ${NOMBRE_ENTORNO[e]}${e === 'cinta' ? ': sin GPS, los metros los da la cinta' : ': hace falta GPS'}`);
    onElige(e);
  };
  return (
    <Pila
      paginas={[
        {
          id: 'donde',
          titulo: '¿Dónde corres?',
          contenido: (
            <Columna>
              <Instruccion texto="¿Dónde corres?" />
              <Nota>Tu plan no lo dice</Nota>
              <Hueco />
              <Botones>
                {(['calle', 'cinta', 'pista'] as const).map((e) => (
                  <BotonAccion key={e} etiqueta={NOMBRE_ENTORNO[e]} variante="superficie" onPulsa={() => elegir(e)} />
                ))}
              </Botones>
            </Columna>
          ),
        },
      ]}
      ultimo={ultimo}
      sinLados={SIN_LADOS}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// Esperando al GPS
// ---------------------------------------------------------------------------

function Anillo({ listo }: { listo: boolean }) {
  const talla = 72;
  return (
    <svg width={talla} height={talla} viewBox="0 0 80 80" aria-hidden>
      <circle cx="40" cy="40" r="34" fill="none" stroke={C.carril} strokeWidth="6" />
      {listo ? (
        <circle cx="40" cy="40" r="34" fill="none" stroke={C.tinta} strokeWidth="6" />
      ) : (
        <g style={{ transformOrigin: '40px 40px', animation: 'ad-gira 1400ms linear infinite' }}>
          <path d="M40 6a34 34 0 0 1 34 34" fill="none" stroke={C.tinta2} strokeWidth="6" strokeLinecap="round" />
        </g>
      )}
      {listo ? (
        <g transform="translate(22 22) scale(1.5)">
          <path d="M5 12.5 9.8 17.3 19 7.5" fill="none" stroke={C.tinta} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : (
        // La flecha de ubicación: el GPS, sin palabra.
        <path d="M40 27 51 52 40 46 29 52Z" fill={C.tinta2} />
      )}
    </svg>
  );
}

export function EsperaGps({
  entorno,
  listo,
  ppm,
  onSinGps,
  ultimo,
  onLog,
}: {
  entorno: Entorno;
  listo: boolean;
  ppm: number | null;
  onSinGps: () => void;
  ultimo: Emision | null;
  onLog: (l: string) => void;
}) {
  return (
    <Pila
      paginas={[
        {
          id: 'gps',
          titulo: 'Esperando al GPS',
          contenido: (
            <Columna>
              <ContextoLinea partes={[NOMBRE_ENTORNO[entorno]]} tono={C.tinta2} />
              <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Anillo listo={listo} />
              </div>
              <Instruccion texto={listo ? 'GPS listo' : 'Buscando GPS'} />
              <div style={{ height: FILA.nota, display: 'flex', alignItems: 'center', gap: 5, fontSize: T.nota.cuerpo, fontWeight: 500, color: C.tinta2, whiteSpace: 'nowrap' }}>
                {ppm == null ? null : <Corazon talla={12} />}
                <span style={{ color: ppm == null ? C.tinta2 : C.tinta, fontWeight: 600 }}>{ppm ?? '—'}</span>
                <span>{listo ? '· empezamos' : '· sale solo al fijar'}</span>
              </div>
              <Botones>
                <div style={{ visibility: listo ? 'hidden' : 'visible' }}>
                  <BotonAccion
                    etiqueta="Empezar sin GPS"
                    variante="superficie"
                    onPulsa={() => {
                      onLog('Empezar sin GPS → el ritmo será «—» hasta que fije; nunca un cero');
                      onSinGps();
                    }}
                  />
                </div>
              </Botones>
            </Columna>
          ),
        },
      ]}
      ultimo={ultimo}
      sinLados={SIN_LADOS}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// Día de descanso (o sin sesión): las dos entradas libres
// ---------------------------------------------------------------------------

export function DiaLibre({
  manana,
  onCorrer,
  onEntreno,
  ultimo,
  guion,
  onLog,
}: {
  manana: PasoBase[] | null;
  onCorrer: () => void;
  onEntreno: () => void;
  ultimo: Emision | null;
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  onLog: (l: string) => void;
}) {
  const m = manana ? hoyDe(manana) : null;
  return (
    <Pila
      paginas={[
        {
          id: 'libre',
          titulo: 'Hoy · descanso',
          contenido: (
            <Columna>
              <ContextoLinea partes={['Hoy']} tono={C.tinta2} />
              <Instruccion texto="Descanso" />
              {m ? <Nota prefijo="Mañana ·">{m.titulo}</Nota> : null}
              <Hueco />
              <Botones>
                <BotonAccion etiqueta="Correr libre" onPulsa={onCorrer} />
                <BotonAccion etiqueta="Entreno libre" variante="superficie" onPulsa={onEntreno} />
              </Botones>
            </Columna>
          ),
        },
      ]}
      accion={{ etiqueta: 'correr libre', hacer: onCorrer }}
      ultimo={ultimo}
      guion={guion}
      sinLados={SIN_LADOS}
      onLog={onLog}
    />
  );
}

const FAMILIAS = ['Fuerza', 'Circuito', 'Ergo'] as const;

/** «Entreno libre»: qué familia. Cada una abre su propia muñeca sin plan (reloj-fuerza, reloj-circuito, ergo). */
export function EntrenoLibre({ ultimo, onVolver, onLog }: { ultimo: Emision | null; onVolver: () => void; onLog: (l: string) => void }) {
  return (
    <Pila
      paginas={[
        {
          id: 'entreno-libre',
          titulo: 'Entreno libre',
          contenido: (
            <Columna>
              <Instruccion texto="¿Qué entrenas?" />
              <Hueco />
              <Botones>
                {FAMILIAS.map((f) => (
                  <BotonAccion
                    key={f}
                    etiqueta={f}
                    variante="superficie"
                    onPulsa={() => onLog(`Entreno libre · ${f} → abre la muñeca de ${f.toLowerCase()} sin plan: la graba entera y se guarda «libre», nunca «parcial»`)}
                  />
                ))}
              </Botones>
            </Columna>
          ),
        },
      ]}
      accion={{ etiqueta: 'volver', hacer: onVolver }}
      ultimo={ultimo}
      sinLados={SIN_LADOS}
      onLog={onLog}
    />
  );
}


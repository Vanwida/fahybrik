'use client';

// EL SUJETO — el momento del día, en grande. `momento()` (momento.ts) decide
// cuál es; aquí solo se pinta. Un bloque, un título de marca, una sola acción.
//
// Ninguno arranca un entreno: el PLAN es la única puerta (DECISIONS 6-ago). Las
// sesiones dicen su ESTADO y al tocarlas llevan al Plan; las dos acciones que
// SÍ actúan aquí son las que ya vivían en Inicio y no son «empezar la sesión
// del coach»: retomar lo guardado, montar uno libre y el check-in.
//
// Vocabulario de estado: el de `SessionMarkState` / PlanHoyModel (Completada,
// A medias, Sin hacer, por hacer), nunca uno nuevo.

import { useState, type CSSProperties, type ReactNode } from 'react';
import { PuntoModalidad } from '../../kit-composicion/chrome';
import type { LecturaHoy, SesionHoy } from '../../kit-hoy/contrato';
import { Escala, PREGUNTAS_CHECKIN, useCheckin } from './checkin';
import { Abajo, Accion, Apoyo, Arriba, Hero, Kicker, Titulo } from './hero';
import { IcoChat, IcoMas, IcoPausa, IcoReintentar, SelloEstado } from './iconos';
import {
  ETIQUETA_ESTADO,
  NOMBRE_MODALIDAD,
  testsDelPrimerDia,
  type Manana,
  type Momento,
} from './momento';
import { Esqueleto, Pastilla } from './piezas';
import { fuente, TAM, TOQUE } from './tokens';

interface Props {
  l: LecturaHoy;
  m: Momento;
  onLog: (linea: string) => void;
  /** El check-in se cerró (hecho o saltado) desde el propio sujeto. */
  onCheckin: (como: 'hecho' | 'saltado') => void;
}

/** Un botón con la acción visual dentro, para los sujetos que no son un botón entero. */
function BotonAccion({ onClick, children, icono }: { onClick: () => void; children: ReactNode; icono?: ReactNode }) {
  return (
    <button type="button" className="hd-toque" onClick={onClick} style={{ width: 'auto', alignSelf: 'flex-start' }}>
      <Accion icono={icono}>{children}</Accion>
    </button>
  );
}

const enFila: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };

// ── Sesión de hoy ───────────────────────────────────────────────────────────

function SesionHero({ sesion, delDia, onLog }: { sesion: SesionHoy; delDia: SesionHoy[]; onLog: Props['onLog'] }) {
  const otras = delDia.filter((s) => s !== sesion);
  const kicker = `Hoy${sesion.franja ? ` ${sesion.franja}` : ''} · ${NOMBRE_MODALIDAD[sesion.modalidad]}`;
  return (
    <Hero
      tono="accion"
      onClick={() => onLog(`Hoy → Plan · ${sesion.titulo} (por hacer)`)}
      etiqueta={`${sesion.titulo}. ${kicker}. Por hacer. Ver en el Plan`}
    >
      <Arriba>
        <Kicker tono="accion" aparte={<Pastilla fondo="var(--twin-accent-on)" tinta="var(--twin-accent)">Por hacer</Pastilla>}>
          {kicker}
        </Kicker>
        <Titulo tono="accion">{sesion.titulo}</Titulo>
        {sesion.libre ? <Apoyo tono="accion">Libre · la montaste tú</Apoyo> : null}
      </Arriba>
      <Abajo>
        {otras.map((o) => (
          <span key={`${o.franja}-${o.titulo}`} style={{ ...enFila, ...fuente(600, TAM.suelo, 1.25), color: 'var(--twin-accent-on)' }}>
            <SelloEstado estado={o.estado} tam={20} mono />
            <span>
              {o.franja ? `${o.franja} · ` : ''}
              {o.titulo} · {ETIQUETA_ESTADO[o.estado]}
            </span>
          </span>
        ))}
        <Accion>Ver en el Plan</Accion>
      </Abajo>
    </Hero>
  );
}

// ── Entreno a medias ────────────────────────────────────────────────────────

function RetomaHero({ m, onLog }: { m: Extract<Momento, { tipo: 'retoma' }>; onLog: Props['onLog'] }) {
  return (
    <Hero
      tono="accion"
      onClick={() => onLog(`Hoy → retomar «${m.titulo}» (guardado desde las ${m.desde})`)}
      etiqueta={`Entreno a medias: ${m.titulo}, guardado desde las ${m.desde}. Retomar`}
    >
      <Arriba>
        <Kicker tono="accion" aparte={<IcoPausa tam={30} />}>
          Entreno a medias
        </Kicker>
        <Titulo tono="accion">{m.titulo}</Titulo>
        <Apoyo tono="accion">
          Guardado desde las {m.desde}
          {m.sesion ? '. Es tu sesión de hoy, ya empezada.' : '.'}
        </Apoyo>
      </Arriba>
      <Abajo>
        <Accion>Retomar entreno</Accion>
      </Abajo>
    </Hero>
  );
}

// ── Sin coach: montar el entreno de hoy ─────────────────────────────────────

function LibreHero({ onLog }: { onLog: Props['onLog'] }) {
  return (
    <Hero
      tono="accion"
      onClick={() => onLog('Hoy → constructor de entreno libre')}
      etiqueta="Monta tu entreno de hoy. Calle, cinta, ergos y fuerza. Crear entreno"
    >
      <Arriba>
        <Kicker tono="accion">Hoy</Kicker>
        <Titulo tono="accion">Monta tu entreno de hoy</Titulo>
        <Apoyo tono="accion">Calle, cinta, ergos y fuerza. Mézclalos como entrenes hoy.</Apoyo>
      </Arriba>
      <Abajo>
        <Accion icono={<IcoMas tam={20} />}>Crear entreno</Accion>
      </Abajo>
    </Hero>
  );
}

// ── Plan en pausa ───────────────────────────────────────────────────────────

function PausaHero({ l, onLog }: { l: LecturaHoy; onLog: Props['onLog'] }) {
  const quien = l.coach ?? 'Tu coach';
  return (
    <Hero tono="neutro" etiqueta="Tu plan está en pausa">
      <Arriba>
        <Kicker tono="neutro" aparte={<IcoPausa tam={30} />}>
          Plan en pausa
        </Kicker>
        <Titulo tono="neutro">Tu plan está en pausa</Titulo>
        <Apoyo tono="neutro">
          {quien} ha pausado tu plan. No es un fallo: no hay sesión hasta que lo retome.
        </Apoyo>
      </Arriba>
      <Abajo>
        <BotonAccion onClick={() => onLog(`Hoy → chat con ${quien}`)} icono={<IcoChat tam={20} />}>
          {l.coach ? `Escribir a ${l.coach}` : 'Escribir a tu coach'}
        </BotonAccion>
      </Abajo>
    </Hero>
  );
}

// ── Hecho hoy ───────────────────────────────────────────────────────────────

function HechoHero({ sesiones, onLog }: { sesiones: SesionHoy[]; onLog: Props['onLog'] }) {
  const hechas = sesiones.filter((s) => s.estado === 'hecha' || s.estado === 'parcial').length;
  const titulo = hechas > 0 ? 'Hecho hoy' : 'Hoy, sin hacer';
  return (
    <Hero
      tono="ok"
      onClick={() => onLog('Hoy → Plan · lo que registraste hoy')}
      etiqueta={`${titulo}. ${sesiones.map((s) => `${s.titulo}, ${ETIQUETA_ESTADO[s.estado]}`).join('. ')}. Ver lo registrado`}
    >
      <Arriba>
        <Kicker tono="ok">Tu día</Kicker>
        <Titulo tono="ok">{titulo}</Titulo>
      </Arriba>
      <Abajo>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sesiones.map((s) => (
            <span key={`${s.franja}-${s.titulo}`} style={{ ...enFila, alignItems: 'flex-start' }}>
              <SelloEstado estado={s.estado} tam={26} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{s.titulo}</span>
                <span style={{ ...fuente(500, TAM.suelo, 1.25), color: 'var(--twin-fg)' }}>
                  {ETIQUETA_ESTADO[s.estado]}
                  {s.franja ? ` · ${s.franja}` : ''}
                </span>
              </span>
            </span>
          ))}
        </span>
        <Accion>Ver lo registrado</Accion>
      </Abajo>
    </Hero>
  );
}

// ── Día de descanso ─────────────────────────────────────────────────────────

function DescansoHero({ manana, onLog }: { manana: Manana | null; onLog: Props['onLog'] }) {
  return (
    <Hero
      tono="soporte"
      onClick={() => onLog(manana ? `Hoy → Plan · toca ${manana.dia}: ${manana.titulo}` : 'Hoy → Plan')}
      etiqueta={
        manana
          ? `Hoy descansas. Toca ${manana.dia}: ${manana.titulo}, ${NOMBRE_MODALIDAD[manana.modalidad]}. Ver en el Plan`
          : 'Hoy descansas. No hay nada publicado después de hoy. Ver el Plan'
      }
    >
      <Arriba>
        <Kicker tono="soporte">Día de descanso</Kicker>
        <Titulo tono="soporte">Hoy descansas</Titulo>
      </Arriba>
      <Abajo>
        {manana ? (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Apoyo tono="soporte">Toca {manana.dia}</Apoyo>
            <span style={enFila}>
              <PuntoModalidad modalidad={manana.modalidad} tam={12} />
              <span style={{ ...fuente(800, TAM.seccion, 1.15, true), color: 'var(--twin-fg)' }}>{manana.titulo}</span>
            </span>
            <span style={{ ...fuente(500, TAM.suelo, 1.25), color: 'var(--twin-fg)' }}>{NOMBRE_MODALIDAD[manana.modalidad]}</span>
          </span>
        ) : (
          <Apoyo tono="soporte">No hay nada publicado después de hoy.</Apoyo>
        )}
        <Accion>{manana ? 'Ver mañana en el Plan' : 'Ver el Plan'}</Accion>
      </Abajo>
    </Hero>
  );
}

// ── Primer día ──────────────────────────────────────────────────────────────

function PrimerDiaHero({ l, onLog }: { l: LecturaHoy; onLog: Props['onLog'] }) {
  const tests = testsDelPrimerDia(l);
  const quien = l.coach ?? 'Tu coach';
  return (
    <Hero
      tono="acento"
      onClick={() => onLog(tests ? 'Hoy → tests de calibración' : 'Hoy → constructor de entreno libre')}
      etiqueta={`Tu primer día. ${tests ? `Empieza por tus tests, ${tests.hechos} de ${tests.total}` : 'Crea un entreno libre'}`}
    >
      <Arriba>
        <Kicker tono="acento">Primer día</Kicker>
        <Titulo tono="acento">Tu primer día</Titulo>
        <Apoyo tono="acento">
          {quien} aún no ha publicado tu plan.
          {tests ? ` Empieza por tus tests (${tests.hechos} de ${tests.total}): así afina lo que viene.` : ' Mientras llega, monta un entreno tuyo.'}
        </Apoyo>
      </Arriba>
      <Abajo>
        <Accion icono={tests ? undefined : <IcoMas tam={20} />}>{tests ? 'Empezar por mis tests' : 'Crear entreno libre'}</Accion>
      </Abajo>
    </Hero>
  );
}

// ── Error de carga ──────────────────────────────────────────────────────────

function ErrorHero({ onLog }: { onLog: Props['onLog'] }) {
  const [reintentando, setReintentando] = useState(false);
  const reintenta = () => {
    if (reintentando) return;
    setReintentando(true);
    onLog('Reintentar → volvería a pedir el plan');
    setTimeout(() => setReintentando(false), 1400);
  };
  return (
    <Hero tono="peligro" vivo="alert" etiqueta="No pudimos cargar tu plan">
      <Arriba>
        <Kicker tono="peligro">Tu plan</Kicker>
        <Titulo tono="peligro">No pudimos cargar tu plan</Titulo>
        <Apoyo tono="peligro">Revisa tu conexión e inténtalo de nuevo.</Apoyo>
      </Arriba>
      <Abajo>
        <button
          type="button"
          className="hd-toque"
          onClick={reintenta}
          disabled={reintentando}
          aria-busy={reintentando}
          style={{ width: 'auto', alignSelf: 'flex-start' }}
        >
          <Accion
            icono={
              <span className={reintentando ? 'hd-gira' : undefined} style={{ display: 'inline-flex' }}>
                <IcoReintentar tam={20} />
              </span>
            }
          >
            {reintentando ? 'Reintentando' : 'Reintentar'}
          </Accion>
        </button>
      </Abajo>
    </Hero>
  );
}

// ── Cargando ────────────────────────────────────────────────────────────────

function CargandoHero() {
  return (
    <Hero tono="neutro" etiqueta="Cargando tu día">
      <Arriba>
        <span style={{ minHeight: 32, display: 'flex', alignItems: 'center' }}>
          <Esqueleto ancho={130} alto={15} radio={5} />
        </span>
        <Esqueleto ancho="82%" alto={44} radio={10} />
        <Esqueleto ancho="56%" alto={44} radio={10} />
      </Arriba>
      <Abajo>
        <Esqueleto ancho={190} alto={52} radio={26} />
      </Abajo>
    </Hero>
  );
}

// ── Check-in ────────────────────────────────────────────────────────────────

function CheckinHero({ l, onLog, onCheckin }: Pick<Props, 'l' | 'onLog' | 'onCheckin'>) {
  const c = useCheckin(() => onCheckin('hecho'), onLog);
  const p = PREGUNTAS_CHECKIN[c.paso];
  const sinNumero = l.disposicion.tipo === 'sin-datos';
  return (
    <Hero tono="info" etiqueta="Tu check-in de hoy">
      <Arriba>
        <Kicker
          tono="info"
          aparte={
            <span style={{ ...fuente(700, TAM.suelo, 1), color: 'var(--twin-fg)' }} aria-live="polite">
              {c.paso + 1} de {PREGUNTAS_CHECKIN.length}
            </span>
          }
        >
          Check-in de hoy
        </Kicker>
        <Titulo tono="info">{p.titulo}</Titulo>
        <Apoyo tono="info">{sinNumero ? 'Con estas cinco respuestas sale tu cifra de hoy.' : 'Afina tu cifra con cómo te sientes.'}</Apoyo>
      </Arriba>
      <Abajo>
        <span style={{ display: 'block' }}>
          <Escala
            key={c.paso}
            valor={c.valores[c.paso]}
            onElige={c.responde}
            aria={`${p.titulo}, de 1 a 5`}
          />
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4, ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-fg)' }}>
            <span>{p.izquierda}</span>
            <span>{p.derecha}</span>
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {c.paso > 0 ? (
            <button type="button" className="hd-toque" onClick={c.atras} style={{ width: 'auto', minHeight: TOQUE, display: 'inline-flex', alignItems: 'center', ...fuente(700, TAM.suelo, 1), color: 'var(--twin-fg)' }}>
              Anterior
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="hd-toque"
            onClick={() => {
              onLog('Check-in → saltado por hoy');
              onCheckin('saltado');
            }}
            style={{ width: 'auto', minHeight: TOQUE, display: 'inline-flex', alignItems: 'center', ...fuente(700, TAM.suelo, 1), color: 'var(--twin-fg)', textDecoration: 'underline', textUnderlineOffset: 4 }}
          >
            Saltar por hoy
          </button>
        </span>
      </Abajo>
    </Hero>
  );
}

// ── El que elige ────────────────────────────────────────────────────────────

export function Sujeto({ l, m, onLog, onCheckin }: Props) {
  switch (m.tipo) {
    case 'cargando':
      return <CargandoHero />;
    case 'error':
      return <ErrorHero onLog={onLog} />;
    case 'libre':
      return <LibreHero onLog={onLog} />;
    case 'pausa':
      return <PausaHero l={l} onLog={onLog} />;
    case 'retoma':
      return <RetomaHero m={m} onLog={onLog} />;
    case 'checkin':
      return <CheckinHero l={l} onLog={onLog} onCheckin={onCheckin} />;
    case 'sesion':
      return <SesionHero sesion={m.sesion} delDia={m.delDia} onLog={onLog} />;
    case 'hecho':
      return <HechoHero sesiones={m.sesiones} onLog={onLog} />;
    case 'descanso':
      return <DescansoHero manana={m.manana} onLog={onLog} />;
    case 'primer-dia':
      return <PrimerDiaHero l={l} onLog={onLog} />;
  }
}

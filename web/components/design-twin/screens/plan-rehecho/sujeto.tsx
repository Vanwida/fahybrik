'use client';

// EL SUJETO DE PLAN — el día que la card muestra, en grande. `vista()` (kit-plan/modelo)
// decide QUÉ es; aquí solo se pinta. Un bloque, un título de marca, ninguna acción
// dentro: la única puerta de empezar es la acción anclada de abajo, la misma para
// cualquier día (DECISIONS 6-ago).
//
// El tinte lo pone el MOMENTO del día mostrado y jamás lleva el texto:
//   hoy por hacer = naranja SÓLIDO («haz esto ahora») · lo que viene = naranja suave
//   · hecha = verde · a medias = ámbar · sin hacer = gris · descanso = verde azulado.
//
// De arriba abajo, lo que responde «qué toca y cómo es»:
//   fecha y estado → título → pastillas (franja, Libre, Test, formato, duración) →
//   partes con sus ejercicios (el marco, atenuado y sin lista) → nota del coach.
// La dosis NO va aquí (DECISIONS 7-ago): un bloque suelto se leía como la de toda
// la sesión. Y la duración es el reloj que ESCRIBE el plan, o su razón; en una
// sesión hecha, los minutos MEDIDOS.

import type { CSSProperties, ReactNode } from 'react';
import { IcoChevron, IcoCronometro, SelloEstado } from '../../kit-dia/iconos';
import { Esqueleto, Etiqueta, Pastilla } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, velo } from '../../kit-dia/tokens';
import type { Desglose, DesgloseSesion, EstadoSesion, LecturaPlan, ParteDeSesion, SemanaDelPlan } from '../../kit-plan/contrato';
import {
  ETIQUETA_ESTADO,
  MAX_EJERCICIOS_EN_FILA,
  MAX_PARTES,
  estadoEfectivo,
  etiquetaDeFecha,
  formatoMinutos,
  rotuloDeDia,
  llevaNumero,
  sesionAnterior,
  sesionSiguiente,
  tamanoDeTitulo,
  textoDuracion,
  trabajado,
  type Cuerpo,
  type DiaConSesion,
  type TonoPlan,
} from '../../kit-plan/modelo';
import { TEXTOS } from '../../kit-plan/textos';
import {
  Abajo,
  ApoyoPlan,
  Arriba,
  KickerPlan,
  PuntoModalidad,
  ShellSujeto,
  TituloPlan,
  estiloPastilla,
  lineaDe,
} from './shell';

type CuerpoSesion = Extract<Cuerpo, { tipo: 'sesion' }>;
type CuerpoDescanso = Extract<Cuerpo, { tipo: 'descanso' }>;

const enFila: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };

// ── Pastillas ───────────────────────────────────────────────────────────────

function EstadoPastilla({ estado, tono }: { estado: CuerpoSesion['estado']; tono: TonoPlan }) {
  if (tono === 'accion') {
    return (
      <Pastilla fondo="var(--twin-accent-on)" tinta="var(--twin-accent)">
        Por hacer
      </Pastilla>
    );
  }
  return (
    <Pastilla fondo={velo('var(--twin-fg)', 9)} tinta="var(--twin-fg)" icono={<SelloEstado estado={estado} tam={18} />}>
      {ETIQUETA_ESTADO[estado]}
    </Pastilla>
  );
}

function Pastillas({ cuerpo, desglose, tono }: { cuerpo: CuerpoSesion; desglose: Desglose; tono: TonoPlan }) {
  const { principal, dia } = cuerpo;
  const est = estiloPastilla(tono);
  const listo = desglose.estado === 'listo' ? desglose : null;
  const terminada = trabajado(principal.estado);
  // Una sesión hecha se cuenta con lo que se MIDIÓ; una por hacer, con el reloj que escribe el plan.
  const medido = terminada && listo?.medidoMin ? formatoMinutos(listo.medidoMin) : null;
  const escrita = terminada ? null : textoDuracion(principal.duracion);

  const items: ReactNode[] = [];
  if (dia.sesiones.length > 1) items.push(<Pastilla key="franja" {...est}>{principal.franja}</Pastilla>);
  if (principal.libre) items.push(<Pastilla key="libre" {...est}>Libre</Pastilla>);
  if (principal.test) {
    items.push(
      <Pastilla key="test" {...est} icono={<IcoCronometro tam={16} />}>
        Test
      </Pastilla>,
    );
  }
  if (listo?.formato) items.push(<Pastilla key="formato" {...est}>{listo.formato}</Pastilla>);
  if (medido) {
    items.push(
      <Pastilla key="medido" {...est} icono={<IcoCronometro tam={16} />}>
        <span style={TABULAR}>Duró {medido}</span>
      </Pastilla>,
    );
  } else if (escrita) {
    // Solo lleva peso cuando lleva NÚMERO: una razón («Dura lo que tardes») no es un dato.
    items.push(
      <Pastilla key="duracion" {...est} icono={<IcoCronometro tam={16} />}>
        <span style={{ fontWeight: llevaNumero(principal.duracion) ? 800 : 600, ...TABULAR }}>{escrita}</span>
      </Pastilla>,
    );
  }
  if (items.length === 0) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{items}</div>;
}

// ── Partes ──────────────────────────────────────────────────────────────────

const recuento = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Parte({ parte, tono, mostrarTitulo }: { parte: ParteDeSesion; tono: TonoPlan; mostrarTitulo: boolean }) {
  const mono = tono === 'accion';
  // El marco (calentamiento, vuelta a la calma) no es el trabajo: se dice y no se lista.
  const nombres = parte.estructural ? [] : parte.ejercicios;
  const visibles = nombres.slice(0, MAX_EJERCICIOS_EN_FILA);
  const deMas = nombres.length - visibles.length;
  return (
    <li style={{ padding: '12px 0', borderTop: `1px solid ${lineaDe(tono)}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {mostrarTitulo ? (
        <div style={enFila}>
          <PuntoModalidad modalidad={parte.modalidad} tam={parte.estructural ? 8 : 10} mono={mono} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              ...fuente(parte.estructural ? 500 : 700, TAM.cuerpo, 1.25),
              color: 'var(--twin-fg)',
              ...(mono ? { color: 'var(--twin-accent-on)' } : null),
            }}
          >
            {parte.titulo}
          </span>
          <span style={{ ...fuente(500, TAM.suelo, 1.25), ...TABULAR, color: mono ? 'var(--twin-accent-on)' : 'var(--twin-fg)' }}>
            {recuento(parte.ejercicios.length, 'ejercicio', 'ejercicios')}
          </span>
        </div>
      ) : null}
      {visibles.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: mostrarTitulo ? 20 : 0 }}>
          {visibles.map((nombre) => (
            <li key={nombre} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', ...fuente(500, TAM.suelo, 1.35), color: mono ? 'var(--twin-accent-on)' : 'var(--twin-fg)' }}>
              <span aria-hidden style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', marginTop: 8, flex: '0 0 auto' }} />
              <span>{nombre}</span>
            </li>
          ))}
          {deMas > 0 ? (
            <li style={{ paddingLeft: 14, ...fuente(700, TAM.suelo, 1.35), color: mono ? 'var(--twin-accent-on)' : 'var(--twin-fg)' }}>+ {deMas} más</li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function ListaDePartes({ desglose, tono }: { desglose: DesgloseSesion; tono: TonoPlan }) {
  const partes = desglose.partes.slice(0, MAX_PARTES);
  const deMas = desglose.partes.length - partes.length;
  const color = tono === 'accion' ? 'var(--twin-accent-on)' : 'var(--twin-fg)';
  return (
    <div>
      <ul aria-label="De qué está hecha la sesión" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {partes.map((p, i) => (
          // Con UN solo bloque su título repite el de la sesión: encabezar la lista con él no dice nada.
          <Parte key={`${p.titulo}-${i}`} parte={p} tono={tono} mostrarTitulo={partes.length > 1} />
        ))}
      </ul>
      {deMas > 0 ? (
        <p style={{ margin: 0, padding: '10px 0 0', borderTop: `1px solid ${lineaDe(tono)}`, ...fuente(700, TAM.suelo, 1.3), color }}>
          {recuento(deMas, 'parte más', 'partes más')}
        </p>
      ) : null}
    </div>
  );
}

/** Mismo tamaño que las filas que sustituye: al llegar el desglose, nada salta. */
function PartesEsqueleto() {
  return (
    <div aria-busy aria-label="Cargando las partes de la sesión" style={{ display: 'flex', flexDirection: 'column' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ padding: '12px 0', borderTop: '1px solid var(--twin-hairline-strong)', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Esqueleto ancho={i === 1 ? '46%' : '62%'} alto={17} radio={5} />
          {i !== 0 && i !== 2 ? <Esqueleto ancho="38%" alto={15} radio={5} style={{ marginLeft: 20 }} /> : null}
        </div>
      ))}
    </div>
  );
}

function Nota({ texto, coach, tono }: { texto: string; coach: string | null; tono: TonoPlan }) {
  const naranja = tono === 'accion';
  return (
    <figure style={{ margin: 0, paddingLeft: 14, borderLeft: `3px solid ${naranja ? velo('var(--twin-accent-on)', 55) : 'var(--twin-accent)'}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Etiqueta color={naranja ? 'var(--twin-accent-on)' : 'var(--twin-fg)'}>{coach ? `Nota de ${coach}` : 'Nota de tu coach'}</Etiqueta>
      <blockquote style={{ margin: 0, ...fuente(500, TAM.cuerpo, 1.4), color: naranja ? 'var(--twin-accent-on)' : 'var(--twin-fg)', textWrap: 'pretty' }}>
        {texto}
      </blockquote>
    </figure>
  );
}

// ── Lo que viene ────────────────────────────────────────────────────────────

/** Una fila dentro de la card que lleva a otra sesión (ayer, mañana). No es una tarjeta dentro de otra: es una fila. */
function FilaContexto({
  etiqueta,
  titulo,
  modalidad,
  detalle,
  estado,
  onClick,
  aria,
}: {
  etiqueta: string;
  titulo: string;
  modalidad: CuerpoSesion['principal']['modalidad'];
  detalle: string | null;
  /** El sello de cómo fue (ayer). Lo que aún no ha pasado no lleva ninguno. */
  estado?: EstadoSesion;
  onClick: () => void;
  aria: string;
}) {
  return (
    <button
      type="button"
      className="pl-btn"
      aria-label={aria}
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 68,
        padding: '10px 14px',
        boxSizing: 'border-box',
        borderRadius: RADIO.fila,
        background: velo('var(--twin-fg)', 7),
        border: `1px solid ${velo('var(--twin-fg)', 12)}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        color: 'var(--twin-fg)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Etiqueta color="var(--twin-fg)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {etiqueta}
        </Etiqueta>
        <span style={{ ...enFila, alignItems: 'flex-start' }}>
          <span style={{ paddingTop: 7, display: 'inline-flex' }}>
            <PuntoModalidad modalidad={modalidad} tam={9} />
          </span>
          <span style={{ ...fuente(700, TAM.cuerpo, 1.25), minWidth: 0, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere' }}>
            {titulo}
          </span>
        </span>
      </span>
      {detalle || estado ? (
        <span style={{ ...enFila, gap: 6, flex: '0 0 auto', ...fuente(estado ? 700 : 600, TAM.suelo, 1.2), ...TABULAR }}>
          {estado ? <SelloEstado estado={estado} tam={20} /> : null}
          {detalle}
        </span>
      ) : null}
      <span aria-hidden style={{ display: 'inline-flex', color: 'var(--twin-fg)' }}>
        <IcoChevron tam={16} />
      </span>
    </button>
  );
}

// ── Sesión ──────────────────────────────────────────────────────────────────

export function SujetoSesion({
  cuerpo,
  l,
  semana,
  offset,
  desglose,
  tono,
  indice,
  onLog,
}: {
  cuerpo: CuerpoSesion;
  l: LecturaPlan;
  semana: SemanaDelPlan;
  offset: number;
  desglose: Desglose;
  tono: TonoPlan;
  indice: number | null;
  onLog: (linea: string) => void;
}) {
  const { dia, principal, estado } = cuerpo;
  const listo = desglose.estado === 'listo' ? desglose : null;
  const terminada = trabajado(estado);
  // Lo siguiente solo sitúa el día de hoy: hojeando otro día ese marco sería el de hoy colgado de otro.
  const siguiente: DiaConSesion | null = terminada && dia.esHoy && offset === 0 ? sesionSiguiente(semana) : null;
  const aria = `${principal.titulo}. ${etiquetaDeFecha(dia.iso, l.hoyIso)}. ${ETIQUETA_ESTADO[estado]}`;

  return (
    <ShellSujeto tono={tono} etiqueta={aria} indiceMuesca={indice}>
      <Arriba>
        <KickerPlan tono={tono} aparte={<EstadoPastilla estado={estado} tono={tono} />}>
          {etiquetaDeFecha(dia.iso, l.hoyIso)}
        </KickerPlan>
        <TituloPlan tono={tono} px={tamanoDeTitulo(principal.titulo)}>
          {principal.titulo}
        </TituloPlan>
        <Pastillas cuerpo={cuerpo} desglose={desglose} tono={tono} />
      </Arriba>
      <Abajo>
        {desglose.estado === 'cargando' ? (
          <PartesEsqueleto />
        ) : listo && listo.partes.length > 0 ? (
          <ListaDePartes desglose={listo} tono={tono} />
        ) : principal.resumen ? (
          // Sin desglose se dice lo que sí se sabe (la estructura de la fila) y se calla el resto.
          <ApoyoPlan tono={tono}>{principal.resumen}</ApoyoPlan>
        ) : (
          <ApoyoPlan tono={tono}>El detalle no está disponible ahora. Abre la sesión para verla entera.</ApoyoPlan>
        )}
        {listo?.nota ? <Nota texto={listo.nota} coach={l.coach} tono={tono} /> : null}
        {siguiente ? (
          <FilaContexto
            etiqueta={rotuloDeDia(siguiente.dia.iso, l.hoyIso)}
            titulo={siguiente.sesion.titulo}
            modalidad={siguiente.sesion.modalidad}
            detalle={textoDuracion(siguiente.sesion.duracion)}
            aria={`Lo siguiente: ${etiquetaDeFecha(siguiente.dia.iso, l.hoyIso)}, ${siguiente.sesion.titulo}`}
            onClick={() => onLog(`Lo siguiente → abre «${siguiente.sesion.titulo}»`)}
          />
        ) : null}
      </Abajo>
    </ShellSujeto>
  );
}

// ── Descanso ────────────────────────────────────────────────────────────────

export function SujetoDescanso({
  cuerpo,
  l,
  semana,
  tono,
  indice,
  onLog,
}: {
  cuerpo: CuerpoDescanso;
  l: LecturaPlan;
  semana: SemanaDelPlan;
  tono: TonoPlan;
  indice: number | null;
  onLog: (linea: string) => void;
}) {
  const { dia, conContexto } = cuerpo;
  const ayer = conContexto ? sesionAnterior(semana) : null;
  const siguiente = conContexto ? sesionSiguiente(semana) : null;
  const dgAyer = ayer ? l.desgloses[ayer.sesion.id] : undefined;
  const medido = dgAyer?.estado === 'listo' && dgAyer.medidoMin ? formatoMinutos(dgAyer.medidoMin) : null;
  // Una sesión hecha se cuenta con lo que se MIDIÓ. Sin medida no se rellena con lo previsto: se dice qué pasó.
  const detalleAyer = ayer ? (trabajado(ayer.sesion.estado) ? (medido ?? ETIQUETA_ESTADO[ayer.sesion.estado].toLowerCase()) : 'sin registrar') : null;

  return (
    <ShellSujeto tono={tono} etiqueta={`${TEXTOS.descanso.titulo(dia.esHoy)}. ${etiquetaDeFecha(dia.iso, l.hoyIso)}`} indiceMuesca={indice}>
      <Arriba>
        <KickerPlan
          tono={tono}
          aparte={
            <Pastilla fondo={velo('var(--twin-fg)', 9)} tinta="var(--twin-fg)" icono={<SelloEstado estado="pendiente" tam={18} />}>
              Descanso
            </Pastilla>
          }
        >
          {etiquetaDeFecha(dia.iso, l.hoyIso)}
        </KickerPlan>
        <TituloPlan tono={tono}>{TEXTOS.descanso.titulo(dia.esHoy)}</TituloPlan>
        <ApoyoPlan tono={tono}>{TEXTOS.descanso.apoyo(dia.esHoy)}</ApoyoPlan>
      </Arriba>
      <Abajo>
        {conContexto ? (
          ayer || siguiente ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${lineaDe(tono)}`, paddingTop: 16 }}>
              {ayer ? (
                <FilaContexto
                  etiqueta={rotuloDeDia(ayer.dia.iso, l.hoyIso)}
                  titulo={ayer.sesion.titulo}
                  modalidad={ayer.sesion.modalidad}
                  detalle={detalleAyer}
                  estado={estadoEfectivo(ayer.sesion, ayer.dia.iso, l.hoyIso)}
                  aria={[etiquetaDeFecha(ayer.dia.iso, l.hoyIso), ayer.sesion.titulo, detalleAyer].filter(Boolean).join(', ')}
                  onClick={() => onLog(`${etiquetaDeFecha(ayer.dia.iso, l.hoyIso)} → abre lo que registraste en «${ayer.sesion.titulo}»`)}
                />
              ) : null}
              {siguiente ? (
                <FilaContexto
                  etiqueta={rotuloDeDia(siguiente.dia.iso, l.hoyIso)}
                  titulo={siguiente.sesion.titulo}
                  modalidad={siguiente.sesion.modalidad}
                  detalle={textoDuracion(siguiente.sesion.duracion)}
                  aria={[etiquetaDeFecha(siguiente.dia.iso, l.hoyIso), siguiente.sesion.titulo, textoDuracion(siguiente.sesion.duracion)].filter(Boolean).join(', ')}
                  onClick={() => onLog(`${etiquetaDeFecha(siguiente.dia.iso, l.hoyIso)} → abre «${siguiente.sesion.titulo}»`)}
                />
              ) : (
                <p style={{ margin: 0, ...fuente(600, TAM.suelo, 1.35), color: 'var(--twin-fg)' }}>{TEXTOS.descanso.semanaCerrada}</p>
              )}
            </div>
          ) : (
            <p style={{ margin: 0, ...fuente(600, TAM.suelo, 1.35), color: 'var(--twin-fg)' }}>{TEXTOS.descanso.semanaCerrada}</p>
          )
        ) : null}
      </Abajo>
    </ShellSujeto>
  );
}

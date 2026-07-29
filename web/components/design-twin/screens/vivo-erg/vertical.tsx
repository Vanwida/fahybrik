'use client';

// La cara vertical: el móvil en la mano o en el suelo, y un sujeto por estado.
//
// LA REGLA QUE ORDENA TODA LA PANTALLA — quién gobierna, por estado:
//
//   armado      → nadie mide todavía. Gobierna la ORDEN (qué te toca), y
//                 `gobierna` degrada a `centra` como manda el §6.1.
//   trabajando  → gobierna la MEDIDA contra su objetivo: el ritmo por 500 en
//                 remo y esquí, las calorías que quedan en la bici (allí no
//                 hay ritmo por 500 que valga, y la caloría es lo que cierra).
//   sin lectura → gobierna el RELOJ. Es el único dato vivo que le queda a la
//                 app, y decirlo es más honesto que dejar el último número
//                 puesto como si siguiera midiendo.
//   descanso    → gobierna la CUENTA ATRÁS, con el pulso cayendo debajo.
//
// El toque para cerrar el tramo está SIEMPRE abajo: cuando la medida falla, la
// salida es el dedo.

import { Card, Hairline, Label, Mono, Pantalla, SP } from '../../kit';
import { fmtClock, fmtPace500 } from '../../sim';
import {
  Ambiente,
  Aviso,
  BarraDrenaje,
  Celda,
  Cromo,
  Delta,
  Drenaje,
  Fogonazo,
  Pausa,
  SalidaManual,
  Sujeto,
  zonaDe,
  COLOR_ZONA,
} from './atomos';
import { Descanso, Hecho } from './descanso';
import {
  BICI_SERIE_1,
  CADENCIA_UNIDAD,
  MAQUINA_NOMBRE,
  MEDIDA_UNIDAD,
  type Parcial,
  type Prescripcion,
  dosisDePrescripcion,
  fmtElapsed,
  lecturaViva,
  objetivoTexto,
  parcialesDe,
  parcialesHasta,
  ritmoConUnidad,
} from './data';
import { useMotorErg, type EstadoErg, type Guion } from './motor';

// ---------------------------------------------------------------------------

export function CaraVertical({ guion, onLog }: { guion: Guion; onLog: (linea: string) => void }) {
  const e = useMotorErg(guion, onLog);
  const zona = zonaDe(e.pulso);

  const cuerpo = (() => {
    switch (e.fase) {
      case 'armado':
        return <Armado e={e} guion={guion} onLog={onLog} />;
      case 'descanso':
        return <Descanso e={e} onLog={onLog} />;
      case 'hecho':
        return <Hecho e={e} onLog={onLog} />;
      default:
        return <Trabajando e={e} guion={guion} onLog={onLog} />;
    }
  })();

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Ambiente zona={zona} />
      <Fogonazo activo={e.fogonazo} />
      <div style={{ position: 'relative', height: '100%' }}>{cuerpo}</div>
      {e.pausado && (
        <Pausa
          onReanudar={e.alternarPausa}
          onSalir={() => onLog('salir del entreno: se guarda lo medido hasta aquí')}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La línea de prescripción — el objetivo manda en naranja; si no lo hay, se dice
// ---------------------------------------------------------------------------

function TiraPrescripcion({ pres }: { pres: Prescripcion }) {
  const objetivo = objetivoTexto(pres);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        padding: '7px 12px',
        borderRadius: 10,
        background: 'var(--twin-surface)',
      }}
    >
      {objetivo ? (
        <>
          <Label size={9} color="var(--twin-accent-text)">Objetivo</Label>
          <Mono size={14} weight={800} color="var(--twin-accent-text)">{objetivo}</Mono>
        </>
      ) : (
        <span style={{ font: '500 12px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          Sin objetivo escrito
        </span>
      )}
      <span style={{ flex: 1 }} />
      <Mono size={12} color="var(--twin-muted)">{dosisDePrescripcion(pres)}</Mono>
    </div>
  );
}

/**
 * Las celdas de servicio. Las que dependen del monitor DESAPARECEN mientras no
 * hay lecturas: ni un guion ni el último valor congelado haciéndose pasar por
 * vivo (§7). El reloj se queda, porque el reloj sí lo sabe la app.
 */
function CeldasServicio({ e, guion }: { e: EstadoErg; guion: Guion }) {
  const viva = lecturaViva(guion.maquina, e.t);
  const zona = zonaDe(e.pulso);
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <Celda etiqueta="tiempo" valor={fmtElapsed(e.t)} />
      {!e.ciego && (
        <Celda etiqueta={CADENCIA_UNIDAD[guion.maquina].split('/')[0]} valor={`${viva.cadencia}`} />
      )}
      {!e.ciego && <Celda etiqueta="vatios" valor={`${viva.vatios}`} />}
      {/* Sin reloj no hay pulso: la celda no existe. */}
      {e.pulso != null && (
        <Celda etiqueta="pulso" valor={`${e.pulso}`} color={COLOR_ZONA(zona)} pie={zona ? `Z${zona}` : undefined} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// armado — el crono espera a la máquina
// ---------------------------------------------------------------------------

function Armado({ e, guion, onLog }: { e: EstadoErg; guion: Guion; onLog: (linea: string) => void }) {
  const maquina = MAQUINA_NOMBRE[guion.maquina];
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  const enSeries = e.pres.series > 1;
  return (
    <Pantalla
      accion={
        <SalidaManual
          titulo={enSeries ? `Saltar la serie ${e.serie}` : 'Saltar este tramo'}
          onClick={() => onLog(`saltas la serie ${e.serie}: queda sin medir y el coach lo ve así`)}
          alto={54}
          style={{ fontSize: 14, textTransform: 'none', fontStyle: 'normal', fontWeight: 600, letterSpacing: 0 }}
        />
      }
    >
      <Cromo
        titulo={e.pres.titulo}
        serie={e.serie}
        series={e.pres.series}
        onSalir={() => onLog('salir del entreno antes de empezar la serie')}
        onPausa={e.alternarPausa}
      />
      <TiraPrescripcion pres={e.pres} />
      <Sujeto
        etiqueta={enSeries ? `Serie ${e.serie} de ${e.pres.series}` : e.pres.titulo}
        valor={`${e.pres.cantidad}`}
        unidad={unidad}
        minPx={72}
        maxPx={146}
        extra={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: 'var(--twin-accent)',
                  boxShadow: '0 0 0 6px color-mix(in srgb, var(--twin-accent) 22%, transparent)',
                }}
              />
              <span className="t-headline-s" style={{ color: 'var(--twin-fg)' }}>
                Empieza cuando {maquina} se mueva
              </span>
            </span>
            {e.pulso != null && (
              <Mono size={13} color="var(--twin-muted)">
                pulso {e.pulso} ppm
              </Mono>
            )}
          </div>
        }
      />
      {/* UN aviso, no dos: el atleta está de pie esperando para arrancar, no
          leyendo. Las dos verdades que importan caben en una frase. */}
      <Aviso
        texto={`El crono arranca solo y parado no cierra nada. La cuenta de ${
          unidad === 'm' ? 'metros' : 'calorías'
        } vuelve a cero para esta serie, aunque el monitor siga sumando lo suyo.`}
      />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// trabajando — gobierna la medida, salvo cuando el monitor calla
// ---------------------------------------------------------------------------

function Trabajando({ e, guion, onLog }: { e: EstadoErg; guion: Guion; onLog: (linea: string) => void }) {
  const esBici = e.pres.medida === 'calorias';
  const viva = lecturaViva(guion.maquina, e.t);
  const objetivo = e.pres.objetivo;
  const maquina = MAQUINA_NOMBRE[guion.maquina];

  // El sujeto, resuelto por la regla y no por la máquina: si la medida calla,
  // el reloj es lo único que la app sabe de verdad; y si el cruce se perdió,
  // «te quedan 0» sería mentir (la serie NO está cerrada), así que se lee lo
  // acumulado, que es lo único que el monitor sostiene.
  const sujeto = (() => {
    if (e.ciego) {
      return { etiqueta: 'Tiempo del tramo', valor: fmtElapsed(e.t), unidad: 'sin lecturas', max: 118 };
    }
    if (e.cruceCiego) {
      return {
        etiqueta: 'Llevas',
        valor: `${e.medido}`,
        unidad: MEDIDA_UNIDAD[e.pres.medida],
        max: 150,
      };
    }
    if (esBici) {
      return { etiqueta: 'Te quedan', valor: `${e.restante}`, unidad: 'cal', max: 150 };
    }
    return {
      etiqueta: 'Ritmo ahora',
      valor: viva.ritmo == null ? fmtElapsed(e.t) : fmtPace500(viva.ritmo),
      unidad: '/500m',
      max: 140,
    };
  })();

  // En la bici el delta acompaña a los vatios, que es lo que compara; colgarlo
  // del sujeto (las calorías) haría leer una cosa por otra.
  const delta =
    e.ciego || e.cruceCiego || esBici || objetivo?.clase !== 'ritmo' || viva.ritmo == null
      ? null
      : {
          valor: viva.ritmo - objetivo.segundosPor500,
          unidad: 's',
          mejorEs: 'menos' as const,
          sufijo: 'vs objetivo',
          textoNulo: 'en el objetivo',
        };

  const parciales = e.pres.series === 1 ? parcialesHasta(parcialesDe(e.pres), e.t) : [];

  return (
    <Pantalla
      accion={
        <SalidaManual
          titulo={e.pres.series > 1 ? `Cerrar la serie ${e.serie}` : 'Cerrar este tramo'}
          onClick={e.cerrarAMano}
          destacada={e.cruceCiego}
        />
      }
    >
      <Cromo
        titulo={e.pres.titulo}
        serie={e.serie}
        series={e.pres.series}
        onSalir={() => onLog('salir del entreno: se guarda lo medido de esta serie')}
        onPausa={e.alternarPausa}
      />
      <TiraPrescripcion pres={e.pres} />

      <Sujeto
        etiqueta={sujeto.etiqueta}
        valor={sujeto.valor}
        unidad={sujeto.unidad}
        maxPx={sujeto.max}
        color={e.ciego ? 'var(--twin-muted)' : 'var(--twin-fg)'}
        extra={
          delta ? (
            <div style={{ marginTop: 8 }}>
              <Delta
                valor={delta.valor}
                unidad={delta.unidad}
                mejorEs={delta.mejorEs}
                sufijo={delta.sufijo}
                textoNulo={delta.textoNulo}
              />
            </div>
          ) : undefined
        }
      />

      {e.cruceCiego && (
        <Aviso
          tono="alerta"
          texto={`${maquina} volvió ya por encima de ${e.pres.cantidad}. El cruce no se vio, así que la serie no se da por hecha: ciérrala tú.`}
        />
      )}
      {e.ciego && <Aviso tono="alerta" texto={`Sin lecturas de ${maquina}. El tramo sigue abierto: parado no cierra nada.`} />}

      {esBici ? (
        <VatiosBici e={e} vatios={viva.vatios} />
      ) : e.pres.series === 1 ? (
        <TarjetaParciales parciales={parciales} e={e} />
      ) : (
        <Drenaje
          restante={e.restante}
          total={e.pres.cantidad}
          unidad="m"
          ciego={e.ciego}
          cubierta={e.cruceCiego}
          medido={e.medido}
        />
      )}

      <CeldasServicio e={e} guion={guion} />
    </Pantalla>
  );
}

/**
 * En la bici el ritmo son vatios: van en su propia línea con su comparación al
 * lado, no colgando del sujeto. Mientras el monitor calla no hay vatios que
 * pintar, así que la línea pasa a leer lo acumulado, que sí se sostiene.
 */
function VatiosBici({ e, vatios }: { e: EstadoErg; vatios: number }) {
  return (
    <Card padding={SP.m}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {e.ciego ? (
          <Drenaje restante={e.restante} total={e.pres.cantidad} unidad="cal" ciego compacto />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="t-readout-l">{vatios}</span>
              <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>vatios ahora</span>
              <span style={{ flex: 1 }} />
              <Mono size={12} color="var(--twin-faint)">serie 1: {BICI_SERIE_1.vatiosMedios} W</Mono>
            </div>
            <Delta
              valor={vatios - BICI_SERIE_1.vatiosMedios}
              unidad="W"
              mejorEs="mas"
              sufijo="vs tu serie 1"
              textoNulo="igual que tu serie 1"
            />
            <BarraDrenaje
              restante={e.restante}
              total={e.pres.cantidad}
              ciego={false}
              cubierta={e.cruceCiego}
              alto={8}
            />
          </>
        )}
      </div>
    </Card>
  );
}

/** Los parciales que ya cantó el monitor, apilándose en vivo bajo el sujeto. */
function TarjetaParciales({ parciales, e }: { parciales: Parcial[]; e: EstadoErg }) {
  return (
    <Card padding={SP.m}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Drenaje
          restante={e.restante}
          total={e.pres.cantidad}
          unidad="m"
          ciego={e.ciego}
          cubierta={e.cruceCiego}
          medido={e.medido}
          compacto
        />
        {parciales.length > 0 && <Hairline />}
        {parciales.map((p) => (
          <div key={p.metros} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <Mono size={13} weight={700} color="var(--twin-muted)">{p.metros} m</Mono>
            <span style={{ flex: 1 }} />
            <Mono size={15} weight={800}>{ritmoConUnidad(p.ritmo)}</Mono>
            <Mono size={13} color="var(--twin-faint)" style={{ width: 46, textAlign: 'right' }}>
              {fmtClock(Math.round(p.acumuladoS))}
            </Mono>
          </div>
        ))}
      </div>
    </Card>
  );
}

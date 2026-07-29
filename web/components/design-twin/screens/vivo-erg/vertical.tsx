'use client';

// La cara vertical: el móvil en la mano o en el suelo, y un sujeto por estado.
//
// LA REGLA QUE ORDENA TODA LA PANTALLA — quién gobierna, por estado:
//
//   cuenta      → la cuenta atrás. No hay nada más que exista todavía.
//   armado      → la ORDEN, con el crono retenido diciendo por qué está a cero.
//   sin monitor → la PRESCRIPCIÓN: sigue siendo verdad sin nada que la mida.
//   trabajando  → la MEDIDA contra su objetivo: el ritmo por 500 en remo y
//                 esquí, las calorías que quedan en la bici (allí no hay ritmo
//                 por 500 que valga, y la caloría es lo que cierra).
//   sin lectura → el RELOJ. Es el único dato vivo que le queda a la app, y
//                 decirlo es más honesto que dejar el último número puesto.
//   descanso    → la CUENTA ATRÁS, con el pulso cayendo debajo.
//
// El orden de los bloques es el de la app shipeada, y por su misma razón: es el
// orden en que llegan las preguntas a media pieza. El toque para cerrar está
// SIEMPRE abajo.
//
// Desde el 29-jul se monta sobre `MarcoVivo` (§10.3): cromo · contexto ·
// SUJETO · apoyos · acción, con la banda del sujeto fija. La caja del objetivo
// baja de encima del sujeto a la primera fila de apoyos —sigue siendo lo
// segundo que se lee, y pegada al número que la gobierna (§10.6)— porque es lo
// que hace que el ritmo caiga a la misma altura que los metros que faltan del
// tramo de correr de la serie siguiente.

import type { ReactNode } from 'react';
import { Card, Hairline, Label, Mono } from '../../kit';
import type { TwinAppearance } from '../../types';
import { fmtClock, fmtPace500 } from '../../sim';
import { Ambiente, Fogonazo, FranjaAccion, MarcoVivo, zonaDe } from '../../kit-vivo';
import { Aviso, Cromo, Pausa } from './atomos';
import { Descanso, Hecho } from './descanso';
import { AvisoSinDatos, BannerPrograma, CuentaAtras, PuertaSinMonitor, SujetoSinMonitor } from './estados';
import { CajaObjetivo, FranjaContexto, HeroErg, RailTrabajo, type SujetoErg } from './piezas';
import {
  BICI_SERIE_1,
  MAQUINA_NOMBRE,
  MEDIDA_UNIDAD,
  type Objetivo,
  type Parcial,
  fmtElapsed,
  lecturaViva,
  parcialesDe,
  parcialesHasta,
  ritmoConUnidad,
} from './data';
import { tituloAccion, useMotorErg, type EstadoErg, type Guion } from './motor';

export function CaraVertical({
  guion,
  appearance,
  onLog,
}: {
  guion: Guion;
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
  const e = useMotorErg(guion, onLog);
  const zona = zonaDe(e.pulso);

  const cuerpo = (() => {
    switch (e.fase) {
      case 'descanso':
        return <Descanso e={e} onLog={onLog} />;
      case 'hecho':
        return <Hecho e={e} onLog={onLog} />;
      default:
        return <Tramo e={e} guion={guion} onLog={onLog} />;
    }
  })();

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* En descanso manda el azul de la app (lo pone la propia pantalla de
          descanso); trabajando, la zona de pulso tiñe el ambiente. */}
      <Ambiente zona={e.fase === 'descanso' ? null : zona} appearance={appearance} />
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
// El tramo: cuenta, armado, sin monitor y trabajando comparten cromo y acción
// ---------------------------------------------------------------------------

function Tramo({ e, guion, onLog }: { e: EstadoErg; guion: Guion; onLog: (linea: string) => void }) {
  const esBici = e.pres.medida === 'calorias';
  const viva = lecturaViva(guion.maquina, e.t);
  const maquina = MAQUINA_NOMBRE[guion.maquina];
  const mudo = e.monitor === 'mudo';
  const ausente = e.monitor === 'ausente';
  const enCuenta = e.fase === 'cuenta';

  const sujeto = enCuenta ? (
    <CuentaAtras e={e} />
  ) : ausente ? (
    <SujetoSinMonitor e={e} />
  ) : (
    <HeroErg
      e={e}
      sujeto={sujetoDe(e, esBici, mudo, viva.ritmo, viva.vatios)}
      media={mediaDe(e, esBici)}
      delta={deltaDe(e, esBici, mudo, viva)}
    />
  );

  return (
    <MarcoVivo
      cromo={
        <Cromo
          titulo={e.pres.titulo}
          serie={e.serie}
          series={e.pres.series}
          onSalir={() => onLog('salir del entreno: se guarda lo medido de esta serie')}
          onPausa={e.alternarPausa}
        />
      }
      contexto={<FranjaContexto e={e} />}
      sujeto={sujeto}
      apoyos={
        <Apoyos>
          {e.fase === 'armado' && <BannerPrograma estado="listo" />}
          {e.fase === 'armado' && <AvisoSinDatos maquina={guion.maquina} />}
          {ausente ? (
            <PuertaSinMonitor
              maquina={guion.maquina}
              onConectar={() => onLog('conectar el remo: se abre la puerta de conexión')}
            />
          ) : (
            !enCuenta && (
              <>
                <CajaObjetivo e={e} />
                {e.cruceCiego && (
                  <Aviso
                    tono="alerta"
                    texto={`${maquina} volvió ya por encima de ${e.pres.cantidad}. El cruce no se vio, así que la serie no se da por hecha: ciérrala tú.`}
                  />
                )}
                {mudo && (
                  <Aviso tono="alerta" texto={`Sin lecturas de ${maquina}. El tramo sigue abierto: parado no cierra nada.`} />
                )}
                {e.pres.series === 1 && <TarjetaParciales parciales={parcialesHasta(parcialesDe(e.pres), e.t)} />}
                <RailTrabajo e={e} viva={viva} maquina={guion.maquina} />
              </>
            )
          )}
        </Apoyos>
      }
      accion={
        enCuenta ? (
          <FranjaAccion titulo={tituloAccion(e)} onClick={e.saltarCuenta} />
        ) : (
          /* El cruce del hito es quien cierra la serie, así que el toque es el
             atajo y va en contorno. Se gana el relleno solo cuando el cruce ya
             no puede llegar: porque el corte se lo tragó (`cruceCiego`) o
             porque no hay monitor que lo vea (§10.5). */
          <FranjaAccion titulo={tituloAccion(e)} onClick={e.cerrarAMano} unicaSalida={e.cruceCiego || ausente} />
        )
      }
    />
  );
}

/**
 * La fila de apoyos del ergo. Es la única de la tanda que puede desbordar —los
 * parciales de una pieza continua se apilan solos y ya son cinco cartas— así
 * que scrollea DENTRO de su fila en vez de comerse la banda del sujeto o
 * dejar una cola debajo de la acción (§6.1).
 */
function Apoyos({ children }: { children: ReactNode }) {
  return (
    <div
      className="twin-scroll"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '100%', flex: '0 1 auto' }}
    >
      {children}
    </div>
  );
}

/**
 * El sujeto, resuelto por la regla y no por la máquina.
 *
 * En la bici NO es la caloría: la caloría ya manda arriba, en la caja del
 * objetivo, con su barra y su cubierto. El sujeto es la intensidad con la que
 * la estás quemando, que en una bici son vatios y no un ritmo por 500. Colgar
 * el delta de vatios de un número de calorías era leer una cosa por otra.
 */
function sujetoDe(e: EstadoErg, esBici: boolean, mudo: boolean, ritmo: number | null, vatios: number): SujetoErg {
  if (mudo) {
    return {
      etiqueta: 'Tiempo del tramo',
      valor: fmtElapsed(e.t),
      unidad: 'sin lecturas',
      color: 'var(--twin-muted)',
    };
  }
  if (esBici) {
    return { etiqueta: 'Ritmo ahora', valor: `${vatios}`, unidad: 'vatios' };
  }
  // Armado: el crono está retenido y lo dice la etiqueta del subreadout, así
  // que el sujeto es la orden, no un ritmo que nadie ha medido todavía.
  if (e.fase === 'armado' || ritmo == null) {
    return {
      etiqueta: e.pres.series > 1 ? `Serie ${e.serie} de ${e.pres.series}` : 'Ahora',
      valor: `${e.pres.cantidad}`,
      unidad: MEDIDA_UNIDAD[e.pres.medida],
    };
  }
  return { etiqueta: 'Ritmo ahora', valor: fmtPace500(ritmo), unidad: '/500m' };
}

/** La media de la serie: la app la enseña EN VIVO bajo el ritmo, no al final. */
function mediaDe(e: EstadoErg, esBici: boolean): string | null {
  if (esBici || e.medido == null || e.medido <= 0 || e.t <= 0) return null;
  return fmtPace500((500 * e.t) / e.medido);
}

function deltaDe(e: EstadoErg, esBici: boolean, mudo: boolean, viva: { ritmo: number | null; vatios: number }) {
  // El delta habla de INTENSIDAD, no de la medida: sigue valiendo aunque el
  // cruce se haya perdido, porque sigues pedaleando mientras decides el toque.
  if (mudo || e.fase === 'armado') return undefined;
  if (esBici) {
    return {
      valor: viva.vatios - BICI_SERIE_1.vatiosMedios,
      unidad: 'W',
      mejorEs: 'mas' as const,
      sufijo: 'vs tu serie 1',
      textoNulo: 'igual que tu serie 1',
    };
  }
  const objetivo: Objetivo | null = e.pres.objetivo;
  if (objetivo?.clase !== 'ritmo' || viva.ritmo == null) return undefined;
  return {
    valor: viva.ritmo - objetivo.segundosPor500,
    unidad: 's',
    mejorEs: 'menos' as const,
    sufijo: 'vs objetivo',
    textoNulo: 'en el objetivo',
  };
}

// ---------------------------------------------------------------------------
// Los parciales de una pieza continua, apilándose en vivo
// ---------------------------------------------------------------------------

function TarjetaParciales({ parciales }: { parciales: Parcial[] }) {
  if (parciales.length === 0) return null;
  return (
    <Card padding={0}>
      <div style={{ display: 'flex', alignItems: 'baseline', padding: '8px 12px' }}>
        <Label size={10}>Parciales</Label>
        <span style={{ flex: 1 }} />
        <Mono size={11} color="var(--twin-muted)">cada 100 m</Mono>
      </div>
      {parciales.map((p) => (
        <div key={p.metros}>
          <Hairline />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 12px' }}>
            <Mono size={13} weight={700} color="var(--twin-muted)">{p.metros} m</Mono>
            <span style={{ flex: 1 }} />
            <Mono size={15} weight={800}>{ritmoConUnidad(p.ritmo)}</Mono>
            <Mono size={13} color="var(--twin-faint)" style={{ width: 46, textAlign: 'right' }}>
              {fmtClock(Math.round(p.acumuladoS))}
            </Mono>
          </div>
        </div>
      ))}
    </Card>
  );
}

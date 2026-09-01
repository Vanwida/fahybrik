'use client';

// CÓMO ESTÁ HOY — el hierro que hay en la app, reproducido para poder juzgarlo.
//
// No es la pantalla de julio del doble: es el Swift que está SHIPEADO
// (`FuerzaVivoView.swift`, commit 478f8e3f «el EMOM y el hierro hablan el §10»),
// ranura por ranura, alimentado por el modelo por serie. Sin el ANTES, el después
// no se puede juzgar — y las dos cosas que la propuesta cambia solo se ven
// poniéndolas al lado:
//
//  1. LA FRANJA DE CONTEXTO —la que no desaparece jamás— la ocupa hoy la línea del
//     plan, que es un dato ESTÁTICO: no cambia en todo el ejercicio. Y cuando las
//     series no son iguales, MIENTE: `Formato.dosisDeSeries` multiplica el número
//     de series por las repeticiones de la PRIMERA, así que el 6-6-4-4-3 real del
//     bloque 392 sale escrito «5×6», una dosis que el coach no escribió nunca.
//     Mientras eso ocupa la franja, el crono del bloque vive en una celda de
//     servicio de 22 px, la tercera de la fila.
//  2. EL RIEL PINTA UN PELDAÑO POR SERIE, todos. Con cuatro cabe; con doce cada
//     peldaño se queda en 26 pt y la dosis deja de leerse. (SwiftUI la encoge al
//     50 % con `minimumScaleFactor`; aquí se recorta, que en pantalla es la misma
//     conclusión: el riel deja de decir lo único que sabe decir.)
//
// Lo demás se reproduce igual porque igual está: el sujeto ya es la serie, el
// marco ya es el del §10 y la acción ya cierra serie a serie.

import { reloj } from '../../datos-reales';
import { IconHeart, Label, Mono, RAD } from '../../kit';
import {
  Ambiente,
  Apoyo,
  EtiquetaSujeto,
  FilaApoyos,
  FranjaAccion,
  MarcoVivo,
  Numeral,
  colorZona,
  zonaDe,
} from '../../kit-vivo';
import { useCronoComprimido } from '../../sim';
import type { TwinAppearance } from '../../types';
import { Cabecera, NombreEjercicio, Pie } from './atoms';
import {
  CON_RELOJ,
  SIM_X,
  cargaTexto,
  cifraDeSerie,
  hechaEnLinea,
  intensidadDe,
  pastillaIntensidad,
  pulsoEnDescanso,
  serieEnLinea,
  type Ejercicio,
  type SerieHecha,
} from './modelo';
import type { Entrada } from './propuesta';

/**
 * `FuerzaVivoView.lineaDelPlan` — lo que pidió el coach, en una línea.
 *
 * Se reproduce con su fallo incluido, que es el punto: la dosis sale de
 * `Formato.dosisDeSeries(series: setRecords.count, reps: primera.repsPrescribed)`,
 * o sea del número de series por las repeticiones de la PRIMERA. En una pirámide
 * eso no describe ninguna serie del ejercicio.
 */
function lineaDelPlan(ej: Ejercicio): string | null {
  const partes: string[] = [];
  const primera = ej.series[0]?.medida?.reps;
  if (primera != null && ej.series.length > 1) partes.push(`${ej.series.length}×${primera}`);
  const carga = cargaTexto(ej.series[0]?.carga);
  if (carga) partes.push(carga);
  const descanso = ej.series.find((s) => s.descansoS != null)?.descansoS;
  if (descanso != null) partes.push(`descanso ${reloj(descanso)}`);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** `RielDeSeries` — un peldaño por serie, todas, repartiéndose el ancho. */
function RielDeHoy({
  ejercicio,
  activa,
  hechas,
}: {
  ejercicio: Ejercicio;
  activa: number;
  hechas: Record<number, SerieHecha>;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
      {ejercicio.series.map((s, i) => {
        const h = hechas[i];
        const esLaDeAhora = i === activa;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '9px 4px',
              borderRadius: RAD.m,
              background: esLaDeAhora
                ? 'color-mix(in srgb, var(--twin-accent) 16%, transparent)'
                : 'color-mix(in srgb, var(--twin-surface) 78%, transparent)',
              border: `${esLaDeAhora ? 1.5 : 1}px solid ${
                esLaDeAhora ? 'var(--twin-accent-text)' : 'var(--twin-hairline)'
              }`,
            }}
          >
            <span
              style={{
                font: 'italic 800 11px/1.1 var(--twin-font-sans)',
                color: esLaDeAhora ? 'var(--twin-accent-text)' : 'var(--twin-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                maxWidth: '100%',
              }}
            >
              {h ? `✓ S${i + 1}` : `S${i + 1}`}
            </span>
            <span
              style={{
                font: '700 11px/1.1 var(--twin-font-mono)',
                color: esLaDeAhora ? 'var(--twin-fg)' : 'var(--twin-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {(h ? hechaEnLinea(h) : serieEnLinea(s)) ?? '·'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Hoy({
  ejercicio,
  entrada,
  appearance,
  onLog,
}: {
  ejercicio: Ejercicio;
  entrada: Entrada;
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
  const total = ejercicio.series.length;
  const { t } = useCronoComprimido(SIM_X);
  const hechas = entrada.cerradas;
  const cerradas = Object.keys(hechas).length;
  const activa = Math.min(cerradas, total - 1);
  const serie = ejercicio.series[activa];
  const cifra = cifraDeSerie(serie);
  const ppm = CON_RELOJ ? pulsoEnDescanso(entrada.haceS) : null;
  const zona = zonaDe(ppm);
  const plan = lineaDelPlan(ejercicio);

  return (
    <>
      <Ambiente zona={zona} appearance={appearance} />
      <MarcoVivo
        cromo={
          <Cabecera
            bloque={ejercicio.bloque}
            ejercicio={ejercicio.nombre}
            indice={ejercicio.posicion.i}
            total={ejercicio.posicion.de}
            onSalir={() => onLog('Salir del entreno')}
          />
        }
        contexto={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
              <span
                style={{
                  font: 'italic 800 13px/1.1 var(--twin-font-sans)',
                  letterSpacing: '0.04em',
                  color: 'var(--twin-accent-text)',
                }}
              >
                {ejercicio.nombre}
              </span>
              {plan && (
                <span
                  style={{
                    font: '500 12px/1.2 var(--twin-font-sans)',
                    color: 'var(--twin-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {plan}
                </span>
              )}
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                flex: '0 0 auto',
                padding: '4px 8px',
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--twin-surface) 80%, transparent)',
                color: ppm != null ? colorZona(zona) : 'var(--twin-muted)',
                font: 'italic 800 9px/1 var(--twin-font-sans)',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
              }}
            >
              <IconHeart size={9} />
              {ppm != null ? `${ppm} ppm` : 'sin reloj'}
            </span>
          </div>
        }
        sujeto={
          <>
            <EtiquetaSujeto>{`Serie ${activa + 1} de ${total}`}</EtiquetaSujeto>
            {cifra ? (
              <>
                <Numeral unidad={cifra.unidad ?? undefined}>{cifra.cifra}</Numeral>
                <NombreEjercicio>{ejercicio.nombre}</NombreEjercicio>
              </>
            ) : (
              <span className="t-display">{ejercicio.nombre}</span>
            )}
            {pastillaIntensidad(intensidadDe(ejercicio, activa)) && (
              <span className="tw-pill">{pastillaIntensidad(intensidadDe(ejercicio, activa))}</span>
            )}
          </>
        }
        apoyos={
          <>
            <FilaApoyos>
              <Apoyo
                etiqueta="FC"
                valor={ppm != null ? String(ppm) : null}
                ausente="sin reloj"
                tono={colorZona(zona)}
                pie="ppm"
              />
              <Apoyo etiqueta="Pausa" valor={reloj(entrada.haceS)} />
              {/* El crono del bloque, en una celda de servicio: es el dato que la
                  propuesta sube a la franja de contexto. */}
              <Apoyo etiqueta="Total" valor={reloj(entrada.aperturaS + t)} />
            </FilaApoyos>
            <RielDeHoy ejercicio={ejercicio} activa={activa} hechas={hechas} />
            {ejercicio.siguiente && (
              <Pie>
                <Label size={9}>lo siguiente</Label>
                <span style={{ flex: 1 }} />
                <Mono size={13} weight={700}>
                  {ejercicio.siguiente}
                </Mono>
              </Pie>
            )}
          </>
        }
        accion={
          <FranjaAccion
            titulo={`SERIE ${activa + 1} HECHA`}
            unicaSalida
            onClick={() => onLog(`Serie ${activa + 1} cerrada`)}
          />
        }
      />
    </>
  );
}

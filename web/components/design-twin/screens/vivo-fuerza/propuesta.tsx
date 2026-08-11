'use client';

// LA PROPUESTA — el hierro en el lenguaje del vivo.
//
// El lenguaje es el de `vivo-rondas`, que el 11-ago dejó de ser una pantalla para
// ser EL idioma de todas las superficies del vivo (directiva de Alex: «tener
// diseños perdidos por la app es horrible»). Cuatro ranuras y nada más: cromo
// strip arriba, banda del SUJETO gobernando el centro, apoyos de alto FIJO
// debajo con cascada por prioridad, franja de acción abajo. Nada scrollea.
//
// LA DECISIÓN QUE ESTA PANTALLA TIENE QUE TOMAR — quién gobierna la banda.
//
// En `vivo-rondas` la cuenta se come el numeral cuando hay muchas rondas, y el
// criterio es «¿qué se le cae de la cabeza al atleta sudando?». Aplicado al
// hierro con honestidad, la respuesta es la CONTRARIA, y por dos razones que no
// son de gusto:
//
//  1. LAS SERIES NO SON IGUALES. El argumento que mueve la cuenta al numeral en
//     un metcon es que la ronda 12 repite literalmente la 11, así que el trabajo
//     no hace falta escribirlo doce veces. En fuerza eso es FALSO: la forma
//     dominante del corpus es la pirámide —6-6-4-4-3, 10-8-8-6-4— así que lo que
//     cambia de una serie a la siguiente es justo la dosis. Es el dato que se te
//     cae de la cabeza, y equivocarse cuesta una serie mal hecha, no un
//     despiste de navegación.
//  2. EN FUERZA EL TRABAJO *ES* UN NUMERAL. El trabajo de un metcon son cuatro
//     líneas de movimientos y no cabe en la cifra grande — de ahí que el numeral
//     quede libre para la cuenta. «10 × 82,5 kg» es exactamente la cifra para la
//     que se hizo el numeral del §10.2, con su presupuesto de ancho incluido.
//     Cederlo a un «2/4» para bajar la dosis al segundo peldaño sería gastar la
//     voz de instrumento en el dato fácil.
//
// Así que **el sujeto es la DOSIS DE ESTA SERIE, siempre**, y la cuenta vive
// donde no cuesta nada: en la etiqueta de encima («SERIE 2 DE 4») y en el riel.
// No es una excepción al criterio de rondas: es su MISMA rama —«con pocas rondas
// manda el trabajo y la cuenta baja al cromo»— y el hierro está siempre en ella.
//
// LO QUE SÍ COLAPSA AQUÍ es el riel, y su umbral se deriva igual (ver `modelo.ts`):
// no cabe a lo ancho desde la quinta serie, que es el 49 % del corpus.
//
// EL DESCANSO NO ES OTRA PANTALLA: es esta misma con el sujeto cambiado, que es
// exactamente lo que hace el motor (`restRemainingSeconds > 0`). Los apoyos no se
// reordenan al entrar ni al salir — eso es lo que compra el alto fijo.

import { useCallback, useMemo, useState } from 'react';
import { reloj } from '../../datos-reales';
import { Label, Mono } from '../../kit';
import {
  Ambiente,
  Apoyo,
  ContextoFormato,
  CromoFormato,
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
import { NombreEjercicio, Pie } from './atoms';
import { Barra } from './barra';
import { Riel } from './riel';
import {
  CON_RELOJ,
  SIM_X,
  UMBRAL_VENTANA,
  cargaTexto,
  cascada,
  cifraDeSerie,
  intensidadDe,
  pastillaIntensidad,
  pulsoEnDescanso,
  pulsoLevantando,
  serieEnLinea,
  type Ejercicio,
  type SerieHecha,
} from './modelo';

/** El rótulo del formato en el cromo. Es lo que esta familia ES. */
const FORMATO = 'FUERZA';

/**
 * Por dónde entra cada escenario. Es el mismo instante del mismo ejercicio
 * mirado en tres momentos, no tres maquetas: la máquina de abajo lleva de uno al
 * siguiente, así que lo que se juzga son las TRANSICIONES.
 */
export interface Entrada {
  /** Series ya cerradas al abrir la escena, con lo que se registró en cada una. */
  cerradas: Record<number, SerieHecha>;
  /** Hace cuánto se cerró la última, en segundos de entreno. */
  haceS: number;
  /** El crono del bloque al abrir la escena. */
  aperturaS: number;
}

export function Propuesta({
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
  const { t, pausado, alternarPausa } = useCronoComprimido(SIM_X);
  const [hechas, setHechas] = useState<Record<number, SerieHecha>>(() => ({ ...entrada.cerradas }));
  /**
   * El instante en que se cerró la última serie, y el descanso que traía. UN solo
   * estado para las dos cosas que se preguntan entre series —cuánto llevas parado
   * y cuánto te queda de descanso— porque son el MISMO instante mirado al revés.
   * Todo lo que se pinta deriva del mismo segundo simulado, así que ninguna cifra
   * puede contradecir a otra.
   */
  const [ultima, setUltima] = useState<{ enT: number; descansoS: number | null } | null>(() => {
    const cuantas = Object.keys(entrada.cerradas).length;
    if (cuantas === 0) return null;
    return { enT: -entrada.haceS, descansoS: ejercicio.series[cuantas - 1]?.descansoS ?? null };
  });

  // La serie que toca: la primera sin cerrar. Ninguna = el ejercicio está hecho.
  const activa = useMemo(() => {
    for (let i = 0; i < total; i++) if (!hechas[i]) return i;
    return null;
  }, [hechas, total]);

  const pausaS = ultima ? Math.max(0, t - ultima.enT) : null;
  const restanteS = ultima?.descansoS != null ? Math.max(0, ultima.descansoS - (pausaS ?? 0)) : 0;
  const descansando = restanteS > 0 && activa != null;
  const vivoS = entrada.aperturaS + t;

  // Levantando el pulso está arriba; en cuanto sueltas la barra, cae — y lo que
  // lleva cayendo es la pausa, que ya está contada. Sin reloj no hay pulso, y sin
  // pulso no hay zona ni tinte (§7).
  const ppm = !CON_RELOJ ? null : pausaS != null ? pulsoEnDescanso(pausaS) : pulsoLevantando();
  const zona = zonaDe(ppm);

  const cerrarSerie = useCallback(() => {
    if (activa == null) return;
    const s = ejercicio.series[activa];
    setHechas((previas) => ({
      ...previas,
      // Lo prescrito se confirma tal cual: cerrar una serie cuesta UN toque y
      // ajustar es la excepción, que vive tocando el peldaño (§7). El RIR
      // sentido no se copia del coach — se pregunta, y aquí no se ha preguntado.
      [activa]: {
        reps: s.medida?.reps ?? null,
        carga: s.carga,
        rirSentido: null,
        estado: 'hecha',
      },
    }));
    setUltima({ enT: t, descansoS: s.descansoS });
    onLog(
      s.descansoS != null
        ? `Serie ${activa + 1} cerrada · ${serieEnLinea(s) ?? 'sin dosis escrita'} · descanso ${reloj(s.descansoS)}`
        : `Serie ${activa + 1} cerrada · ${serieEnLinea(s) ?? 'sin dosis escrita'}`
    );
  }, [activa, ejercicio.series, t, onLog]);

  const saltarDescanso = useCallback(() => {
    onLog(`Descanso saltado con ${reloj(restanteS)} por delante`);
    // Saltar es adelantar el reloj, no borrar el descanso: la pausa real sigue
    // siendo la que fue, y es lo que la app apunta.
    setUltima((u) => (u ? { ...u, descansoS: null } : u));
  }, [restanteS, onLog]);

  // ---------------------------------------------------------------------------
  // Los apoyos — cascada por prioridad sobre los 213 pt que deja el marco
  // ---------------------------------------------------------------------------

  const serie = activa != null ? ejercicio.series[activa] : undefined;
  const cargaKg = serie?.carga?.tipo === 'kg' ? serie.carga.kg : null;
  const quiereBarra = cargaKg != null && ejercicio.implemento === 'barra';
  const plan = cascada({
    ventana: total >= UMBRAL_VENTANA,
    barra: quiereBarra,
    siguiente: ejercicio.siguiente != null,
  });

  const descansoPrescrito = serie?.descansoS ?? null;

  const apoyos = (
    <>
      {plan.riel && (
        <Riel
          ejercicio={ejercicio}
          activa={activa ?? total - 1}
          hechas={hechas}
          onAjustar={(i) =>
            onLog(`Abre el ajuste de la serie ${i + 1} — reps, kilos, RPE y RIR, en su hoja`)
          }
        />
      )}
      {plan.fila && (
        <FilaApoyos>
          <Apoyo
            etiqueta="Pulso"
            valor={ppm != null ? String(ppm) : null}
            ausente="sin reloj"
            tono={colorZona(zona)}
            pie="ppm"
          />
          {/* LA PAUSA, no una «vuelta»: lo que se pregunta entre series es cuánto
              llevas parado, y sigue contando cuando el descanso prescrito ya se
              agotó — que es justo cuando dejas de saberlo. */}
          <Apoyo
            etiqueta="Pausa"
            valor={pausaS != null ? reloj(pausaS) : null}
            ausente="aún no"
            pie="desde la última"
          />
          {descansoPrescrito != null && (
            <Apoyo etiqueta="Descanso" valor={reloj(descansoPrescrito)} pie="lo que pide el plan" />
          )}
        </FilaApoyos>
      )}
      {plan.barra && cargaKg != null && <Barra totalKg={cargaKg} />}
      {plan.siguiente && ejercicio.siguiente && (
        <Pie>
          <Label size={9}>y luego</Label>
          <span style={{ flex: 1 }} />
          <Mono size={13} weight={700}>
            {ejercicio.siguiente}
          </Mono>
        </Pie>
      )}
    </>
  );

  // ---------------------------------------------------------------------------
  // El sujeto — las tres caras del hierro
  // ---------------------------------------------------------------------------

  const sujeto = (() => {
    if (activa == null) {
      // El ejercicio cerrado no puede dejar la pantalla colgada: el sujeto pasa a
      // ser el nombre, y el riel de abajo es el resumen de lo que hiciste.
      return (
        <>
          <EtiquetaSujeto>Ejercicio hecho</EtiquetaSujeto>
          <span className="t-display">{ejercicio.nombre}</span>
        </>
      );
    }

    if (descansando) {
      const siguiente = [`serie ${activa + 1} de ${total}`, serieEnLinea(ejercicio.series[activa])]
        .filter(Boolean)
        .join(' · ');
      return (
        <>
          {/* En tinta normal, no en azul. El Swift de hoy pinta la cuenta atrás del
              descanso en `info`, y el §10.2 dice lo contrario: el único sujeto que
              se pinta de un color es el PULSO, del color de su zona; los demás
              dejan el color al ambiente, que ya se ha teñido de calma porque el
              pulso ha bajado. Que estás descansando lo dicen la etiqueta, la forma
              de reloj de la cifra, la barra drenando y la acción en contorno —
              cuatro señales sin gastar el presupuesto de color de la app. */}
          <EtiquetaSujeto>Descanso</EtiquetaSujeto>
          <Numeral>{reloj(restanteS)}</Numeral>
          {/* Lo que viene, dicho una vez. El pulso NO sube aquí aunque sea lo que
              de verdad estás haciendo: vive en la fila de apoyos, que no
              desaparece, y repetirlo en la banda sería escribir el mismo número
              dos veces por cambiar de cara. */}
          <span style={{ font: '600 15px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {`Luego · ${siguiente}`}
          </span>
        </>
      );
    }

    const cifra = cifraDeSerie(serie);
    const pastilla = pastillaIntensidad(intensidadDe(ejercicio, activa));
    const corporal = serie?.carga?.tipo === 'corporal';
    const sinCarga = serie?.carga == null;

    return (
      <>
        <EtiquetaSujeto>{`Serie ${activa + 1} de ${total}`}</EtiquetaSujeto>
        {cifra ? (
          <>
            <Numeral unidad={cifra.unidad ?? undefined}>{cifra.cifra}</Numeral>
            {cifra.segundo && (
              <Numeral escala="segundo" unidad={cifra.segundo.unidad}>
                {cifra.segundo.cifra}
              </Numeral>
            )}
          </>
        ) : (
          // Sin medida y sin carga no hay cifra que inventar: manda el nombre y no
          // se finge un cero (§7).
          <span className="t-display">{ejercicio.nombre}</span>
        )}
        {cifra && <NombreEjercicio>{ejercicio.nombre}</NombreEjercicio>}
        {corporal && (
          <span style={{ font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {cargaTexto(serie!.carga)}
          </span>
        )}
        {/* El hueco declarado: un fondo LASTRADO sin lastre escrito no se rellena
            con un cero ni se calla del todo — se dice, porque el atleta tiene que
            saber que la decisión es suya. */}
        {sinCarga && (
          <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            el plan no dice con cuánto
          </span>
        )}
        {pastilla && <span className="tw-pill">{pastilla}</span>}
      </>
    );
  })();

  // ---------------------------------------------------------------------------
  // La acción — una sola, y hace lo que dice
  // ---------------------------------------------------------------------------

  const accion = (() => {
    if (activa == null) {
      return (
        <FranjaAccion
          titulo="CERRAR EL EJERCICIO"
          unicaSalida
          nota="todas las series cerradas"
          onClick={() => onLog('Ejercicio cerrado')}
        />
      );
    }
    if (descansando) {
      // Saltar NO es la única salida: el reloj cierra el descanso solo, así que va
      // de contorno y el naranja se guarda para cuando el toque es lo único que
      // puede pasar la serie de prescrita a hecha (§10.5).
      return (
        <FranjaAccion
          titulo="SALTAR EL DESCANSO"
          // Sin repetir lo que queda: eso lo dice el numeral, y la barra de arriba
          // dice cuánto llevas. La nota dice lo único que no está escrito — que
          // saltarlo tiene un precio.
          nota="el descanso también es dosis"
          onClick={saltarDescanso}
        />
      );
    }
    return <FranjaAccion titulo={`SERIE ${activa + 1} HECHA`} unicaSalida onClick={cerrarSerie} />;
  })();

  return (
    <>
      <Ambiente zona={zona} appearance={appearance} />
      <MarcoVivo
        cromo={
          <CromoFormato
            formato={FORMATO}
            // El bloque como lo nombró el coach y dónde vas EN LA SESIÓN: lo único
            // de la pantalla que no está escrito en otro sitio. La cuenta de series
            // la dice la etiqueta del sujeto y el ejercicio está bajo el numeral.
            //
            // Y dice «ejercicio», que no es relleno: al lado de un «SERIE 3 DE 5»
            // un «· 1 de 4» a secas se lee como otra cuenta de series.
            posicion={`${ejercicio.bloque} · ejercicio ${ejercicio.posicion.i} de ${ejercicio.posicion.de}`}
            pausado={pausado}
            onPausa={alternarPausa}
          />
        }
        contexto={
          <ContextoFormato
            scoreS={vivoS}
            // El descanso drena en el sitio donde drena el tope de un metcon: la
            // franja que no desaparece jamás. Sin cifra —la dice el numeral— y solo
            // mientras corre; lo que aporta es la FORMA, cuánto de lo prescrito
            // llevas, que el número no dice.
            cap={
              descansando && ultima?.descansoS != null
                ? { totalS: ultima.descansoS, restanteS, urgente: false, pie: null }
                : undefined
            }
          />
        }
        sujeto={sujeto}
        apoyos={apoyos}
        accion={accion}
      />
    </>
  );
}

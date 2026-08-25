'use client';

// LA PROPUESTA — la lista mientras quepa, el contador cuando no.
//
// Y el umbral no es una preferencia: los apoyos del marco son 213 pt (§10.3), y
// una fila de una línea mide 35, así que caben CINCO rondas. La sexta no cabe.
// De ahí sale todo lo demás.
//
// Las dos caras comparten cromo, franja, banda del sujeto y acción — o sea, el
// sujeto cae a la misma altura y la pantalla se reconoce igual. Lo único que
// cambia es qué vive en la banda y qué vive en los apoyos:
//
//   ≤ 5 rondas   banda: el trabajo        apoyos: la lista de rondas
//   ≥ 6 rondas   banda: la cuenta         apoyos: el hilo, las lecturas y
//                       + el trabajo              dónde acabas
//
// El sobrante que libera el colapso NO se queda en un hueco: entra en los
// apoyos, que es lo que el §10.3 manda («primero crecen los apoyos»). Por eso
// el contador enseña MÁS que la lista, no menos.

import type { TwinAppearance } from '../../types';
import { reloj } from '../../datos-reales';
import {
  Apoyo,
  ContextoFormato,
  CromoFormato,
  EtiquetaSujeto,
  FilaApoyos,
  FranjaAccion,
  MarcoVivo,
  colorZona,
  zonaDe,
  type CapEstado,
} from '../../kit-vivo';
import { HiloDeRondas, SujetoContador } from './contador';
import { Lienzo } from './lienzo';
import { ListaClasica } from './lista';
import {
  fcEn,
  lineaDe,
  mediaS,
  proyeccionS,
  soloTuLaCierras,
  toca,
  type Metcon,
} from './data';

/**
 * Una línea de lectura bajo los apoyos. Es una FRASE, no una cifra, así que no
 * va monoespaciada: monoespaciar lo que no se mide lo disfraza de medida (§4).
 */
function Nota({ children, tono = 'muted' }: { children: React.ReactNode; tono?: 'muted' | 'accent' }) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        textAlign: 'center',
        font: '500 12px/1.35 var(--twin-font-sans)',
        color: tono === 'accent' ? 'var(--twin-accent-text)' : 'var(--twin-muted)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Con pocas rondas el sujeto es EL TRABAJO, y la cuenta baja al cromo.
 *
 * Es la otra mitad de la tesis: cuando son cuatro rondas nunca pierdes la
 * cuenta, así que gobernar la pantalla con un «1/4» sería gastar el sitio bueno
 * en el dato fácil. Lo que sí necesitas delante es qué toca hacer.
 */
function SujetoTrabajo({ metcon, activa }: { metcon: Metcon; activa: number }) {
  return (
    <>
      <EtiquetaSujeto>{`Ronda ${activa + 1} de ${metcon.rondas}`}</EtiquetaSujeto>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {metcon.ronda.map((mov) => (
          <span
            key={mov.nombre}
            style={{
              font: 'italic 800 25px/1.15 var(--twin-font-sans)',
              letterSpacing: '-0.015em',
              color: 'var(--twin-fg)',
              textAlign: 'center',
            }}
          >
            {lineaDe(mov)}
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Dónde acabas y si te estás cayendo. Las dos salen SOLO de rondas cerradas: la
 * que está en vuelo no cuenta porque nadie sabe por dónde vas dentro de ella, y
 * con una sola cerrada no se dice nada, que un punto no es un ritmo.
 */
function Lecturas({ metcon, cerradas }: { metcon: Metcon; cerradas: readonly number[] }) {
  const media = mediaS(cerradas);
  const proyeccion = proyeccionS(metcon, cerradas);
  if (media == null || proyeccion == null) return null;

  const seComeElTope = metcon.capS != null && proyeccion > metcon.capS;
  const ultima = cerradas[cerradas.length - 1];
  const delta = ultima - media;
  // Menos de tres segundos sobre la media no es caerse, es ruido de cronómetro.
  const cae = Math.abs(delta) >= 3;

  return (
    <Nota tono={seComeElTope ? 'accent' : 'muted'}>
      {seComeElTope
        ? 'Al ritmo de lo que llevas, te comes el tope.'
        : `Al ritmo de lo que llevas, acabas sobre ${reloj(proyeccion)}.`}
      {cae && (
        <>
          {' '}
          {delta > 0
            ? `La última te costó ${Math.round(delta)} s más que tu media.`
            : `La última te costó ${Math.round(-delta)} s menos que tu media.`}
        </>
      )}
    </Nota>
  );
}

export function Propuesta({
  metcon,
  vivoS,
  activa,
  cerradas,
  parcialS,
  pausado,
  onPausa,
  onAvanzar,
  onDeshacer,
  cap,
  appearance,
}: {
  metcon: Metcon;
  vivoS: number;
  activa: number;
  cerradas: readonly number[];
  parcialS: number;
  pausado: boolean;
  onPausa: () => void;
  onAvanzar: () => void;
  onDeshacer: () => void;
  cap?: CapEstado;
  appearance: TwinAppearance;
}) {
  const pulso = fcEn(parcialS);
  const zona = zonaDe(pulso);
  const contador = toca(metcon) === 'contador';
  const media = mediaS(cerradas);

  const apoyos = contador ? (
    <>
      <HiloDeRondas metcon={metcon} activa={activa} cerradas={cerradas} />
      <FilaApoyos>
        <Apoyo etiqueta="Esta ronda" valor={reloj(parcialS)} />
        {/* La MEDIA, no el parcial de la última: ese ya lo dice la ronda tachada
            de la banda, y escribir el mismo número dos veces en la misma
            pantalla es como empiezan las tres grafías del ritmo (§2). La media
            es además el referente contra el que compara la línea de abajo. */}
        {media != null && <Apoyo etiqueta="Tu media" valor={reloj(Math.round(media))} pie="por ronda" />}
        <Apoyo etiqueta="Pulso" valor={String(pulso)} tono={colorZona(zona)} pie="ppm" />
      </FilaApoyos>
      <Lecturas metcon={metcon} cerradas={cerradas} />
    </>
  ) : (
    <ListaClasica metcon={metcon} activa={activa} cerradas={cerradas} parcialVivoS={parcialS} />
  );

  return (
    <Lienzo zona={zona} appearance={appearance}>
      <MarcoVivo
        cromo={
          <CromoFormato
            formato={metcon.formato}
            // Con el contador la cuenta ya gobierna la banda, así que repetirla
            // en el cromo sería escribir el mismo número dos veces: ahí el
            // cromo dice el bloque, que es lo que no está en ningún otro sitio.
            posicion={contador ? metcon.titulo : `Ronda ${activa + 1} de ${metcon.rondas}`}
            pausado={pausado}
            onPausa={onPausa}
            onDeshacer={onDeshacer}
            puedeDeshacer={cerradas.length > 0}
          />
        }
        contexto={<ContextoFormato scoreS={vivoS} cap={cap} />}
        sujeto={
          contador ? (
            <SujetoContador metcon={metcon} activa={activa} cerradas={cerradas} onDeshacer={onDeshacer} />
          ) : (
            <SujetoTrabajo metcon={metcon} activa={activa} />
          )
        }
        apoyos={apoyos}
        accion={
          <FranjaAccion
            titulo={activa + 1 === metcon.rondas ? 'ÚLTIMA HECHA' : 'RONDA HECHA'}
            // El relleno naranja se gana solo cuando tu toque es la ÚNICA
            // salida. En el metcon del trineo la ronda la cierra el reloj a los
            // 45 s, así que va de contorno: el color dice quién gobierna la
            // transición, no cuánto grita el botón (§10.5).
            unicaSalida={soloTuLaCierras(metcon)}
            nota={soloTuLaCierras(metcon) ? undefined : 'o espera a que salte'}
            onClick={onAvanzar}
          />
        }
      />
    </Lienzo>
  );
}

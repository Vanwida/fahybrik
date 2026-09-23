// GUÍA · Prescrito contra hecho, tramo a tramo — en un entreno ya hecho (el
// panel del entreno en el calendario de la ficha: «Tramos en banda» N % · x de y,
// prescrito vs hecho por ejercicio, «sin registro»; «Ver la carrera» para la
// curva), el veredicto por tramo sale de shared/domain/adherence/run-compliance.ts
// (dentro / más rápido / más lento / sin dato; fuera de banda = ámbar, no fallo;
// bordes inclusivos; la MISMA banda que resolvió la prescripción del atleta).

import { DocSection, QCWTriad, DocNote } from '../doc';
import type { GuiaSection } from '../config';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Prescribir un ritmo por tramo solo sirve si luego puedes leer si se cumplió. En un entreno ya
          hecho, cada tramo de carrera aparece <b>prescrito contra hecho</b> con un{' '}
          <b>veredicto</b> (en banda, más rápido, más lento) y arriba, el <b>% del entreno</b> que
          cayó donde tocaba. Todo con la <b>misma banda</b> que vio tu atleta al correr.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            En un entreno ya hecho, cada tramo de carrera lleva su veredicto:{' '}
            <b>En banda</b>, <b>Más rápido</b>, <b>Más lento</b> o <b>Sin dato</b>, y una cabecera con{' '}
            el <b>porcentaje</b> de tramos que cayeron en banda.
          </>
        }
        como={
          <>
            No configuras nada: en la ficha del atleta, pulsas un entreno ya hecho en su calendario y
            ahí está. Cada tramo enseña lo <b>prescrito</b> junto a lo que <b>hizo de verdad</b>, y el
            veredicto sale de comparar los dos.
          </>
        }
        porque={
          <>
            Porque «lo hizo» no es lo mismo que «lo hizo como tocaba». Ver el ritmo real tramo a tramo
            te dice si <b>ajustar la banda</b>, si tu atleta <b>fue sobrado</b> o si <b>se pasó de
            frenada</b>, con datos, no con sensaciones.
          </>
        }
      />

      <h3>El veredicto de cada tramo</h3>
      <p>
        Cada tramo con objetivo se juzga contra su banda: <b>En banda</b> (verde) si cayó dentro,{' '}
        <b>Más rápido</b> o <b>Más lento</b> (ámbar) si se salió por arriba o por abajo, y{' '}
        <b>Sin dato</b> cuando no hay con qué comparar (un tramo libre, o uno del que no llegó el
        ritmo). Los bordes de la banda <b>cuentan como dentro</b>: justo en el límite es En banda, no
        fuera.
      </p>

      <DocNote variant="cue" title="El ámbar es una señal, no un suspenso">
        <p>
          Salirse de la banda (por rápido o por lento) se pinta en <b>ámbar</b>, nunca en rojo: es{' '}
          <b>información para ti</b>, no una falta del atleta. A veces significa que tu banda iba corta
          y toca ampliarla; a veces, que el día pedía otra cosa. Tú decides qué hacer con la señal.
        </p>
      </DocNote>

      <h3>Arriba: cuánto cayó en banda</h3>
      <p>
        Arriba del entreno, junto a la duración y el esfuerzo, <b>Tramos en banda</b> resume la
        carrera entera: el porcentaje de tramos evaluables que cayeron en banda y cuántos son («5 de
        6»). Si el entreno no trae ritmo suficiente para juzgarlo, ese número no aparece: no se
        inventa. Si la carrera tiene traza, <b>Ver la carrera</b> abre la curva y el detalle tramo a
        tramo.
      </p>

      <h3>Los tramos sin registro no desaparecen</h3>
      <p>
        Si tu atleta no dejó datos de un tramo, el tramo <b>sigue ahí</b>: ves lo que estaba
        prescrito con un <b>«sin registro»</b> atenuado, nunca un número inventado para cuadrar. El
        hueco visible es más honesto que un dato de relleno, y te dice exactamente dónde falta
        captura.
      </p>

      <DocNote variant="log" title="La misma banda que vio tu atleta">
        <p>
          El veredicto no usa una vara distinta a la del atleta: es <b>la misma banda</b> que su app
          resolvió a partir de tu prescripción cuando corrió. Lo que él vio en vivo y lo que tú lees
          después <b>coinciden</b>: no hay dos criterios.
        </p>
      </DocNote>

      <p style={{ marginTop: '18px' }}>
        Así se cierra el círculo de la carrera: la <b>prescribes</b> tramo a tramo, tu atleta la{' '}
        <b>corre</b>, y aquí la <b>lees</b> con el mismo rasero. Sin frases sueltas, sin números
        inventados: solo lo prescrito contra lo hecho, y qué hacer con la diferencia.
      </p>
    </DocSection>
  );
}

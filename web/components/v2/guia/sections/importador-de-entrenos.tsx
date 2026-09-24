// GUÍA · Importar entrenos de tu Excel — Programar › Programas › ··· › Importar…:
// Excel (rango en lenguaje natural + variante), texto pegado, foto o IA → una
// revisión tipada día a día (tipado / revisar / sin cantidad / ejercicio?) y tú
// eliges qué entra. Solo del coach: sin cara en el móvil del atleta.


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
          Rellena un programa desde tu Excel <b>sin perder el control</b>: tú marcas el rango, la
          IA lo <b>tipa</b>, tú revisas lo dudoso. No subes el Excel y «aparece» el plan: el resto
          del archivo <b>ni se toca</b>. Es tu atajo para pasar tu hoja de cálculo a plan, con tu
          mano siempre encima.
        </>
      }
    >

      <QCWTriad
        que={
          <>
            Una <b>mano de extracción tipada</b>. Subes tu Excel, señalas un <b>rango</b> y la IA
            convierte esas filas en <b>sesiones tipadas</b> de tu programa. El resto del Excel se
            ignora: no reconstruye nada por su cuenta.
          </>
        }
        como={
          <>
            Creas el programa vacío, en su <b>···</b> eliges <b>Importar…</b>, dices el rango en tu idioma
            (<em className="em">«de la semana 1 a la 4»</em>) y la <b>variante</b>. La IA lo tipa; tú
            revisas lo dudoso, <b>eliges qué días entran</b> y confirmas.
          </>
        }
        porque={
          <>
            Porque <b>tú posees la periodización</b>. Te ahorra el tecleo manual sin cederte el
            mando: nada entra sin pasar por tu revisión y por el <b>gate tipado</b>. Rápido, pero sin
            dejar de ser tu plan.
          </>
        }
      />

      <h3>Tú marcas el rango</h3>
      <p>
        La periodización la montas tú: creas el programa con sus <b>semanas vacías</b> en{' '}
        <b>Programar › Programas</b>, lo abres y en su <b>···</b> eliges <b>Importar…</b>. Hay cuatro
        puertas: <b>Subir Excel</b>, <b>Pegar texto</b> (el entreno de un día), <b>Subir foto</b> y{' '}
        <b>Generar con IA</b>. Con el Excel, <b>señalas el rango en tus palabras</b>{' '}
        (<em className="em">«de la semana 1 a la 4»</em>) y la <b>variante de la hoja</b> (
        <code>Estándar</code> / <code>Foco fuerza</code> / <code>Foco resistencia</code>). Se lee{' '}
        <b>solo ese rango</b>; el resto de la hoja queda fuera.
      </p>

      <DocNote variant="cue" title="Tú posees la periodización">
        <p>
          La IA <b>solo extrae</b> el rango que tú señalas: no interpreta el resto del Excel ni
          «adivina» el plan. Tú decides qué semanas entran y con qué variante; ella hace el trabajo
          sucio de tipar esas filas, nada más.
        </p>
      </DocNote>

      <h3>Se tipa, tú revisas</h3>
      <p>
        Los <b>números</b> los saca una <b>gramática determinista</b> primero: los mismos patrones de
        tu notación (<code>10/10/8/8/6</code>, <code>60–75% RM</code>, <code>5×3&apos;</code>,{' '}
        <code>z2</code>, <code>c/2&apos;30&quot;</code>) con reglas exactas, no un modelo (un patrón no se
        inventa una cifra). La IA solo entra a apoyar en lo <b>denso o ambiguo</b> (un WOD, una
        simulación HYROX). El resultado es una <b>rejilla de la semana</b> con un estado por día:{' '}
        <b>tipado</b> (se guarda tal cual), <b>revisar</b> (propuesto, míralo), <b>sin cantidad</b>{' '}
        o <b>ejercicio?</b> (fuera de tu catálogo: elígelo o créalo). Cada día se abre con el mismo
        compositor que usas al montar un programa, ya relleno: lo que está bien se guarda y lo dudoso
        lo tocas ahí mismo. Y eliges en qué semana del programa entra cada semana importada.
      </p>

      <DocNote variant="bad" title="Nada entra sin pasar el gate">
        <ul>
          <li>
            La revisión marca cada día por su estado y <b>cero texto libre</b>: lo que la IA no
            tipe con confianza queda <b>para tu mano</b> (nunca se cuela en silencio).
          </li>
          <li>
            Al confirmar, <b>cada línea</b> pasa el mismo esquema tipado que valida cualquier entreno
            que guardas a mano (<code>.strict</code>). Si algo no es un ejercicio real de tu catálogo,
            no se guarda: lo resuelves antes <b>o dejas ese día fuera</b>.
          </li>
        </ul>
      </DocNote>

      <h3>Tú eliges qué entra</h3>
      <p>
        No es todo o nada: cada día de la rejilla tiene un control para <b>dejarlo fuera</b>, y en
        la cabecera de cada semana puedes quitar <b>la semana entera</b> de una vez. Lo que dejas
        fuera se ve en gris y tachado (<b>«no entra»</b>) y no se guarda nada de ese día: ni el
        entreno ni lo que el importador hubiera aprendido de él. El botón te dice siempre lo que va
        a pasar (<b>«Confirmar 5 días»</b>) y te avisa de cuántos se quedan fuera.
      </p>

      <DocNote variant="cue" title="Un día dudoso no bloquea el resto">
        <p>
          Si un día trae algo raro que no quieres resolver ahora, <b>déjalo fuera y confirma el
          resto</b>: un ejercicio sin catálogo nunca te secuestra los demás días. Y una semana que
          dejas fuera <b>tampoco te pide destino</b>: se salta entera.
        </p>
      </DocNote>

      <h3>Aprende tu notación</h3>
      <p>
        Cuando resuelves un ejercicio fuera de catálogo, esa decisión se <b>guarda en tu mapa de
        sinónimos</b> (por entrenador): el próximo import que traiga la misma abreviatura lo{' '}
        <b>resuelve solo</b>. El importador se afina con tu forma de escribir: cuanto más lo usas,
        menos ejercicios dudosos verás. Y es <b>idempotente</b>: re-importar el mismo rango al mismo programa{' '}
        <b>reemplaza</b> esos días (te lo pregunta antes), nunca los duplica.
      </p>

      <DocNote variant="log" title="Aprende tu notación">
        <p>
          Tu mapa de sinónimos es <b>tuyo, no global</b>: cada abreviatura que resuelves queda ligada
          a tu cuenta. La próxima vez que aparezca en un Excel, el importador la reconoce sin que
          tengas que volver a elegir.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Reemplaza, no duplica">
        <p>
          Si vuelves a importar el mismo rango sobre el mismo programa, el importador{' '}
          <b>sustituye</b> esos días en lugar de añadir copias, con una confirmación previa, para que
          no pierdas nada sin querer.
        </p>
      </DocNote>

      <p style={{ marginTop: '18px' }}>
        Esta herramienta es solo tuya: <b>no tiene cara en el móvil del atleta</b>. Es el puente entre
        tu Excel y tu programa: te quita el tecleo, pero el plan sigue siendo tuyo, línea a línea.
      </p>
    </DocSection>
  );
}

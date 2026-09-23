// GUÍA · 30 Importar entrenos del Excel — área "Herramientas". Una mano de
// extracción TIPADA: el coach crea el programa vacío, señala un rango del Excel
// en lenguaje natural + la variante, y la IA convierte SOLO esas filas en sesiones
// tipadas — el resto del Excel se ignora. Revisión verde/ámbar/rojo (= el editor de
// día pre-poblado) y gate tipado (.strict) al confirmar. Herramienta SOLO del coach:
// no tiene cara en el móvil del atleta (como Métricas del funnel) → sin MovilBand.

import { DocSection, QCWTriad, DocFlow, DocNote } from '../doc';
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
      <DocFlow
        steps={[
          { label: 'Creas el programa con sus semanas vacías' },
          { label: '＋ Importar del Excel: subes el .xlsx y señalas rango + variante' },
          { label: 'La IA lee SOLO ese rango y lo tipa → revisión verde/ámbar/rojo' },
          { label: 'Eliges qué entra: dejas fuera el día o la semana que no quieras' },
          { label: 'Confirmas los días elegidos y entran en el programa' },
        ]}
      />

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
            Creas el programa vacío, pulsas <b>Importar del Excel</b>, dices el rango en tu idioma
            (<em className="em">«de la semana 1 a la 4»</em>) y la <b>variante</b>. La IA lo tipa; tú
            revisas lo <b>verde/ámbar/rojo</b>, <b>eliges qué días entran</b> y confirmas.
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

      <h3>1 · Tú marcas el rango</h3>
      <p>
        La periodización la montas tú: creas el programa con sus <b>semanas vacías</b> bajo un
        nivel, y ya dentro de <code>programar/programas/[id]</code> pulsas <code>＋ Importar del Excel</code>.
        Subes el <code>.xlsx</code> y <b>señalas el rango en lenguaje natural</b>{' '}
        (<em className="em">«de la semana 1 a la 4»</em>) más la <b>variante</b> del bloque (
        <code>Estándar</code> / <code>Fuerza</code> / <code>Resistencia</code>). La IA lee{' '}
        <b>solo ese rango</b>; todo lo demás de la hoja queda fuera.
      </p>

      <DocNote variant="cue" title="Tú posees la periodización">
        <p>
          La IA <b>solo extrae</b> el rango que tú señalas: no interpreta el resto del Excel ni
          «adivina» el plan. Tú decides qué semanas entran y con qué variante; ella hace el trabajo
          sucio de tipar esas filas, nada más.
        </p>
      </DocNote>

      <h3>2 · La IA lo tipa, tú revisas</h3>
      <p>
        Los <b>números</b> los saca una <b>gramática determinista</b> primero: los mismos patrones de
        tu notación (<code>10/10/8/8/6</code>, <code>60–75% RM</code>, <code>5×3&apos;</code>,{' '}
        <code>z2</code>, <code>c/2&apos;30&quot;</code>) con reglas exactas, no un modelo (un patrón no se
        inventa una cifra). La IA solo entra a apoyar en lo <b>denso o ambiguo</b> (un WOD, una
        simulación HYROX). El resultado es una <b>rejilla de la semana</b> con un estado por día:{' '}
        <b>verde = tipado</b> (se guarda tal cual), <b>ámbar = revisar</b> (propuesto, míralo) y{' '}
        <b>rojo = ejercicio fuera de tu catálogo</b> (elígelo o créalo). Esa revisión{' '}
        <b>es tu editor de día de siempre</b> (el mismo de «Monta la semana», ya pre-poblado): los
        verdes se guardan, los ámbar/rojos los tocas ahí mismo.
      </p>

      <DocNote variant="bad" title="Nada entra sin pasar el gate">
        <ul>
          <li>
            La revisión es <b>verde / ámbar / rojo</b> y <b>cero texto libre</b>: lo que la IA no
            tipe con confianza queda <b>para tu mano</b> (nunca se cuela en silencio).
          </li>
          <li>
            Al confirmar, <b>cada línea</b> pasa el mismo esquema tipado que valida cualquier entreno
            que guardas a mano (<code>.strict</code>). Si algo no es un ejercicio real de tu catálogo,
            no se guarda: lo resuelves antes <b>o dejas ese día fuera</b>.
          </li>
        </ul>
      </DocNote>

      <h3>3 · Tú eliges qué entra</h3>
      <p>
        No es todo o nada: cada día de la rejilla tiene un control para <b>dejarlo fuera</b>, y en
        la cabecera de cada semana puedes quitar <b>la semana entera</b> de una vez. Lo que dejas
        fuera se ve en gris y tachado (<b>«no entra»</b>) y no se guarda nada de ese día: ni la
        sesión ni lo que el importador hubiera aprendido de ella. El botón te dice siempre lo que va
        a pasar (<b>«Confirmar 5 días»</b>) y te avisa de cuántos se quedan fuera.
      </p>

      <DocNote variant="cue" title="Un rojo no te bloquea el resto">
        <p>
          Si un día trae algo raro que no quieres resolver ahora, <b>déjalo fuera y confirma el
          resto</b>: un ejercicio sin catálogo nunca te secuestra los demás días. Y una semana que
          dejas fuera <b>tampoco te pide destino</b>: se salta entera.
        </p>
      </DocNote>

      <h3>4 · Aprende tu notación</h3>
      <p>
        Cuando resuelves un ejercicio fuera de catálogo, esa decisión se <b>guarda en tu mapa de
        sinónimos</b> (por entrenador): el próximo import que traiga la misma abreviatura lo{' '}
        <b>resuelve solo</b>. El importador se afina con tu forma de escribir: cuanto más lo usas,
        menos rojos verás. Y es <b>idempotente</b>: re-importar el mismo rango al mismo programa{' '}
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

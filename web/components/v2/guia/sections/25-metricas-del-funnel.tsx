// GUÍA · 25 Métricas del funnel — área "Tu negocio". De la visita al alta: dónde
// entra la gente y dónde se cae, con el % de conversión en cada salto, la tendencia
// semanal y el desglose por objetivo. Todo derivado de datos reales (leads,
// appointments, session_reports, invitaciones + un contador de visitas cookieless).
// Esta pieza NO tiene cara en el móvil del atleta: es una vista interna de negocio.

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
          Del formulario a entrenar contigo: cuánta gente llega a cada etapa y, lo importante,{' '}
          <b>dónde se cae</b>. Con el % de cada salto sabes qué arreglar: la web, el formulario o la
          oferta. Todo sale de <b>datos reales</b>, nada
          inventado.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            En <b>Negocio › Embudo</b>: las etapas (empiezan el formulario → lo terminan → reservan
            llamada → la hacen → reciben la invitación → ya entrenan) con su conversión, una <b>tendencia semanal</b> y el desglose <b>por objetivo</b> (a qué vienen
            tus atletas).
          </>
        }
        como={
          <>
            No rellenas nada: el embudo se construye solo siguiendo a cada lead por sus etapas. Eliges
            el <b>rango</b> (7 días, 30 días o todo) y lees dónde está la fuga.
          </>
        }
        porque={
          <>
            Porque con un número global («12 nuevos atletas») no sabes qué mejorar. Ver <b>dónde</b> se pierde
            la gente te dice si el problema es tráfico, formulario o cierre, y por dónde empezar.
          </>
        }
      />

      <h3>1 · El embudo, salto a salto</h3>
      <p>
        Cada escalón es una condición sobre el lead: ¿dejó su correo?, ¿reservó llamada?, ¿canjeó la invitación?
        El % que ves es la <b>conversión desde la etapa anterior</b>. Un salto que se desploma es tu
        siguiente palanca, mucho más útil que el total del final.
      </p>

      <h3>2 · Visitas sin cookies ni rastreo</h3>
      <p>
        Si tu club tiene página pública conectada, el primer escalón (las <b>visitas</b>) se cuenta en
        el servidor, <b>sin cookies ni PII</b>:
        nunca se guarda la IP, solo un hash con una sal que <b>cambia cada día</b> (así no se puede
        rastrear a nadie entre días), agregado a una tabla diaria. Cumple RGPD sin banner. Sin página
        pública, el embudo empieza en el formulario y te lo dice.
      </p>

      <DocNote variant="log" title="Nuevo atleta solo cuando entra de verdad">
        <p>
          Un lead cuenta como <b>nuevo atleta</b> únicamente cuando <b>canjea su invitación</b> y entra en
          la app, no cuando se la envías. Así el número del final es real, no optimista: mide gente
          dentro, no correos enviados.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Las cohortes recientes aún maduran">
        <p>
          Un lead de ayer no ha tenido tiempo de reservar ni de empezar, por eso el último tramo del
          embudo se llena con los días.
        </p>
      </DocNote>

      <p style={{ marginTop: '18px' }}>
        Esta pieza es solo tuya: <b>no tiene cara en el móvil del atleta</b>. Es la vista de negocio
        que te dice, sin adornos, por dónde entra tu gente y por dónde se te escapa.
      </p>
    </DocSection>
  );
}

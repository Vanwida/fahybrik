// GUÍA · Qué es esta guía — la portada (/guia): cómo está ordenado el panel,
// los dos lados (panel y app del atleta) y el índice por áreas.

import { Link } from '@/i18n/navigation';
import { Principle, MovilBand } from '../doc';
import { GUIA_AREAS, guiaSectionsForArea, guiaHref } from '../config';

// The home doesn't need its config metadata — it renders a bespoke intro.
export default function Section() {
  return (
    <>
      <h1>Guía del entrenador</h1>
      <p className="guia-sub">Todo lo que haces en el panel, y cómo lo ve tu atleta en su móvil.</p>

      <p className="lead">
        El panel y la app de tu atleta son{' '}
        <em className="em">la misma cosa vista desde dos lados</em>. Tú montas el trabajo desde el
        ordenador; tu atleta lo recibe en el teléfono, día a día. Esta guía está organizada por{' '}
        <b>lo que tú quieres hacer</b>, no por menús ni botones, y en cada tema te enseñamos
        exactamente <b>cómo aparece en su móvil</b> lo que acabas de hacer.
      </p>

      <Principle>
        <p>La idea de toda la guía cabe en una frase:</p>
        <p>
          <b>Lo que tú escribes, tu atleta lo lee. Lo que tu atleta hace, tú lo ves de vuelta.</b>
        </p>
        <p>
          No hay “publicar y rezar”. Cada decisión tuya tiene un reflejo concreto en la pantalla de
          tu atleta, y cada entreno que hace (o no hace) vuelve a ti como adherencia y estado. Esta
          guía hace visible ese puente, tema a tema.
        </p>
      </Principle>

      <div className="seclbl">
        <span className="pin">●</span> El panel
      </div>
      <h2>Seis sitios, uno para cada trabajo</h2>
      <ul className="clean">
        <li>
          <b>Hoy</b>: quién te necesita. Una bandeja que tiende a cero; es la primera pantalla al entrar.
        </li>
        <li>
          <b>Atletas</b>: todos en una tabla, con su estado; seleccionas varios y actúas sobre todos.
        </li>
        <li>
          <b>Mensajes</b>: los chats, con los que están <b>por responder</b> primero.
        </li>
        <li>
          <b>Programar</b>: tus <b>programas</b> (semanas de entrenos), la biblioteca de entrenos,
          bloques y ejercicios, tus <b>grupos</b> y los tests.
        </li>
        <li>
          <b>Negocio</b> (si lo tienes contratado): leads, cobros y el embudo.
        </li>
        <li>
          <b>Ajustes</b>: tu perfil, tu club, tu método, qué ve el atleta de su plan, tu agenda y cupo,
          las notificaciones y tu cuenta.
        </li>
      </ul>
      <p>
        Arriba siempre tienes el buscador (<b>⌘K</b>: atletas, programas, grupos, tu biblioteca y
        cualquier pantalla), <b>+ Nuevo</b> (atleta, entreno, programa, grupo, comunicado o un
        mensaje) y <b>?</b>, que abre el artículo de la pantalla en la que estás. Mientras no
        termines de poner en marcha tu club, abajo en la barra lateral verás <b>Setup n/9</b> con lo
        que falta.
      </p>

      <div className="seclbl">
        <span className="pin">●</span> El puente · los dos lados
      </div>
      <h2>Dos lados, un mismo plan</h2>
      <p className="lead">
        Antes de entrar en cada tema, ten claro el reparto. No es “el panel” por un lado y “una app”
        por otro: es un único plan que vive en los dos sitios a la vez.
      </p>

      <div className="legend">
        <div className="lg coach">
          <span className="ico">Tú · en el panel</span>
          <div className="lt">Montas el trabajo</div>
          <p>
            Desde el ordenador construyes programas y se los das a tus atletas: los entrenos de cada
            día, los ejercicios y su carga. Es tu mesa de trabajo.
          </p>
        </div>
        <div className="lg ath">
          <span className="ico">Tu atleta · en el móvil</span>
          <div className="lt">Recibe y entrena</div>
          <p>
            En su teléfono ve su día, abre el entreno, entrena y marca cómo le fue. Solo ve las semanas visibles,
            limpio y sin jerga.
          </p>
        </div>
      </div>

      <p style={{ marginTop: '14px' }}>A lo largo de la guía verás este bloque en cada tema:</p>
      <MovilBand
        title="Así lo ve tu atleta"
        subtitle="Cada vez que aparezca esta banda, estás viendo una pantalla fiel de la app del atleta, para que sepas, sin abrir su teléfono, qué efecto tiene lo que acabas de hacer."
      />

      <div className="seclbl">
        <span className="pin">●</span> El índice
      </div>
      <h2>Lo que cubre la guía</h2>
      <p className="lead">
        Ordenada como el panel: empieza por tu día (Hoy, Atletas, Mensajes, la ficha de cada
        atleta), sigue por <b>Programar</b> y por cómo das el plan, y termina con el seguimiento, el
        ciclo de vida, los dobles, tu <b>negocio</b> y lo que tu atleta vive en su app. Empieza por
        donde quieras. Desde cualquier pantalla, <b>?</b> te trae al artículo de esa pantalla.
      </p>
      <div className="toc">
        {GUIA_AREAS.map((area) => {
          const sections = guiaSectionsForArea(area.id);
          const first = sections[0];
          return (
            <Link key={area.id} href={guiaHref(first.slug)}>
              <div className="n">{area.label}</div>
              <div className="t">{sections.map((s) => s.title).join(' · ')}</div>
              <div className="d">{first.blurb}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

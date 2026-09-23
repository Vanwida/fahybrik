// GUÍA · La ficha de un atleta — la página de un atleta como puesto de mando:
// cabecera con sus acciones, el estado con su motivo, «Hacer ahora», y tres
// pestañas (Plan · Rendimiento · Perfil). Plan = calendario editable en el sitio
// (Semana / 3 semanas / Plan completo, arrastrar, «+», el entreno en un panel) y
// la columna de su estado (readiness vs su base, check-in, lesión, carrera, nota,
// tus marcadores).

import { DocSection, DocNote, PanelFigure, Badge, Buttons, Segmented } from '../doc';
import type { GuiaSection } from '../config';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Pulsa un nombre en cualquier sitio del panel y llegas a su ficha. Arriba te dice{' '}
          <b>cómo está y por qué</b>, y qué harías ahora; debajo, su plan de las próximas semanas,
          editable ahí mismo. No hace falta ir a otra pantalla para mover un entreno o publicar su
          semana.
        </>
      }
    >
      <PanelFigure
        caption={
          <>
            El estado sale de las mismas señales que Hoy, con la prueba. <b>Hacer ahora</b> propone
            lo que toca, en una pulsación.
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 t-body-sm text-v2-muted">
          <Badge tone="ok" label="Al día" />
          <span>13 de 15 debidas hechas en 14 d</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-label text-v2-faint">Hacer ahora</span>
          <Buttons items={[{ label: 'Publicar 28 sept–4 oct' }, { label: 'Ajustar sábado 26 (sin hacer)' }]} />
        </div>
      </PanelFigure>

      <h3>La cabecera</h3>
      <p>
        Su nombre, su nivel, su división y la cuenta atrás de su carrera. A la derecha:{' '}
        <b>Mensaje</b> (con los que tiene sin leer), <b>Comunicado…</b>, <b>Publicar</b> su próxima
        semana y <b>···</b> con <b>Personalizar su plan…</b> (sacarlo del plan de su grupo),{' '}
        <b>Volver al plan de su grupo…</b>, <b>Pausar</b> y <b>Dar de baja</b>. Las flechas{' '}
        <b>‹ ›</b> (o <b>K</b> y <b>J</b>) pasan al atleta anterior o siguiente de la lista de la que
        vienes, con sus filtros.
      </p>

      <h3>Plan: su calendario, editable en el sitio</h3>
      <p>
        Por defecto ves <b>3 semanas</b>; también <b>Semana</b> y <b>Plan completo</b>. Encima, su
        adherencia con la ventana y en qué programa y semana va. Cada fila es una semana: sus siete
        días y, a la derecha, si la ve.
      </p>
      <PanelFigure>
        <Segmented label="Cuánto ver" items={['Semana', '3 semanas', 'Plan completo']} value="3 semanas" />
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="ok" label="Visible" icon="eye" soft />
          <Badge tone="warn" label="Oculta" icon="lock" soft />
          <span className="t-body-sm text-v2-muted">una semana retenida no se publica sola</span>
        </div>
      </PanelFigure>
      <ul className="clean">
        <li>
          <b>Mover</b>: arrastra un entreno a otro día. El aviso trae <b>Deshacer</b>.
        </li>
        <li>
          <b>Añadir</b>: el <b>+</b> de cada día: <b>De tu biblioteca</b>, <b>Entreno en blanco</b> o{' '}
          <b>Redactar con IA</b>.
        </li>
        <li>
          <b>Abrir</b>: pulsa un entreno y se abre a un lado. Ese panel <b>es el editor</b>: cambias la
          prescripción ahí, o lo mueves, lo duplicas o lo quitas. Si ya pasó, ves lo{' '}
          <b>prescrito contra lo hecho</b>.
        </li>
        <li>
          <b>La semana entera</b>: su <b>···</b> tiene <b>Publicar ya</b>, <b>Retener</b> (no se
          publica sola) o <b>Soltar</b>, <b>Copiar semana a…</b>, <b>Desplazar días…</b>,{' '}
          <b>Reducir volumen…</b>, <b>Descarga</b> y <b>Evaluar semana</b>.
        </li>
      </ul>

      <h3>La columna de su estado</h3>
      <p>
        Al lado del calendario: su <b>readiness</b> de los últimos 14 días frente a su propia base
        (mientras no tenga suficientes lecturas, lo dice), su sueño, agujetas y fatiga, su último{' '}
        <b>check-in</b> con <b>Responder</b>, la <b>lesión</b> activa (o <b>Registrar</b>), su{' '}
        <b>carrera objetivo</b>, una <b>nota privada</b> que solo ves tú y <b>tus marcadores</b>: los
        tests y marcas que elegiste en <b>Ajustes › Método</b>, con los que le faltan y un enlace para
        programarle el test.
      </p>

      <h3>Rendimiento y Perfil</h3>
      <p>
        <b>Rendimiento</b> es una sola página ordenada por preguntas: zonas y tests, carrera, carga,
        fuerza, fisiología y carreras (ver <b>Rendimiento</b>). <b>Perfil</b> junta sus datos y su
        clasificación (nivel y días por semana), sus días reales de entreno, lesiones, revisiones
        1:1, pagos y un <b>historial</b> de todo lo que ha pasado: mensajes, comunicados, check-ins,
        tests, lesiones y cambios de plan, con filtros.
      </p>

      <DocNote variant="cue" title="Un atleta recién llegado">
        <p>
          Mientras su alta esté pendiente, la pestaña Plan enseña su cuestionario de entrada y lo que
          falta para arrancar en lugar del calendario (ver <b>Altas pendientes</b>).
        </p>
      </DocNote>
    </DocSection>
  );
}

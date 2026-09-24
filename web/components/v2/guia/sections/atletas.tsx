// GUÍA · Atletas: todos en una tabla — vistas guardadas, filtros en la URL, las
// columnas (estado con motivo, semana visible/oculta, readiness y adherencia con
// su ventana), el vistazo lateral y las acciones en bloque. Sin cara en el móvil
// del atleta: es tu mesa de trabajo.

import { DocSection, DocNote, PanelFigure, Chips, Badge, Buttons } from '../doc';
import type { GuiaSection } from '../config';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          <b>Atletas</b> es la lista entera, en una tabla densa: una fila por atleta con lo que
          necesitas para decidir sin abrir nada. Seleccionas a varios y actúas sobre todos a la vez:
          asignar un programa a veinte atletas son unos pocos clics.
        </>
      }
    >
      <PanelFigure
        caption={
          <>
            Las vistas son filtros con nombre. <b>Guardar vista</b> guarda los filtros y el orden que
            tengas puestos.
          </>
        }
      >
        <Chips
          items={[
            { label: 'Necesitan algo', count: 23, active: true },
            { label: 'Todos', count: 100 },
            { label: 'Sin plan', count: 27 },
            { label: 'No ven su semana', count: 47 },
            { label: 'Pausados', count: 0 },
          ]}
        />
      </PanelFigure>

      <h3>Vistas y filtros</h3>
      <p>
        Arriba, las vistas de serie: <b>Necesitan algo</b> (la de entrada, el peor primero),{' '}
        <b>Todos</b>, <b>Sin plan</b>, <b>No ven su semana</b> y <b>Pausados</b>, más las que tú
        guardes. Debajo, el buscador (tecla <b>/</b>) y los filtros: <b>Estado</b>, tu{' '}
        <b>Nivel</b> (con el nombre que le diste), <b>Grupo</b>, <b>Semana</b> y <b>Carrera</b>. Todo
        queda en la dirección de la página: compartes o guardas un enlace y se abre igual.
      </p>

      <h3>Qué dice cada columna</h3>
      <ul className="clean">
        <li>
          <b>Estado · motivo</b>: <em className="em">Acción</em>, <em className="em">Vigilar</em>,{' '}
          <em className="em">Alta pendiente</em>, <em className="em">Sin plan</em>,{' '}
          <em className="em">Al día</em> o <em className="em">En pausa</em>, con la razón al lado. Es el mismo estado que ves en Hoy,
          en Mensajes y en su ficha.
        </li>
        <li>
          <b>Semana</b>: si ve su semana en curso.
        </li>
        <li>
          <b>Readiness 14 d</b>: su última lectura de 0 a 100 y la línea de dos semanas.
        </li>
        <li>
          <b>Adh. 14 d</b>: de los entrenos que ya le tocaban en los últimos 14 días, cuántos hizo.
        </li>
        <li>
          <b>Últ. entreno</b>, <b>Próximo</b>, <b>Carrera</b> (cuenta atrás) y un globo si tiene un
          mensaje <b>por responder</b>.
        </li>
      </ul>

      <PanelFigure caption={<>La semana, siempre con las mismas dos palabras.</>}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="ok" label="Visible" icon="eye" soft />
          <Badge tone="warn" label="Oculta" icon="eye-off" soft />
          <Badge tone="neutral" label="Sin plan" soft />
        </div>
      </PanelFigure>

      <h3>El vistazo, sin salir de la lista</h3>
      <p>
        Pulsar una fila abre su <b>vistazo</b> a un lado: por qué está marcado, su readiness y su
        adherencia, su semana y los últimos mensajes, con la acción que toca. <b>J</b> y <b>K</b>{' '}
        pasan al siguiente atleta de la lista; <b>Abrir ficha</b> te lleva a su página entera.
      </p>

      <h3>Acciones sobre varios</h3>
      <p>
        Marca las casillas (con mayúsculas seleccionas un tramo; con el teclado, <b>X</b>) y abajo
        aparece la barra:
      </p>
      <PanelFigure>
        <Buttons
          items={[
            { label: 'Asignar programa' },
            { label: 'Publicar semana', icon: 'send' },
            { label: 'Mensaje', icon: 'message' },
            { label: 'Nivel' },
            { label: 'Añadir a grupo' },
            { label: 'Pausar' },
          ]}
        />
      </PanelFigure>
      <p>
        <b>Asignar programa</b> abre la previa de a quién le llega y con quién choca (ver{' '}
        <b>Asigna y publica por semanas</b>). <b>Mensaje</b> escribe el mismo texto a todos, cada uno
        en su chat. Lo que se puede deshacer, lleva <b>Deshacer</b> en el aviso.
      </p>

      <h3>Invitar, importar y las parejas</h3>
      <p>
        <b>Invitar atletas</b> da de alta a uno o a una lista pegada; <b>Importar lista</b> abre
        directamente la lista (ver <b>Invita a tus atletas</b>). En <b>···</b> están también las{' '}
        <b>Parejas de dobles</b>. Si prefieres tarjetas a tabla, el conmutador <b>Tabla · Tarjetas</b>{' '}
        está a la derecha de los filtros.
      </p>

      <DocNote variant="log" title="Un número sin ventana no dice nada">
        <p>
          La adherencia siempre lleva su ventana («Adh. 14 d») y solo cuenta lo que ya le tocaba: los
          entrenos de mañana nunca la bajan. Si en la ventana no le tocaba nada, verás un{' '}
          <b>—</b>, no un 0 %.
        </p>
      </DocNote>
    </DocSection>
  );
}

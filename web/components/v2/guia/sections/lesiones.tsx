// GUÍA · Lesiones — Cuando tu atleta se lesiona lo
// registras desde su ficha, la ves en la columna de su estado y adaptas su plan sin que
// esos días cuenten como fallo. Verificado contra lib/injuries/injuries.ts,
// shared/schema/injuries.ts, shared/domain/coach/injury-taxonomy.ts,
// injury-presentation.ts, InjuryPanel.tsx, use-injuries.ts y las rutas
// app/api/coach/athletes/[id]/injuries + app/api/athlete/injuries.
//
// Lado atleta (HONESTO): los endpoints /api/athlete/injuries (auto-parte, lectura y
// actualización) EXISTEN, pero la pantalla dentro de la app iOS aún no está — hoy
// registra el coach desde la ficha. Se refleja tal cual en el MovilBand.

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
} from '../doc';
import type { GuiaSection } from '../config';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Cuando tu atleta se lesiona, lo <b>registras</b> en su ficha, la tienes a la vista junto a su
          plan y <b>adaptas sus entrenos sin perder el hilo</b>. Cada episodio es una ficha propia con su
          evolución, y los días de reposo o las sesiones adaptadas <b>no cuentan como fallo</b>.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Una <b>lesión</b> es un episodio con su ficha: <b>zona</b>, <b>tipo</b>, <b>gravedad</b> (
            leve · moderada · severa) y <b>estado</b> (activa · en recuperación · resuelta), con la
            fecha de inicio y un <b>timeline</b> de evolución.
          </>
        }
        como={
          <>
            En su ficha, <b>Lesión › Registrar</b> (junto al calendario) o <b>Perfil › Lesiones</b>.
            Mueves su estado según se recupera, <b>Adaptar sesiones</b> cambia los próximos entrenos
            y, si es severa o larga, <b>pausas el plan</b>.
          </>
        }
        porque={
          <>
            Porque una lesión bien llevada no debe ensuciar sus métricas ni perderse de vista: la ves
            cada vez que abres su plan, y la adherencia deja de castigar lo que no dependía de él.
          </>
        }
      />

      <h3>La ficha de la lesión</h3>
      <p>
        Cada episodio guarda <b>zona</b> (taxonomía canónica: rodilla, tobillo/pie, lumbar, isquios…),
        un <b>tipo</b> libre (p. ej. <em className="em">tendinitis rotuliana</em>), <b>gravedad</b>{' '}
        <code>leve · moderada · severa</code>, <b>estado</b> <code>activa · en recuperación · resuelta</code>,
        la <b>fecha de inicio</b> y un <b>retorno estimado</b> opcional. Cada cambio deja una entrada en
        el <b>timeline</b>, así que la evolución se lee de arriba abajo.
      </p>

      <h3>Dónde la ves</h3>
      <p>
        Mientras esté <b>abierta</b>, la columna de su estado en la pestaña Plan dice la zona, la
        gravedad y desde cuándo («rodilla · moderada · activa desde el 3 sept»), con{' '}
        <b>Adaptar sesiones</b> al lado. En <b>Perfil › Lesiones</b> está la ficha entera de cada
        episodio y su evolución. Cuando la marcas <b>resuelta</b>, pasa al histórico: nada se borra.
        Y si es tu atleta quien avisa de una molestia al acabar un entreno, sube a Hoy como señal.
      </p>

      <DocNote variant="cue" title="Adaptar sesiones sin castigar la adherencia">
        <ul>
          <li>
            <span className="k">Reposo</span> → ese día se <b>excluye</b> del cálculo (igual que una
            pausa). <span className="k">Sustituida</span> por rehab y <span className="k">suavizada</span>{' '}
            siguen contando por lo que el atleta ejecuta. Nunca se marca como fallo.
          </li>
          <li>
            Si la lesión es <span className="k">severa</span> o el retorno queda lejos (más de 21 días),
            aparece <span className="k">Pausar plan</span>, que la enlaza con una pausa completa (ver{' '}
            <b>Pausas y bajas</b>).
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="Del lado del atleta"
        subtitle={
          <>
            La lesión la <b>registras tú</b> desde su ficha. Tu atleta declara sus lesiones en el
            cuestionario de entrada y te avisa de una molestia al acabar cada entreno.
          </>
        }
      >
        <DocNote variant="cue" title="El parte desde la app llega pronto">
          <ul>
            <li>
              Los endpoints del atleta (<code>reportar</code>, <code>leer</code> y{' '}
              <code>actualizar</code> su propia lesión) ya están operativos; falta la{' '}
              <span className="k">pantalla en iOS</span>, que se activa próximamente.
            </li>
            <li>
              Lo que el atleta <b>sí ve hoy</b>: si una lesión severa congela su plan, aparece la
              tarjeta <span className="k">«Tu plan está en pausa»</span> (ver <b>Pausas y bajas</b>),
              sin sesiones caducadas y con su progreso guardado.
            </li>
          </ul>
        </DocNote>
      </MovilBand>
    </DocSection>
  );
}

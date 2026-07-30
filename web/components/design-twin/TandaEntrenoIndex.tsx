'use client';

// La portada de la tanda inmersiva del entreno — SOLO las diez pantallas del
// 29-jul, agrupadas por su propia lógica, sin mezclarse con el resto del
// índice. Es la dirección que se comparte para revisar o continuar este
// trabajo (docs/HANDOFF-entreno-vivo-ux.md).

import Link from 'next/link';
import { ESTADO_LABEL, TANDA_ENTRENO, getScreen } from './registry';

export function TandaEntrenoIndex({ localePrefix }: { localePrefix: string }) {
  return (
    <div className="studio-index">
      <header className="studio-index-head">
        <p className="studio-label">El doble · colección</p>
        <h1>El entreno, en vivo</h1>
        <p className="studio-desc">
          La regla que ordena el móvil: cada formato tiene una vista con sujeto propio según QUIÉN
          gobierna la transición (el reloj, el hito medido, el atleta, el suceso, el relevo). Girado
          con máquina delante sale la cara de monitor y el formato se queda en la franja.
        </p>
        <p className="studio-desc">
          En la muñeca la regla es OTRA, y por eso hay nueve vistas más (30-jul). Ahí no decide el
          formato: deciden qué mide el reloj <em>de verdad</em> en esa modalidad —en cinta y en ergo
          no ve la máquina, en fuerza no ve ni la carga ni las reps— y si el atleta puede mirar y
          puede tocar en ese momento. Lo segundo manda sobre lo primero. Donde esta colección choque
          con propuestas más viejas del índice general, manda esta.
        </p>
      </header>

      {TANDA_ENTRENO.map(({ grupo, ids }) => (
        <section key={grupo} className="studio-zona">
          <h2 className="studio-label">{grupo}</h2>
          <div className="studio-grid">
            {ids.map((id) => {
              const s = getScreen(id);
              if (!s) return null;
              const { meta } = s;
              return (
                <Link key={meta.id} href={`${localePrefix}/design/${meta.id}`} className="studio-card">
                  <div className="studio-card-top">
                    <span className="studio-stamp" data-estado={meta.estado}>
                      {ESTADO_LABEL[meta.estado]}
                    </span>
                    <span className="studio-device">{meta.dispositivo === 'watch' ? 'Watch' : 'iPhone'}</span>
                  </div>
                  <h3>{meta.titulo}</h3>
                  <p>{meta.descripcion}</p>
                  <span className="studio-tags">
                    {meta.soportaHorizontal && <span className="studio-tag">gira ⟳</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <p className="studio-desc">
        <Link href={`${localePrefix}/design`}>← El índice general del doble</Link> (todo lo demás:
        espejos de la app de hoy, otras propuestas y los huecos reconocidos).
      </p>
    </div>
  );
}

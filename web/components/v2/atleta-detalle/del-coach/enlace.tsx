'use client';

// EL ENLACE CRUZADO — «esto se cierra con aquello».
//
// Un briefing que deja una decisión abierta lo DICE y lleva a ella. Sin esto, el
// coach escribe «acuérdate de contestarme lo de la wave» dentro del texto y el
// atleta tiene que ir a buscarla: dos pantallas, y la segunda no existe todavía
// en su cabeza. Con el enlace, el pie de la nota es la llamada — y una vez
// contestada se convierte en el recibo de lo que decidió.
//
// UNO, no varios: un comunicado que apuntara a cinco sitios dejaría de decir
// «esto es lo que queda pendiente» y sería un índice.

import { useEffect, useState } from 'react';
import { KIND_LABEL, type CommunicationKind } from '@fahybrid/shared/domain/coach-communications';
import { Campo } from './campos';
import { listarDeAtleta, listarPublicados } from './api';

/** Lo mínimo para elegir uno de la lista: qué es y cómo se llama. */
export interface CandidatoEnlace {
  id: string;
  kind: CommunicationKind;
  title: string;
}

const SIN_ENLACE = '';

export function EnlaceCruzado({
  valor,
  candidatos,
  onChange,
}: {
  valor: string;
  candidatos: CandidatoEnlace[];
  onChange: (v: string) => void;
}) {
  // Sin nada publicado no se ofrece: un desplegable vacío es una promesa rota, y
  // el primer comunicado de un atleta no puede enlazar a nada por definición.
  if (candidatos.length === 0) return null;

  return (
    <Campo
      etiqueta="Enlazar a… (opcional)"
      htmlFor="enlace-cruzado"
      ayuda="Lo que le falta a esto para cerrarse. Le sale al final, y cuando lo resuelva se queda como el recibo de lo que decidió."
    >
      <select
        id="enlace-cruzado"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="v2-focus w-full max-w-[420px] rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] px-3 py-2.5 text-body text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] focus:border-[color:var(--v2-accent)] focus:outline-none"
      >
        <option value={SIN_ENLACE}>Sin enlazar</option>
        {candidatos.map((c) => (
          <option key={c.id} value={c.id}>
            {KIND_LABEL[c.kind]} · {c.title}
          </option>
        ))}
      </select>
    </Campo>
  );
}

/**
 * Los candidatos a enlazar, cargados a demanda.
 *
 * Cuando se escribe para UN atleta la lista es lo que se le ha publicado a ÉL:
 * enlazar a algo que no ha recibido le dejaría un pie que no lleva a ninguna
 * parte (el servidor no se lo mandaría, y con razón). Escribiendo para varios o
 * para la biblioteca no hay «él», así que la lista es lo que el coach tiene
 * publicado.
 *
 * Lo archivado no entra: ya no le aparece a nadie.
 */
export function useCandidatosEnlace(athlete_id: string | null): CandidatoEnlace[] {
  const [candidatos, setCandidatos] = useState<CandidatoEnlace[]>([]);

  useEffect(() => {
    // Si el compositor se cierra —o cambia de atleta— antes de que conteste la
    // API, la respuesta vieja no puede escribir sobre el estado nuevo.
    let vigente = true;

    const cargar = async () => {
      const r = athlete_id ? await listarDeAtleta(athlete_id) : await listarPublicados();
      if (!vigente) return;
      // Un fallo aquí no rompe el compositor: se queda sin la opción de enlazar,
      // que es exactamente lo que había antes de que existiera.
      setCandidatos(
        r.ok
          ? r.data
              .filter((c) => c.status === 'published')
              .map((c) => ({ id: c.id, kind: c.kind, title: c.title }))
          : [],
      );
    };

    void cargar();
    return () => {
      vigente = false;
    };
  }, [athlete_id]);

  return candidatos;
}

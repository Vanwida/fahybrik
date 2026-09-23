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
import { Select } from '@/components/v2/ui';

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
      <Select
        id="enlace-cruzado"
        size="lg"
        value={valor}
        onValueChange={onChange}
        className="w-full max-w-[420px]"
        options={[
          { value: SIN_ENLACE, label: 'Sin enlazar' },
          ...candidatos.map((c) => ({ value: c.id, label: `${KIND_LABEL[c.kind]} · ${c.title}` })),
        ]}
      />
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

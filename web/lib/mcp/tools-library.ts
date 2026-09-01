// Buscar en lo que el coach ha CREADO (su biblioteca) y en lo que ha ESCRITO (su
// metodología). Dos preguntas distintas y dos tools, porque las respuestas no se
// parecen: una devuelve cosas que se pueden programar, la otra devuelve lo que él
// piensa sobre cómo se entrena.
//
// LA ESCALERA DE LA BIBLIOTECA tiene tres peldaños y `search_library` los busca a
// la vez cuando no se le dice cuál: EJERCICIO (un movimiento del catálogo, con el
// nombre que él le puso), BLOQUE (una pieza de su metodología, a veces solo prosa
// sin desglosar) y PLANTILLA (una sesión entera). Van agrupados y contados aparte
// — revueltos, el asistente ofrecería un ejercicio donde hace falta una sesión.
//
// LA BÚSQUEDA DE BLOQUES Y PLANTILLAS FILTRA EN MEMORIA a propósito: los dos
// cargadores del panel (`listBlocksWithStructure`, `listTemplatesForCoach`) ya
// traen la biblioteca del coach scoped en una consulta, y son cientos de filas, no
// millones. Añadir un LIKE en SQL sería una segunda forma de buscar lo mismo que
// podría discrepar de la lista que el coach ve en pantalla.
//
// METODOLOGÍA: el corpus se cuenta ANTES de embeber la pregunta. Sin documentos no
// hay nada donde buscar, y decirlo cuesta una consulta indexada en vez de una
// llamada al modelo de embeddings que acabaría devolviendo un array vacío mudo.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sql } from '@/lib/db';
import { loadCoachCatalog } from '@/lib/dashboard/exercises/list-exercises';
import { blockReadiness, listBlocksWithStructure } from '@/lib/dashboard/coach/blocks';
import { listTemplatesForCoach } from '@/lib/dashboard/coach/templates';
import { listDocuments } from '@/lib/rag/repository';
import { RetrieveError, retrieveRelevant } from '@/lib/rag/retrieve';
import { loadCoachMethodMirror } from '@/lib/coach/method-interview';
import { fail, ok, withCoach } from './runtime';
import {
  NO_METHODOLOGY_MESSAGE,
  libraryResumen,
  methodologyResumen,
  toBlockHit,
  toExerciseHit,
  toPassage,
  toTemplateHit,
} from './shape-library';

// El cuarto peldaño, `level`, entró tarde y por un motivo concreto (card 137):
// crear un microciclo pedía un nivel y NINGUNA herramienta de lectura sabía
// decir cuáles había, así que el asistente sólo podía adivinar. Ahora el nivel
// es opcional, pero el que SÍ organiza por niveles necesita poder verlos.
//
// OJO CON EL NOMBRE: «nivel» es como lo llamamos NOSOTROS. Es un eje con el que
// el entrenador agrupa a sus atletas y sus bloques, y cada uno lo usa a su
// manera — hay uno cuyos «niveles» son «N2, N3, N4, Hyrox», o sea que el cuarto
// no es un nivel, es un objetivo. El identificador se queda estable; cómo se
// LLAME ese eje en pantalla es del entrenador (ver DECISIONS 2026-08-23).
const LIBRARY_KINDS = ['exercise', 'block', 'template', 'level'] as const;
type LibraryKind = (typeof LIBRARY_KINDS)[number];

/** Cuántos resultados por peldaño. Suficiente para elegir, corto para leer. */
const HITS_PER_KIND = 10;

/** Pasajes de metodología por defecto — el mismo que usa el recuperador. */
const DEFAULT_TOP_K = 6;
const MAX_TOP_K = 20;

export function registerLibraryTools(server: McpServer): void {
  server.registerTool(
    'search_library',
    {
      title: 'Buscar en su biblioteca',
      description:
        'Busca en la biblioteca del coach: ejercicios del catálogo (con el nombre que él les puso), bloques de su metodología y plantillas de sesión. Sin decir el tipo busca en los tres y los devuelve agrupados. Cada resultado trae su id para pedirlo después y una línea de qué es.',
      inputSchema: {
        query: z
          .string()
          .min(2)
          .describe('Lo que busca: un movimiento, una parte del título, una palabra suya.'),
        kind: z
          .enum(LIBRARY_KINDS)
          .optional()
          .describe(
            'Limita la búsqueda: exercise (movimientos del catálogo), block (piezas de su metodología), template (sesiones enteras) o level (los grupos con los que clasifica a sus atletas, si los usa). Sin esto, los cuatro.',
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const wants = (kind: LibraryKind) => args.kind == null || args.kind === kind;
        const needle = args.query.trim().toLowerCase();

        const [exercises, blocks, templates, levels] = await Promise.all([
          wants('exercise')
            ? loadCoachCatalog(sql, coach_id, { search: args.query, limit: HITS_PER_KIND })
            : null,
          wants('block') ? listBlocksWithStructure(coach_id, null, sql) : null,
          wants('template') ? listTemplatesForCoach(coach_id, sql) : null,
          // Los niveles se devuelven ENTEROS y sin filtrar por la búsqueda: son
          // cinco como mucho, y quien pregunta normalmente no busca uno — quiere
          // saber cuáles hay para poder elegir. Filtrarlos por el texto sería
          // devolver cero justo cuando más falta hacen.
          wants('level')
            ? sql<Array<{ id: string; name: string }>>`
                select id::text, name from athlete_levels
                where coach_id = ${coach_id}
                order by sort_order asc, id asc
              `
            : null,
        ]);

        // El título Y la prosa: un bloque se busca por lo que dice, no solo por
        // cómo se llama («10' row z2» vive en la descripción).
        const blockHits = (blocks ?? [])
          .filter(
            (b) =>
              b.title.toLowerCase().includes(needle) ||
              b.description.toLowerCase().includes(needle),
          )
          .slice(0, HITS_PER_KIND);
        const templateHits = (templates ?? [])
          .filter((t) => t.name.toLowerCase().includes(needle))
          .slice(0, HITS_PER_KIND);

        const counts = {
          exercises: exercises ? exercises.length : null,
          blocks: blocks ? blockHits.length : null,
          templates: templates ? templateHits.length : null,
          levels: levels ? levels.length : null,
        };

        return ok(
          {
            query: args.query,
            searched: args.kind ? [args.kind] : [...LIBRARY_KINDS],
            // null = ese peldaño no se ha buscado (el coach pidió un kind), que no
            // es lo mismo que buscarlo y no encontrar nada ([]).
            exercises: exercises ? exercises.map(toExerciseHit) : null,
            blocks: blocks ? blockHits.map((b) => toBlockHit(b, blockReadiness(b))) : null,
            templates: templates ? templateHits.map(toTemplateHit) : null,
            levels: levels
              ? levels.map((l) => ({ id: Number(l.id), name: l.name }))
              : null,
            // Si la lista viene cortada por el tope, para que el asistente sepa que
            // hay más y merece la pena afinar la búsqueda.
            truncated: {
              exercises: exercises != null && exercises.length >= HITS_PER_KIND,
              blocks: blocks != null && blockHits.length >= HITS_PER_KIND,
              templates: templates != null && templateHits.length >= HITS_PER_KIND,
            },
          },
          libraryResumen({ query: args.query, ...counts }),
        );
      }),
  );

  server.registerTool(
    'search_methodology',
    {
      title: 'Buscar en su metodología',
      description:
        'Busca en la metodología del propio coach: sus textos, transcripciones, documentos y notas de voz ya indexados. Devuelve los pasajes que más se parecen a la pregunta, cada uno con el documento del que sale, para poder contestar con SU criterio y citar de dónde viene. Úsalo antes de opinar sobre cómo entrena.',
      inputSchema: {
        query: z
          .string()
          .min(2)
          .describe('La pregunta o el tema, dicho como se diría en voz alta.'),
        top_k: z
          .number()
          .int()
          .min(1)
          .max(MAX_TOP_K)
          .optional()
          .describe(`Cuántos pasajes traer. Por defecto ${DEFAULT_TOP_K}.`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const documents = await listDocuments({ coach_id }, sql);
        const indexed = documents.filter((d) => d.chunk_count > 0);
        const mirror = await loadCoachMethodMirror(coach_id, sql).catch(() => '');
        if (indexed.length === 0 && !mirror) return fail(NO_METHODOLOGY_MESSAGE);
        if (indexed.length === 0) {
          return ok(
            {
              query: args.query,
              how_coach_trains: mirror,
              corpus: { document_count: 0, documents: [] },
              passages: [],
            },
            `Cómo entrena (entrevista): ${mirror}`,
          );
        }

        let chunks;
        try {
          chunks = await retrieveRelevant(
            { coach_id, query: args.query, top_k: args.top_k ?? DEFAULT_TOP_K },
            sql,
          );
        } catch (err) {
          if (err instanceof RetrieveError) {
            // El buscador semántico necesita el proveedor de embeddings. Si no
            // está, se dice: mejor eso que un «no hay nada» que es mentira.
            return fail(
              `No he podido buscar en tu metodología ahora mismo (${err.message}). Los documentos siguen ahí; vuelve a intentarlo.`,
            );
          }
          throw err;
        }

        return ok(
          {
            query: args.query,
            how_coach_trains: mirror || null,
            corpus: {
              document_count: indexed.length,
              documents: indexed.map((d) => ({
                document_id: d.id,
                title: d.title,
                source_type: d.source_type,
                chunk_count: d.chunk_count,
              })),
            },
            passages: chunks.map(toPassage),
          },
          [
            mirror ? `Cómo entrena (entrevista): ${mirror}` : null,
            methodologyResumen({ query: args.query, chunks, documents: indexed }),
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }),
  );
}

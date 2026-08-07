// quickline-block — convierte lo que la gramática del importador entendió de UNA
// entrada del quickline (parseNotationCell) en UN bloque tipado del editor.
// Contrato de honestidad (docs/design/contrato-rediseno-editor-microciclos.md,
// decisión 2): las líneas entendidas entran con su prescripción tipada tal cual;
// lo no entendido entra marcado a revisar con su texto verbatim en `note` —
// JAMÁS se inventa un número. Y NUNCA se fabrica un `exercise_id`: el item lleva
// el `exercise_name` del token y la fila ofrece el catálogo (el gate honesto del
// guardado ya exige resolverlo o borrarlo).

import type { ParsedLine } from '@fahybrid/shared/domain/import/notation';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';

// scheme → template_format del bloque. Los esquemas SON valores válidos del enum
// de formato; solo los tres con alias legacy más expresivo se traducen para que
// el chip de tipo del bloque (archetypeForFormat) los reconozca.
const SCHEME_FORMAT_ALIAS: Record<string, string> = {
  sets: 'strength_block',
  steady: 'tempo',
  rounds: 'circuit',
};

// Título ligero desde el token del coach («press banca» → «Press Banca»).
function titleCase(s: string): string {
  return s.replace(/\p{L}+/gu, (w) => (w[0]?.toUpperCase() ?? '') + w.slice(1));
}

/** UNA entrada del quickline (posiblemente varias líneas parseadas) → UN bloque. */
export function blockFromQuickLines(lines: ParsedLine[]): EditorBlock {
  const now = Date.now();
  const firstTyped = lines.find((l) => l.confidence === 'detected');

  // El nombre del bloque: el token del coach; si el trabajo no nombra ejercicio
  // («10x400m r1'»), la propia dosis canónica; si nada se entendió, honestidad.
  const token = firstTyped?.exercise_token.trim() ?? '';
  const title = token
    ? titleCase(token)
    : firstTyped
      ? prescriptionToText(firstTyped.prescription) || 'Nuevo bloque'
      : 'Para revisar';

  // El formato sale SOLO de una línea entendida; un bloque todo-a-revisar no
  // luce un chip de formato que la gramática no probó.
  const scheme = firstTyped?.prescription.scheme;
  const format = scheme ? SCHEME_FORMAT_ALIAS[scheme] ?? scheme : null;

  const items: EditorItem[] = lines.map((l, i) => ({
    uid: `ql-item-${now}-${i}`,
    exercise_id: null,
    exercise_name: l.exercise_token.trim(),
    prescription: l.prescription,
  }));

  return { uid: `ql-block-${now}`, title, format, items };
}

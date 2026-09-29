// Leer los ficheros de la pantalla `garmin-antes` desde su examen: el código se
// comprueba contra las reglas del proyecto (menos de 500 líneas, sin `fontSize` ni
// hex a mano, sin nombres propios) y contra lo que emite, mirando el fuente.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../components/design-twin/screens/garmin-antes');

/** Los ficheros de la pantalla. */
export const FICHEROS = readdirSync(RAIZ).filter((f) => /\.(ts|tsx)$/.test(f));

/** El fuente de un fichero de la pantalla. */
export const fuente = (f: string) => readFileSync(resolve(RAIZ, f), 'utf8');

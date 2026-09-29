// El separador de las líneas compuestas («división Open · 34 años · 172 cm»). El
// espacio ANTES del punto medio es de no separación: así un salto de línea nunca
// deja un «·» colgando al principio de la línea siguiente.

export const SEP = ' · ';

/** Une trozos de una misma línea con el separador. */
export const unir = (...partes: string[]) => partes.join(SEP);

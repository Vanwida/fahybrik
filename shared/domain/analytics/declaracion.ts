// DECLARAR UN UMBRAL DE UN TOQUE — lo que aceptan las dos rutas (la del atleta y
// la del coach sobre su atleta), dicho una vez.
//
// `value: null` retira la declaración de esa clave: el atleta ya no sostiene ese
// número, y el resolvedor cae al peldaño siguiente (estimada / poblacional).
//
// Puro (zod), compartido por las rutas y los clientes.

import { z } from 'zod';
import { CLAVES_DECLARACION, LIMITES_DECLARACION, type ClaveDeclaracion } from './anclas';

export const declaracionUmbralSchema = z
  .object({
    kind: z.enum(CLAVES_DECLARACION),
    value: z.number().finite().nullable(),
    note: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.value == null) return;
    const lim = LIMITES_DECLARACION[d.kind as ClaveDeclaracion];
    if (d.value < lim.min || d.value > lim.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `Entre ${lim.min} y ${lim.max} ${lim.unidad}.`,
      });
    }
  });

export type DeclaracionUmbral = z.infer<typeof declaracionUmbralSchema>;

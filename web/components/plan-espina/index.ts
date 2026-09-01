// La espina del plan: un solo dibujo para todas las superficies.
//
// Quien la use importa de aquí y nunca de los ficheros de dentro — así el día que
// el dibujo se parta en más piezas, ninguna pantalla se entera.

export { Espina, GEOMETRIA_ESPINA, type FormaEspina, type TramoEspina } from './Espina';
export { tramosDesdePlan } from './desde-plan';
export {
  TOKENS_TWIN,
  TOKENS_V2,
  TONOS_TWIN,
  TONOS_V2,
  colorDelTono,
  type TokensEspina,
} from './tokens';

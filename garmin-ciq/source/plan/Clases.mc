//
// Qué clases de paso sabe guiar la v1 (solo correr). Mecanismo del reloj, no
// método del coach: cómo se llame cada clase lo dice el vocabulario del plan.
//
using Toybox.Lang;

module Clases {

    // Una clase de carrera o de pausa entre tramos: se guía con ritmo, pulso, tiempo o distancia.
    function esDeCarrera(clase as Lang.Number) as Lang.Boolean {
        return clase == Cod.CLASE_CALENTAMIENTO ||
               clase == Cod.CLASE_VUELTA_CALMA ||
               clase == Cod.CLASE_RODAJE ||
               clase == Cod.CLASE_TIRADA ||
               clase == Cod.CLASE_TEMPO ||
               clase == Cod.CLASE_SERIES ||
               clase == Cod.CLASE_PROGRESIVO ||
               clase == Cod.CLASE_FARTLEK ||
               clase == Cod.CLASE_CUESTAS ||
               clase == Cod.CLASE_STRIDES ||
               clase == Cod.CLASE_CARRERA ||
               clase == Cod.CLASE_TEST ||
               clase == Cod.CLASE_RECUPERACION ||
               clase == Cod.CLASE_DESCANSO ||
               clase == Cod.CLASE_DESCANSO_TANDAS ||
               clase == Cod.CLASE_MOVILIDAD;
    }
}

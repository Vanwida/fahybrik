//
// El examen de un vector de oro: decodificar su base64 con el código del reloj y
// comprobar que sale lo que decodificó el códec de referencia.
//
// Cada `vector_<caso>` de Vectores.mc (generado) llama aquí. Comprueba, por este
// orden: que decodifica, el nº de pasos, la asignación, si la v1 la sabe guiar
// y la FIRMA de todo lo leído (Firma.mc). Ante un fallo, lo escribe en el log.
//
using Toybox.Lang;
using Toybox.Test;

(:test)
module ComprobarPlan {

    // fila = [caso, base64, firma, nº de pasos, asignacionId, soportada]
    function vector(fila as Lang.Array, logger as Test.Logger) as Lang.Boolean {
        var caso = fila[0] as Lang.String;
        var s = Decodificador.decodificar(fila[1] as Lang.String);
        if (s == null) {
            logger.debug(caso + ": no decodifica: " + Decodificador.error);
            return false;
        }
        if (s.pasos.size() != fila[3]) {
            logger.debug(caso + ": pasos " + s.pasos.size() + " ≠ " + fila[3]);
            return false;
        }
        if (s.asignacionId != fila[4]) {
            logger.debug(caso + ": asignación " + s.asignacionId + " ≠ " + fila[4]);
            return false;
        }
        if (s.soportada() != fila[5]) {
            logger.debug(caso + ": soportada " + s.soportada() + " ≠ " + fila[5]);
            return false;
        }
        var firma = Firma.de(s);
        if (firma != fila[2]) {
            logger.debug(caso + ": firma " + firma + " ≠ " + fila[2] + " · traza " + Firma.ultimaTraza);
            return false;
        }
        return true;
    }
}

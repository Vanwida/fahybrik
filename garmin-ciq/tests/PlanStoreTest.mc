//
// El plan en Storage: guardar la respuesta del servidor, leer lo de hoy, borrar
// lo retirado, y la edad de un plan. Corre contra el Storage real del simulador.
//
using Toybox.Lang;
using Toybox.Test;

(:test)
module PlanStoreTest {

    function vector(caso as Lang.String) as Lang.String {
        for (var i = 0; i < Vectores.TODOS.size(); i++) {
            if ((Vectores.TODOS[i][0] as Lang.String).equals(caso)) {
                return Vectores.TODOS[i][1] as Lang.String;
            }
        }
        return "";
    }

    function sesion(id as Lang.Number, fecha as Lang.String, plan as Lang.String, soportada as Lang.Boolean) as Lang.Dictionary {
        return { "asignacion_id" => id, "fecha" => fecha, "huella" => 1234, "soportada" => soportada, "motivo" => soportada ? "" : "fuerza", "plan" => plan };
    }
}

(:test)
function planSeGuardaSeLeeYSeBorra(logger as Test.Logger) as Lang.Boolean {
    var b64 = PlanStoreTest.vector("491");
    var data = { "v" => 2, "sesiones" => [PlanStoreTest.sesion(491, "2026-09-30", b64, true), PlanStoreTest.sesion(488, "2026-09-30", "", false), PlanStoreTest.sesion(479, "2026-10-01", b64, true)] };
    if (PlanStore.guardar(data, "2026-09-30") != PlanStore.GUARDADO_OK) {
        logger.debug("guardar no devolvió OK");
        return false;
    }
    if (PlanStore.deFecha("2026-09-30").size() != 2 || PlanStore.deFecha("2026-10-01").size() != 1) {
        logger.debug("el índice por fecha no cuadra");
        return false;
    }
    if (!b64.equals(PlanStore.base64De(491)) || PlanStore.base64De(488) != null) {
        logger.debug("la clave del plan no cuadra (491 sí, 488 no: no es soportada)");
        return false;
    }
    var s = Decodificador.decodificar(PlanStore.base64De(491) as Lang.String);
    if (s == null || s.asignacionId != 491) {
        logger.debug("el plan guardado no decodifica");
        return false;
    }
    // Un plan nuevo sin la 491 ni la 479: se borran sus claves.
    var nuevo = { "v" => 2, "sesiones" => [PlanStoreTest.sesion(488, "2026-09-30", "", false)] };
    PlanStore.guardar(nuevo, "2026-09-30");
    if (PlanStore.base64De(491) != null || PlanStore.base64De(479) != null || PlanStore.indice().size() != 1) {
        logger.debug("lo retirado del plan no se borró");
        return false;
    }
    return true;
}

(:test)
function unaRespuestaDeOtraVersionNoSeGuarda(logger as Test.Logger) as Lang.Boolean {
    var data = { "v" => 3, "sesiones" => [] };
    return PlanStore.guardar(data, "2026-09-30") == PlanStore.GUARDADO_RESPUESTA_MALA;
}

(:test)
function laEdadDelPlanSeCuentaEnDias(logger as Test.Logger) as Lang.Boolean {
    return DateUtil.daysBetween("2026-09-27", "2026-09-30") == 3 &&
           DateUtil.daysBetween("2026-09-30", "2026-09-30") == 0 &&
           DateUtil.daysBetween("2026-12-30", "2027-01-02") == 3 &&
           DateUtil.daysBetween("", "2026-09-30") == null;
}

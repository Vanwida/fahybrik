//
// El resultado y su cola: la forma del cuerpo que pide el servidor y el «escribir
// primero, enviar después» (nada sale de la cola sin acuse).
//
using Toybox.Lang;
using Toybox.Test;

(:test)
module ResultadoTest {

    // Dos tramos de la 491 (calentamiento y rodaje): [paso, inicioS, durS, distM, ppmSuma, ppmN, ppmMax, cierre, veredicto].
    function tramos() as Lang.Array<Lang.Number> {
        return [0, 0, 300, 900, 15000, 100, 150, 0, 0, 1, 300, 600, 2000, 600000, 4000, 172, 0, 1];
    }
}

(:test)
function elCuerpoDelResultadoTieneLaFormaDelServidor(logger as Test.Logger) as Lang.Boolean {
    var s = MotorTest.sesionDe("491");
    var it = Resultado.item(s, 491, s.huella, 1790000000, 900, false, ResultadoTest.tramos());
    it.put("r", 7);
    var b = Resultado.cuerpo(it);
    var segs = b.get("segments") as Lang.Array;
    if (b.get("assignment_id") != 491 || !b.get("source").equals("garmin") || !b.get("recorded_via").equals("live") || !b.get("completeness").equals("partial")) {
        logger.debug("cabecera mal");
        return false;
    }
    if (b.get("perceived_exertion") != 7 || segs.size() != 2) {
        return false;
    }
    var s0 = segs[0] as Lang.Dictionary;
    var s1 = segs[1] as Lang.Dictionary;
    // 900 m en 300 s = 333 s/km; pulso medio 150; leg_* juntos (rodaje: principal, trabajo).
    if (s0.get("avg_pace_s_per_km") != 333 || s0.get("avg_hr") != 150 || !s0.get("leg_phase").equals("main") || !s0.get("leg_role").equals("work") || s0.get("position") != 0) {
        logger.debug("tramo 0: " + s0);
        return false;
    }
    return s1.get("position") == 1 && s1.get("leg_index") == 1 && !s1.get("modality").equals("") && s1.get("max_hr") == 172;
}

(:test)
function unRpeOmitidoNoSeManda(logger as Test.Logger) as Lang.Boolean {
    var it = Resultado.item(null, 12, 34, 1790000000, 60, true, [] as Lang.Array<Lang.Number>);
    var b = Resultado.cuerpo(it);
    return !b.hasKey("perceived_exertion") && b.get("completeness").equals("full");
}

(:test)
function elInstanteVaEnIsoUtc(logger as Test.Logger) as Lang.Boolean {
    return Resultado.iso(0).equals("1970-01-01T00:00:00Z") && Resultado.iso(1790000000).equals("2026-09-21T14:13:20Z");
}

(:test)
function elResultadoSeGuardaAntesDeEnviarseYSoloSaleConAcuse(logger as Test.Logger) as Lang.Boolean {
    var id = 1790000123;
    var it = Resultado.item(null, 7, 8, id, 60, true, [] as Lang.Array<Lang.Number>);
    if (!Cola.encolar(it) || Cola.ids().indexOf(id) < 0) {
        return false;
    }
    Cola.fijarRpe(id, 6);
    if (Json.num(Cola.leerItem(id) as Lang.Dictionary, "r", -1) != 6) {
        return false;
    }
    // Un 500, un 401 o un fallo de red NO lo sacan de la cola; un 200 sí.
    Cola.enVuelo = id;
    Cola.alResponder(500, null, 0);
    var sigue500 = Cola.ids().indexOf(id) >= 0 && Cola.estado == Cola.ESTADO_SERVIDOR;
    Cola.enVuelo = id;
    Cola.alResponder(401, null, 0);
    var sigue401 = Cola.ids().indexOf(id) >= 0 && Cola.estado == Cola.ESTADO_CADUCADA;
    Cola.enVuelo = id;
    Cola.alResponder(-104, null, 0);
    var sigueRed = Cola.ids().indexOf(id) >= 0 && Cola.estado == Cola.ESTADO_SERVIDOR;
    Cola.enVuelo = id;
    Cola.alResponder(200, null, id);
    return sigue500 && sigue401 && sigueRed && Cola.ids().indexOf(id) < 0 && Cola.estado == Cola.ESTADO_ENVIADO;
}

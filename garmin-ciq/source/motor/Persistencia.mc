//
// EL CHECKPOINT (G10): un resumen de la sesión en Storage cada cambio de paso y cada
// 30 s. Si la app muere, el siguiente arranque ofrece «Seguir» (nueva grabación, misma
// sesión) o «Guardar lo hecho». Garmin no permite reanudar un FIT tras cerrarse: se dice.
//
using Toybox.Lang;
using Toybox.System;

module Persistencia {

    // Cada cuánto se guarda un checkpoint aunque no cambie el paso.
    const CHECKPOINT_S = 30;

    function siToca(m as Motor) as Void {
        if (m.sesionS() - m.ultimoCheckpointS >= CHECKPOINT_S) {
            guardar(m);
        }
    }

    function guardar(m as Motor) as Void {
        m.ultimoCheckpointS = m.sesionS();
        Store.escribir(Config.STORE_CHECKPOINT, {
            "id" => m.s.asignacionId,
            "huella" => m.s.huella,
            "inicio" => m.inicioEpoch,
            "paso" => m.i,
            "sesS" => m.sesionS(),
            "dm" => m.sesDm,
            "ppmS" => m.sesPpmSuma,
            "ppmN" => m.sesPpmN,
            "ppmM" => m.sesPpmMax,
            "tramos" => m.tramos,
            "vueltas" => m.vueltas
        });
    }

    // Sigue una sesión interrumpida: NUEVA grabación, MISMA sesión (mismo started_at y assignment_id;
    // el servidor las une). Retoma en el paso donde iba, con lo cerrado hasta el checkpoint.
    function restaurar(m as Motor, chk as Lang.Dictionary) as Void {
        var paso = Json.num(chk, "paso", 0);
        m.i = paso < m.s.pasos.size() ? paso : m.s.pasos.size() - 1;
        var t = chk.get("tramos");
        m.tramos = t instanceof Lang.Array ? t : [] as Lang.Array<Lang.Number>;
        var v = chk.get("vueltas");
        m.vueltas = v instanceof Lang.Array ? v : [] as Lang.Array<Lang.Number>;
        m.dmBase = Json.num(chk, "dm", 0);
        m.sesDm = m.dmBase;
        m.sesPpmSuma = Json.num(chk, "ppmS", 0);
        m.sesPpmN = Json.num(chk, "ppmN", 0);
        m.sesPpmMax = Json.num(chk, "ppmM", 0);
        var ya = Json.num(chk, "sesS", 0) * Formato.MS_POR_S;
        m.relojInicioMs = System.getTimer() - ya;
        m.vueltaDesdeMs = ya;
        m.vueltaDesdeDm = m.dmBase;
        for (var k = 0; k + Motor.V_LARGO <= m.vueltas.size(); k += Motor.V_LARGO) {
            m.vueltaN += m.vueltas[k + Motor.V_TIPO] == 1 ? 1 : 0;
        }
        m.sinGrabar = !m.grabacion.iniciar();
        m.iniciarPaso(m.sesionMs());
        m.tick();
    }
}

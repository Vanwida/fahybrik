//
// EL BALANCE de lo hecho: el veredicto de un paso cerrado y el resumen de corredor
// («ritmo de lo fuerte», «N de M dentro»). Funciones puras sobre los tramos que guarda el Motor.
//
using Toybox.Lang;

module Balance {

    // El veredicto de un paso cerrado, con la holgura con la que juzgó el motor en vivo. A ritmo: su media.
    // A pulso: donde pasó MÁS tiempo tras la gracia; si el paso fue más corto que la gracia, no se juzga.
    function veredictoDelTramo(m as Motor, p as Paso, dur as Lang.Number, dist as Lang.Number) as Lang.Number {
        var o = p.principal();
        if (o == null || p.rol != Cod.ROL_TRABAJO) {
            return Juez.VER_NINGUNO;
        }
        if (Juez.esPulso(o)) {
            var total = m.pasoDentroS + m.pasoArribaS + m.pasoAbajoS;
            if (total == 0) {
                return Juez.VER_NINGUNO;
            }
            if (m.pasoDentroS >= m.pasoArribaS && m.pasoDentroS >= m.pasoAbajoS) {
                return Juez.VER_DENTRO;
            }
            return m.pasoArribaS >= m.pasoAbajoS ? Juez.VER_ENCIMA : Juez.VER_DEBAJO;
        }
        var media = Formato.ritmoDeTramo(dur, dist);
        if ((o.eje == Cod.EJE_RITMO || Juez.zonaDeRitmo(o)) && media != null) {
            return Juez.veredicto(o, media, Juez.holguraDe(o, m.s.reglas), m.s);
        }
        return Juez.VER_NINGUNO;
    }

    // Suma, sobre los tramos de trabajo de la parte principal, de segundos y metros (para «ritmo de lo fuerte»).
    // Devuelve [segundos, metros].
    function fuerte(m as Motor) as Lang.Array<Lang.Number> {
        var seg = 0;
        var metros = 0;
        for (var k = 0; k + Motor.T_LARGO <= m.tramos.size(); k += Motor.T_LARGO) {
            var p = m.s.pasos[m.tramos[k + Motor.T_PASO]];
            if (p.rol == Cod.ROL_TRABAJO && p.fase == Cod.FASE_PRINCIPAL) {
                seg += m.tramos[k + Motor.T_DUR_S];
                metros += m.tramos[k + Motor.T_DIST_M];
            }
        }
        return [seg, metros];
    }

    // «5 de 6 dentro»: [dentro, juzgados].
    function dentro(m as Motor) as Lang.Array<Lang.Number> {
        var d = 0;
        var n = 0;
        for (var k = 0; k + Motor.T_LARGO <= m.tramos.size(); k += Motor.T_LARGO) {
            var v = m.tramos[k + Motor.T_VEREDICTO];
            if (v != 0) {
                n++;
                if (v - 1 == Juez.VER_DENTRO) {
                    d++;
                }
            }
        }
        return [d, n];
    }
}

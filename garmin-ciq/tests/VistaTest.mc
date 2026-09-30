//
// Las caras del vivo dibujadas de verdad (en un bitmap en memoria) para cada paso de
// sesiones reales, en los tres diámetros de diseño (454, 260) y el suelo (218):
// comprueba que ninguna cara lanza una excepción con ninguna combinación de
// lecturas (con y sin pulso, con y sin ritmo). NO comprueba cómo se ve: eso es del
// reloj o del simulador con los ojos.
//
using Toybox.Graphics;
using Toybox.Lang;
using Toybox.Test;

(:test)
module VistaTest {

    const DIAMETROS = [454, 260, 218];

    function dcDe(d as Lang.Number) as Graphics.Dc {
        var ref = Graphics.createBufferedBitmap({ :width => d, :height => d });
        return (ref.get() as Graphics.BufferedBitmap).getDc();
    }

    // Un controlador con la sesión `caso` en el brief y un motor arrancado.
    function controlador(caso as Lang.String) as Controller {
        var c = new Controller();
        var s = MotorTest.sesionDe(caso);
        c.sesion = s;
        c.filas = [[1, "2026-09-30", 1, true, ""], [2, "2026-09-30", 1, true, ""]];
        c.body = Estructura.lineaBrief(s);
        c.vivo.motor = new Motor(s, 1790000000, new Grabacion());
        (c.vivo.motor as Motor).arrancar();
        return c;
    }

    function pintarTodo(caso as Lang.String, logger as Test.Logger) as Lang.Boolean {
        var estados = [AppState.STATE_BRIEF, AppState.STATE_CUENTA, AppState.STATE_VIVO, AppState.STATE_PAUSA, AppState.STATE_CONTROLES, AppState.STATE_CONFIRMA, AppState.STATE_RPE, AppState.STATE_RESUMEN, AppState.STATE_ENVIO];
        for (var di = 0; di < DIAMETROS.size(); di++) {
            var dc = dcDe(DIAMETROS[di]);
            var c = controlador(caso);
            var m = c.vivo.motor as Motor;
            c.vivo.cuentaN = 2;
            c.vivo.abrirControles(AppState.STATE_VIVO);
            c.vivo.armarResumen();
            // Cada paso de la sesión, con y sin lecturas, en cada página del vivo.
            for (var k = 0; k < m.s.pasos.size(); k++) {
                m.i = k;
                for (var con = 0; con < 2; con++) {
                    m.lectura.ppm = con == 1 ? 1450 : null;
                    m.lectura.ritmo = con == 1 ? 2400 : null;
                    for (var pg = 0; pg < Paginas.N; pg++) {
                        m.pagina = pg;
                        m.componer();
                        c.state = AppState.STATE_VIVO;
                        if (!VistaVivo.pintar(dc, c)) {
                            logger.debug(caso + ": el vivo no se pintó");
                            return false;
                        }
                    }
                }
            }
            m.pagina = 0;
            m.i = 0;
            m.componer();
            for (var e = 0; e < estados.size(); e++) {
                c.state = estados[e];
                if (!VistaVivo.pintar(dc, c)) {
                    logger.debug(caso + ": el estado " + estados[e] + " no se pintó");
                    return false;
                }
            }
        }
        return true;
    }
}

(:test)
function lasCarasDeUnaSesionConSeriesYRecuperacionSePintan(logger as Test.Logger) as Lang.Boolean {
    return VistaTest.pintarTodo("479", logger);
}

(:test)
function lasCarasDeUnRodajeConMovilidadSePintan(logger as Test.Logger) as Lang.Boolean {
    return VistaTest.pintarTodo("491", logger);
}

(:test)
function lasCarasDeSeis1000ADistanciaSePintan(logger as Test.Logger) as Lang.Boolean {
    return VistaTest.pintarTodo("modelo-6x1000", logger);
}

(:test)
function lasCarasDeUnaSesionLargaConGruposSePintan(logger as Test.Logger) as Lang.Boolean {
    return VistaTest.pintarTodo("509", logger);
}

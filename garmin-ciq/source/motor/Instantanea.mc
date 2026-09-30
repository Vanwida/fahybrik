//
// LA INSTANTÁNEA del paso justo antes de cerrarlo a mano, para poder DESHACERLO 5 s (G3):
// «el tiempo no se deshace»: el paso reabierto sigue contando desde donde iba, y lo que
// midió la sesión mientras tanto (metros, pulso) se queda. La vuelta del FIT ya cerrada no se
// puede quitar (Garmin no lo permite): la verdad del tramo vive en el servidor.
//
using Toybox.Lang;

class Instantanea {

    var i as Lang.Number = 0;
    var pasoInicioSesMs as Lang.Number = 0;
    var pasoInicioDm as Lang.Number = 0;
    var extraS as Lang.Number = 0;
    var preavisado as Lang.Boolean = false;
    var fuera as Lang.Number = 0;
    var desde as Lang.Number = 0;
    var ultimo as Lang.Number or Null = null;
    var tramos as Lang.Number = 0;
    var vueltas as Lang.Number = 0;

    function tomar(m as Motor) as Void {
        i = m.i;
        pasoInicioSesMs = m.pasoInicioSesMs;
        pasoInicioDm = m.pasoInicioDm;
        extraS = m.extraS;
        preavisado = m.preavisado;
        fuera = m.aviso.fuera;
        desde = m.aviso.desde;
        ultimo = m.aviso.ultimo;
        tramos = m.tramos.size();
        vueltas = m.vueltas.size();
    }

    function volver(m as Motor) as Void {
        m.i = i;
        m.pasoInicioSesMs = pasoInicioSesMs;
        m.pasoInicioDm = pasoInicioDm;
        m.extraS = extraS;
        m.preavisado = preavisado;
        m.aviso.fuera = fuera;
        m.aviso.desde = desde;
        m.aviso.ultimo = ultimo;
        m.tramos = m.tramos.slice(0, tramos);
        m.vueltas = m.vueltas.slice(0, vueltas);
    }
}

//
// Formatos de pantalla, en enteros y con coma española (port de kit-reloj/reglas.ts).
// Todo valor de eje llega en DÉCIMAS (un ritmo de 3:52 es 2320) y los kilos en
// centésimas: aquí no hay floats. Un dato que no llega se pinta "--", jamás un cero.
//
using Toybox.Lang;

module Formato {

    const SIN_DATO = "--";
    // Por encima de 20:00/km un ritmo describe un GPS fijando, no un esfuerzo.
    const RITMO_TECHO_S = 1200;
    const HORA_S = 3600;
    const MINUTO_S = 60;
    const DECI = 10;
    // Milisegundos por segundo y decímetros por metro: las escalas del motor.
    const MS_POR_S = 1000;
    const DM_POR_M = 10;
    // Por debajo de este tiempo en segundos, la duración se lee «90 s»; por encima, en minutos.
    const DURACION_EN_SEGUNDOS_HASTA_S = 90;
    const REPETICIONES_M = 5000;    // desde 5 km redondos, la distancia se dice en km

    function dos(n as Lang.Number) as Lang.String {
        return n < 10 ? "0" + n : n.toString();
    }

    // 14 → «0:14»; 2246 → «37:26»; 3725 → «1:02:05».
    function reloj(totalS as Lang.Number) as Lang.String {
        var s = totalS < 0 ? 0 : totalS;
        var h = s / HORA_S;
        var m = (s % HORA_S) / MINUTO_S;
        var sec = s % MINUTO_S;
        return h > 0 ? h + ":" + dos(m) + ":" + dos(sec) : m + ":" + dos(sec);
    }

    // Décimas de s/km → «3:52», o «--» si no se sabe o no es creíble.
    function ritmo(deci as Lang.Number or Null) as Lang.String {
        if (deci == null || deci <= 0) {
            return SIN_DATO;
        }
        var s = (deci + DECI / 2) / DECI;
        return s > RITMO_TECHO_S ? SIN_DATO : reloj(s);
    }

    // s/km × 10 = segundos × 10000 / metros. null si no hay distancia.
    const RITMO_DECI_POR_S_M = 10000;

    // Décimas de s/km de un tramo de `seg` segundos y `metros` metros; null si no se movió.
    function ritmoDeTramo(seg as Lang.Number, metros as Lang.Number) as Lang.Number or Null {
        return (seg > 0 && metros > 0) ? seg * RITMO_DECI_POR_S_M / metros : null;
    }

    // Décimas → «8», «8,5».
    function num(deci as Lang.Number) as Lang.String {
        var entero = deci / DECI;
        var resto = deci % DECI;
        return resto == 0 ? entero.toString() : entero + "," + resto;
    }

    // Distancia en metros: «800 m», «1,25 km».
    function distancia(m as Lang.Number) as Lang.String {
        if (m < 1000) {
            return (m < 0 ? 0 : m) + " m";
        }
        var km = m / 1000;
        var cm = (m % 1000) / 10;
        return cm == 0 ? km + " km" : km + "," + dos(cm) + " km";
    }

    // El valor y la unidad de una distancia por separado (el héroe los pinta con cuerpos distintos).
    function distanciaValor(m as Lang.Number) as Lang.String {
        if (m < 1000) {
            return (m < 0 ? 0 : m).toString();
        }
        return (m / 1000) + "," + dos((m % 1000) / 10);
    }

    function distanciaUnidad(m as Lang.Number) as Lang.String {
        return m < 1000 ? "m" : "km";
    }

    // Duración prescrita: «20 s», «90 s», «2 min», «2:30 min».
    function duracion(s as Lang.Number) as Lang.String {
        if (s < MINUTO_S || (s <= DURACION_EN_SEGUNDOS_HASTA_S && s % MINUTO_S != 0)) {
            return s + " s";
        }
        var m = s / MINUTO_S;
        var r = s % MINUTO_S;
        return r == 0 ? m + " min" : m + ":" + dos(r) + " min";
    }

    // Duración larga de un brief: «54 min», «1 h 05».
    function duracionLarga(s as Lang.Number) as Lang.String {
        var min = (s + MINUTO_S / 2) / MINUTO_S;
        if (min < 60) {
            return min + " min";
        }
        return (min / 60) + " h " + dos(min % 60);
    }

    // Lo prescrito de un paso: «1000 m», «1 min», «12 reps». Vacío si es abierto.
    function prescrito(p as Paso) as Lang.String {
        var v = p.medPrescrito;
        if (v == null || p.medTipo == Cod.MEDIDA_ABIERTA) {
            return "";
        }
        if (p.medTipo == Cod.MEDIDA_DISTANCIA) {
            return (v >= REPETICIONES_M && v % 1000 == 0) ? (v / 1000) + " km" : v + " m";
        }
        if (p.medTipo == Cod.MEDIDA_TIEMPO) {
            return duracion(v);
        }
        if (p.medTipo == Cod.MEDIDA_REPS) {
            return v + " reps";
        }
        return v + " cal";
    }

    // «3:45–3:55», «máx 142», según haya suelo, techo o los dos. `f` formatea un valor.
    function rango(o as Objetivo, f as Lang.Method) as Lang.String {
        var lo = o.min;
        var hi = o.max;
        if (lo != null && hi != null) {
            return lo == hi ? f.invoke(lo) : f.invoke(lo) + "-" + f.invoke(hi);
        }
        if (hi != null) {
            return "máx " + f.invoke(hi);
        }
        if (lo != null) {
            return "mín " + f.invoke(lo);
        }
        return "";
    }

    function zona(deci as Lang.Number) as Lang.String {
        return "Z" + (deci / DECI);
    }

    // Un objetivo en palabras cortas: «3:45-3:55», «Z2», «RPE 7», «máx 142 ppm».
    function objetivo(o as Objetivo) as Lang.String {
        var e = o.eje;
        if (e == Cod.EJE_RITMO || e == Cod.EJE_SPLIT500) {
            return rango(o, new Lang.Method(Formato, :ritmo)) + (e == Cod.EJE_SPLIT500 ? " /500" : "");
        }
        if (e == Cod.EJE_ZONA) {
            if (o.papel == Cod.PAPEL_TECHO && o.max != null) {
                return "máx " + zona(o.max);
            }
            return rango(o, new Lang.Method(Formato, :zona));
        }
        var n = new Lang.Method(Formato, :num);
        if (e == Cod.EJE_PPM) {
            return rango(o, n) + " ppm";
        }
        if (e == Cod.EJE_RPE) {
            return "RPE " + rango(o, n);
        }
        if (e == Cod.EJE_POTENCIA) {
            return rango(o, n) + " W";
        }
        if (e == Cod.EJE_PCTRM) {
            return rango(o, n) + " % RM";
        }
        if (e == Cod.EJE_RIR) {
            return "RIR " + rango(o, n);
        }
        if (e == Cod.EJE_CADENCIA) {
            return rango(o, n) + " pasos/min";
        }
        if (e == Cod.EJE_INCLINACION) {
            return rango(o, n) + " %";
        }
        return rango(o, new Lang.Method(Formato, :kilos)) + " kg";
    }

    // Kilos en centésimas → «135», «1,25».
    function kilos(centi as Lang.Number) as Lang.String {
        var resto = centi % 100;
        return resto == 0 ? (centi / 100).toString() : (centi / 100) + "," + dos(resto);
    }

    // «a 3:45-3:55», «RPE 7», «máx 142 ppm»: el objetivo tras lo prescrito.
    function textoObjetivo(o as Objetivo) as Lang.String {
        if (o.papel == Cod.PAPEL_TECHO || o.eje == Cod.EJE_RPE || o.eje == Cod.EJE_RIR || o.eje == Cod.EJE_KG || o.eje == Cod.EJE_PCTRM) {
            return objetivo(o);
        }
        return "a " + objetivo(o);
    }

    // La palabra de un RPE: la del coach si el objetivo la trae; si no, la del vocabulario del plan.
    function palabraRpe(o as Objetivo, v as Vocab) as Lang.String {
        if (o.palabra != null) {
            return o.palabra;
        }
        var deci = o.max != null ? o.max : (o.min != null ? o.min : 0);
        var i = (deci + DECI / 2) / DECI;
        return i >= 0 && i < v.rpe.size() ? v.rpe[i] : "";
    }
}

//
// EL JUEZ — las reglas: funciones puras de (paso, lecturas) → veredicto y aviso. Port de
// kit-reloj/reglas.ts y eventos.ts, en enteros.
//
// Unidades: todo valor comparable va en DÉCIMAS de su unidad (un ritmo de 3:52 es
// 2320, un pulso de 142 es 1420). Las holguras del coach llegan en unidades
// enteras y se pasan a décimas aquí. El reloj NUNCA aplica las zonas de Garmin
// (G6): las bandas llegan del plan, en bpm y s/km absolutos.
//
// Qué NO hacer: poner aquí un umbral, una holgura o una cadencia. Todo eso es
// método del coach y viene en `Sesion.reglas`.
//
using Toybox.Lang;

module Juez {

    const DECI = 10;

    enum {
        VER_NINGUNO = -1,
        VER_DENTRO = 0,
        VER_ENCIMA = 1,     // más intenso: más rápido, más pulso
        VER_DEBAJO = 2
    }

    enum {
        AVISO_NINGUNO,
        AVISO_AFLOJA,
        AVISO_APRIETA
    }

    // Una lectura en vivo, en décimas. null = no la mide nadie ahora (jamás un cero inventado).
    class Lectura {
        var ritmo as Lang.Number or Null = null;    // décimas de s/km
        var ppm as Lang.Number or Null = null;      // décimas de bpm
    }

    // ── qué familia es un objetivo ───────────────────────────────────────────

    function zonaDeRitmo(o as Objetivo) as Lang.Boolean {
        return o.eje == Cod.EJE_ZONA && o.escala == Cod.ESCALA_RITMO + 1;
    }

    // Una zona sin escala es de pulso (es lo que resuelven las ZonasCoach).
    function esPulso(o as Objetivo) as Lang.Boolean {
        return o.eje == Cod.EJE_PPM || (o.eje == Cod.EJE_ZONA && !zonaDeRitmo(o));
    }

    // Ejes donde MÁS es MENOS intenso (segundos por distancia).
    function esInverso(o as Objetivo) as Lang.Boolean {
        return o.eje == Cod.EJE_RITMO || o.eje == Cod.EJE_SPLIT500 || zonaDeRitmo(o);
    }

    // El valor en vivo que se juzga contra un objetivo, o null si nadie lo mide.
    function valorDe(o as Objetivo, l as Lectura) as Lang.Number or Null {
        if (o.eje == Cod.EJE_RITMO || zonaDeRitmo(o)) {
            return l.ritmo;
        }
        if (esPulso(o)) {
            return l.ppm;
        }
        return null;    // split, potencia, cadencia: no los mide un reloj de correr
    }

    // La holgura (histéresis) del coach para un objetivo, en décimas.
    function holguraDe(o as Objetivo, r as Reglas) as Lang.Number {
        if (o.eje == Cod.EJE_RITMO || zonaDeRitmo(o)) {
            return r.holguraRitmo * DECI;
        }
        if (esPulso(o)) {
            return r.holguraPpm * DECI;
        }
        if (o.eje == Cod.EJE_SPLIT500) {
            return r.holguraSplit * DECI;
        }
        return 0;
    }

    // ── zonas del coach ──────────────────────────────────────────────────────

    // La zona (1..N) de un pulso en bpm.
    function zonaDe(bpm as Lang.Number, techos as Lang.Array<Lang.Number>) as Lang.Number {
        for (var i = 0; i < techos.size(); i++) {
            if (bpm <= techos[i]) {
                return i + 1;
            }
        }
        return techos.size();
    }

    // Suelo de la zona k en bpm. Z1 recibe un suelo con el ancho de Z2 solo para poder dibujarse.
    function sueloZona(k as Lang.Number, techos as Lang.Array<Lang.Number>) as Lang.Number {
        if (k > 1) {
            return techos[k - 2] + 1;
        }
        var ancho = techos.size() > 1 ? techos[1] - techos[0] : 20;
        return techos[0] - ancho;
    }

    // El rango [lo, hi] en décimas contra el que se juzga un objetivo; null en un extremo = sin límite ahí.
    // Para un ritmo, lo = el más rápido. Sin dato con que juzgar: [null, null].
    function rango(o as Objetivo, s as Sesion) as Lang.Array<Lang.Number or Null> {
        if (o.eje == Cod.EJE_PPM || o.eje == Cod.EJE_RITMO) {
            return [o.min, o.max];
        }
        if (o.eje != Cod.EJE_ZONA) {
            return [null, null];
        }
        var lo = null;
        var hi = null;
        if (zonaDeRitmo(o)) {
            // Zona de ritmo: Z1 es la más lenta. El límite rápido es el de la zona más alta pedida;
            // el lento, el de la más baja. Z1 no tiene límite lento.
            var b = bandaKm(s);
            if (b == null || o.min == null || o.max == null) {
                return [null, null];
            }
            var zMin = o.min / DECI;
            var zMax = o.max / DECI;
            if (zMax >= 1 && zMax <= b.rapido.size()) {
                lo = b.rapido[zMax - 1] * DECI;
            }
            if (zMin >= 1 && zMin <= b.lento.size() && b.lento[zMin - 1] != null) {
                hi = b.lento[zMin - 1] * DECI;
            }
            return [lo, hi];
        }
        var t = s.zonasTechos;
        if (t == null) {
            return [null, null];
        }
        // Z1 no tiene suelo: por debajo de Z1 no hay zona (juzgar con el suelo de dibujo mandaría «aprieta» en un rodaje a Z1).
        if (o.min != null && o.min / DECI > 1 && o.papel != Cod.PAPEL_TECHO && o.min / DECI <= t.size()) {
            lo = sueloZona(o.min / DECI, t) * DECI;
        }
        if (o.max != null && o.max / DECI >= 1 && o.max / DECI <= t.size()) {
            hi = t[o.max / DECI - 1] * DECI;
        }
        return [lo, hi];
    }

    // El juego de bandas de ritmo por km (el de correr), o null.
    function bandaKm(s as Sesion) as Banda or Null {
        for (var i = 0; i < s.bandas.size(); i++) {
            if (s.bandas[i].unidad == Cod.UNIDAD_KM) {
                return s.bandas[i];
            }
        }
        return null;
    }

    // ── el veredicto, con dirección ──────────────────────────────────────────

    // ¿Dentro, por encima o por debajo? Se razona en INTENSIDAD. `holgura` es la histéresis
    // del coach; para PINTAR se usa 0: la pantalla dice la verdad, la holgura es del aviso.
    function veredicto(o as Objetivo, valor as Lang.Number, holgura as Lang.Number, s as Sesion) as Lang.Number {
        var r = rango(o, s);
        var lo = r[0];
        var hi = r[1];
        var v = VER_DENTRO;
        if (esInverso(o)) {
            if (lo != null && valor < lo - holgura) {
                v = VER_ENCIMA;
            } else if (hi != null && valor > hi + holgura) {
                v = VER_DEBAJO;
            }
        } else {
            if (hi != null && valor > hi + holgura) {
                v = VER_ENCIMA;
            } else if (lo != null && valor < lo - holgura) {
                v = VER_DEBAJO;
            }
        }
        // Un techo solo avisa hacia arriba; `avisa` del coach limita el sentido.
        var sentido = o.papel == Cod.PAPEL_TECHO ? Cod.AVISA_SOLO_ARRIBA : (o.avisa == 0 ? Cod.AVISA_AMBOS : o.avisa - 1);
        if (sentido == Cod.AVISA_SOLO_ARRIBA && v == VER_DEBAJO) {
            return VER_DENTRO;
        }
        if (sentido == Cod.AVISA_SOLO_ABAJO && v == VER_ENCIMA) {
            return VER_DENTRO;
        }
        return v;
    }

    // Un objetivo contra su lectura en vivo con la holgura del coach. VER_NINGUNO = nadie lo mide ahora.
    function juzgar(o as Objetivo, l as Lectura, s as Sesion) as Lang.Number {
        var v = valorDe(o, l);
        return v == null ? VER_NINGUNO : veredicto(o, v, holguraDe(o, s.reglas), s);
    }

    function mismaMagnitud(a as Objetivo, b as Objetivo) as Lang.Boolean {
        return a.eje == b.eje || (esPulso(a) && esPulso(b));
    }

    // El veredicto del objetivo principal, el que pinta la banda. Si hay un techo en la MISMA
    // magnitud («Z1, máx 142»), el borde alto lo pone el techo.
    function veredictoPrincipal(p as Paso, l as Lectura, s as Sesion) as Lang.Number {
        var o = p.principal();
        if (o == null) {
            return VER_NINGUNO;
        }
        var vp = juzgar(o, l, s);
        var techo = p.objetivoDe(Cod.PAPEL_TECHO);
        if (techo == null || !mismaMagnitud(o, techo)) {
            return vp;
        }
        if (juzgar(techo, l, s) == VER_ENCIMA) {
            return VER_ENCIMA;
        }
        return vp == VER_ENCIMA ? VER_DENTRO : vp;
    }

    // EL veredicto del paso (uno solo, el que vibra): un techo pasado manda, esté en la magnitud que esté.
    function veredictoDelPaso(p as Paso, l as Lectura, s as Sesion) as Lang.Number {
        var techo = p.objetivoDe(Cod.PAPEL_TECHO);
        if (techo != null && juzgar(techo, l, s) == VER_ENCIMA) {
            return VER_ENCIMA;
        }
        return veredictoPrincipal(p, l, s);
    }

    function techoPasado(p as Paso, l as Lectura, s as Sesion) as Lang.Boolean {
        var techo = p.objetivoDe(Cod.PAPEL_TECHO);
        return techo != null && juzgar(techo, l, s) == VER_ENCIMA;
    }

    // «rápido» / «lento» (ritmo) o «alto» / «bajo»; la marca ▲▼ la dibuja la vista.
    function palabra(o as Objetivo, v as Lang.Number) as Lang.String {
        if (esInverso(o)) {
            return v == VER_ENCIMA ? "rápido" : "lento";
        }
        return v == VER_ENCIMA ? "alto" : "bajo";
    }

    // ── el aviso fuera de objetivo: histéresis y cadencia del coach ──────────

    class EstadoAviso {
        var fuera as Lang.Number = VER_DENTRO;
        var desde as Lang.Number = 0;
        var ultimo as Lang.Number or Null = null;

        function reiniciar(t as Lang.Number) as Void {
            fuera = VER_DENTRO;
            desde = t;
            ultimo = null;
        }
    }

    // ¿Toca vibrar «afloja» o «aprieta»? Nunca en calentamiento ni en recuperación (salvo que el
    // coach lo pida); el primer aviso tras `confirmacionS` seguidos fuera; el siguiente, no antes de
    // `cadenciaS`; en un paso a pulso, «aprieta» espera `graciaZonaS` (el pulso llega tarde).
    // El veredicto que entra ya lleva la holgura aplicada. `t` = segundos del paso.
    function decidirAviso(e as EstadoAviso, v as Lang.Number, t as Lang.Number, p as Paso, principalEsPulso as Lang.Boolean, r as Reglas) as Lang.Number {
        var callar = (p.fase == Cod.FASE_CALENTAMIENTO && !r.avisarCalentamiento) || (p.rol != Cod.ROL_TRABAJO && !r.avisarRecuperacion);
        if (callar || v == VER_NINGUNO || v == VER_DENTRO) {
            e.fuera = VER_DENTRO;
            e.desde = t;
            return AVISO_NINGUNO;
        }
        if (v != e.fuera) {
            e.fuera = v;
            e.desde = t;
            return AVISO_NINGUNO;
        }
        var confirmado = t - e.desde >= r.confirmacionS;
        var libre = e.ultimo == null || t - e.ultimo >= r.cadenciaS;
        var gracia = principalEsPulso && v == VER_DEBAJO && t < r.graciaZonaS;
        if (!confirmado || !libre || gracia) {
            return AVISO_NINGUNO;
        }
        e.ultimo = t;
        return v == VER_ENCIMA ? AVISO_AFLOJA : AVISO_APRIETA;
    }
}

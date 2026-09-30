//
// LA FIRMA de una sesión decodificada — el examen contra los vectores de oro.
//
// tools/generar-vectores.py calcula, del plan que decodificó el códec de
// referencia (TypeScript), un número que resume todo lo leído. Aquí se calcula el
// MISMO número desde la `Sesion` que decodificó el reloj: si un campo se lee mal,
// la firma cambia. El orden de los campos es el de `firma_de` del script: se
// cambian juntos.
//
// Solo tests: las anotaciones (:test) dejan este módulo fuera del .prg de producción.
//
using Toybox.Lang;

(:test)
module Firma {

    const MODULO = 1000003;

    class Acumulador {
        var h as Lang.Number = 7;
        var traza as Lang.Array<Lang.Number> = [] as Lang.Array<Lang.Number>;

        function n(x as Lang.Number) as Void {
            h = ((h * 31) + (x % MODULO)) % MODULO;
        }

        // Ausente → 0; presente → valor + 1.
        function opc(x as Lang.Number or Null) as Void {
            n(x == null ? 0 : x + 1);
        }

        function texto(s as Lang.String) as Void {
            var cs = s.toCharArray();
            for (var i = 0; i < cs.size(); i++) {
                n(cs[i].toNumber());
            }
            n(cs.size());
        }

        function textoOpc(s as Lang.String or Null) as Void {
            if (s == null) {
                n(0);
            } else {
                n(1);
                texto(s);
            }
        }
    }

    function de(s as Sesion) as Lang.Number {
        var f = new Acumulador();
        f.n(s.asignacionId);
        f.n(s.huella);
        f.n(s.fitSport);
        f.n(s.fitSubSport);
        f.n(s.entorno);
        f.n(s.duracionEstS);

        f.traza.add(f.h);
        var z = s.zonasTechos;
        if (z == null) {
            f.n(0);
        } else {
            f.n(z.size());
            for (var i = 0; i < z.size(); i++) {
                f.n(z[i]);
            }
            f.n(s.zonasProcedencia);
            var nombres = s.zonasNombres;
            f.n(nombres == null ? 0 : nombres.size());
            if (nombres != null) {
                for (var i = 0; i < nombres.size(); i++) {
                    f.texto(nombres[i]);
                }
            }
        }

        f.traza.add(f.h);
        f.n(s.bandas.size());
        for (var i = 0; i < s.bandas.size(); i++) {
            var b = s.bandas[i];
            f.n(b.unidad);
            f.n(b.procedencia);
            f.n(b.rapido.size());
            for (var k = 0; k < b.rapido.size(); k++) {
                f.n(b.rapido[k]);
                f.opc(b.lento[k]);
            }
        }

        f.traza.add(f.h);
        var r = s.reglas;
        f.n(r.holguraRitmo);
        f.n(r.holguraPpm);
        f.n(r.holguraSplit);
        f.n(r.holguraVatios);
        f.n(r.holguraCadencia);
        f.n(r.cadenciaS);
        f.n(r.confirmacionS);
        f.n(r.graciaZonaS);
        f.n(r.preavisoS);
        f.n(r.preavisoM);
        f.n(r.preavisoMinimoS);
        f.n(r.avisarCalentamiento ? 1 : 0);
        f.n(r.avisarRecuperacion ? 1 : 0);

        f.traza.add(f.h);
        var v = s.vocab;
        f.n(v.clases.size());
        for (var i = 0; i < v.clases.size(); i++) {
            f.n(v.clases[i]);
            f.texto(v.nombres[i]);
            f.n(v.femenino[i] ? 1 : 0);
        }
        for (var i = 0; i < v.formatos.size(); i++) {
            f.texto(v.formatos[i]);
        }
        for (var i = 0; i < v.rpe.size(); i++) {
            f.texto(v.rpe[i]);
        }

        f.traza.add(f.h);
        var m = s.metodo;
        f.n(m.paresMinimos);
        f.n(m.umbralHechoPct);
        f.n(m.guardarQuietoS);
        f.n(m.repsDeMas);
        f.n(m.rpeMin);
        f.n(m.rpeMax);
        f.n(m.rpePaso);
        f.n(m.rirMin);
        f.n(m.rirMax);
        f.n(m.rirPaso);
        f.n(m.kgMax);

        f.traza.add(f.h);
        f.textoOpc(s.pareja);

        f.n(s.pasos.size());
        f.traza.add(f.h);
        for (var i = 0; i < s.pasos.size(); i++) {
            paso(f, s.pasos[i]);
            f.traza.add(f.h);
        }
        ultimaTraza = f.traza;
        return f.h;
    }

    // La firma acumulada tras la cabecera y tras cada paso: sirve para ver DÓNDE se separa un plan mal leído.
    var ultimaTraza as Lang.Array<Lang.Number> = [] as Lang.Array<Lang.Number>;

    function paso(f as Acumulador, p as Paso) as Void {
        f.n(p.clase);
        f.n(p.rol);
        f.n(p.fase);
        f.n(p.cierreAtleta ? 1 : 0);
        f.n(p.medTipo);
        f.opc(p.medPrescrito);
        f.n(p.medMide);
        f.n(p.objetivos.size());
        for (var k = 0; k < p.objetivos.size(); k++) {
            var o = p.objetivos[k];
            f.n(o.eje);
            f.n(o.papel);
            f.n(o.avisa);
            f.n(o.escala);
            f.opc(o.min);
            f.opc(o.max);
            f.textoOpc(o.palabra);
        }
        f.n(p.recupera);
        f.n(p.entorno);
        f.n(p.maquina);
        f.n(p.roxzone);
        f.opc(p.damper);
        var pos = p.pos;
        for (var k = 0; k < Cod.N_CONTADOR; k++) {
            if (pos != null && pos[2 * k] != 0) {
                f.n(pos[2 * k]);
                f.n(pos[2 * k + 1]);
            } else {
                f.n(0);
            }
        }
        if (p.slotLetra != 0) {
            f.n(p.slotLetra);
            f.n(p.slotNum);
        } else {
            f.n(0);
        }
        f.opc(p.bloque);
        f.textoOpc(p.nombre);
        if (p.cargaKg != null) {
            f.n(1);
            f.n(p.cargaKg);
            f.n(p.cargaImpl);
        } else {
            f.n(0);
        }
        var t = p.tempo;
        if (t != null) {
            f.n(1);
            for (var k = 0; k < 4; k++) {
                f.n(t[k]);
            }
        } else {
            f.n(0);
        }
        f.textoOpc(p.cue);
        f.opc(p.vueltaAutoM);
        var g = p.grupoId;
        f.n(g == null ? 0 : g + 1);
        f.n(g == null ? 0 : p.grupoVeces);
        f.n(p.wod == null ? 0 : p.wod.formato + 1);
        f.n(p.ficha == null ? 0 : 1);
        f.n(p.dobles == null ? 0 : p.dobles.turno + 1);
    }
}

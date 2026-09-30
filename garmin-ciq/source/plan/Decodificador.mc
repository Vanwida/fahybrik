//
// DECODIFICAR — de los bytes del plan compacto a la `Sesion`. Inversa exacta del
// codificador de referencia (web/components/design-twin/kit-garmin/plan-compacto/
// codificar.ts) escrita en el MISMO orden: cada lectura avanza el cursor, así que
// el orden aquí ES el formato. Se puede leer al lado de decodificar.ts.
//
// Lo que NO hace, a propósito: no adivina. Una versión de esquema que no conoce,
// un código fuera de tabla o bytes que sobran son errores (InvalidValueException),
// nunca un plan «casi bien» en una muñeca. `decodificar` los atrapa y devuelve
// null con el motivo en `Decodificador.error`.
//
using Toybox.Lang;

module Decodificador {

    // El porqué del último plan que no se pudo leer (vacío si fue bien).
    var error as Lang.String = "";

    // Del base64 de la red a la sesión, o null si el plan no se puede leer.
    function decodificar(base64 as Lang.String) as Sesion or Null {
        error = "";
        try {
            return leerSesion(new Lector(Lector.desdeBase64(base64)));
        } catch (ex) {
            error = ex.getErrorMessage() != null ? ex.getErrorMessage() : "plan ilegible";
            return null;
        }
    }

    function leerSesion(r as Lector) as Sesion {
        var version = r.cabecera();
        if (version != Cod.VERSION_ESQUEMA) {
            throw new Lang.InvalidValueException("plan de la versión " + version + "; este reloj entiende la " + Cod.VERSION_ESQUEMA);
        }
        var s = new Sesion();
        s.asignacionId = r.n();
        s.huella = r.n();
        s.fitSport = r.n();
        s.fitSubSport = r.n();
        s.entorno = r.codigo(Cod.N_ENTORNO + 1, "meta.entorno");
        s.duracionEstS = r.n();
        leerZonas(r, s);
        leerBandas(r, s);
        leerReglas(r, s.reglas);
        leerVocab(r, s.vocab);
        leerMetodo(r, s.metodo);
        s.pareja = r.cadenaOpc("plan.pareja");
        var t = leerTablas(r);
        var n = r.n();
        if (n > Cod.MAX_PASOS) {
            throw new Lang.InvalidValueException("plan de " + n + " pasos (máximo " + Cod.MAX_PASOS + ")");
        }
        for (var i = 0; i < n; i++) {
            s.pasos.add(DecodificadorPaso.leerPaso(r, i, t));
        }
        r.fin();
        return s;
    }

    function leerZonas(r as Lector, s as Sesion) as Void {
        var n = r.n();
        if (n == 0) {
            return;
        }
        var techos = [] as Lang.Array<Lang.Number>;
        for (var i = 0; i < n; i++) {
            techos.add(r.n());
        }
        s.zonasTechos = techos;
        s.zonasProcedencia = r.codigo(Cod.N_PROC, "plan.zonas.procedencia");
        if (r.n() != 0) {
            var nombres = [] as Lang.Array<Lang.String>;
            for (var i = 0; i < n; i++) {
                nombres.add(r.cadena("plan.zonas.nombres"));
            }
            s.zonasNombres = nombres;
        }
    }

    function leerBandas(r as Lector, s as Sesion) as Void {
        var n = r.n();
        for (var i = 0; i < n; i++) {
            var b = new Banda();
            b.unidad = r.codigo(Cod.N_UNIDAD, "bandas.unidad");
            b.procedencia = r.codigo(Cod.N_PROC, "bandas.procedencia");
            var nz = r.n();
            for (var k = 0; k < nz; k++) {
                b.rapido.add(r.n());
                b.lento.add(r.opc());
            }
            s.bandas.add(b);
        }
    }

    function leerReglas(r as Lector, x as Reglas) as Void {
        x.holguraRitmo = r.n();
        x.holguraPpm = r.n();
        x.holguraSplit = r.n();
        x.holguraVatios = r.n();
        x.holguraCadencia = r.n();
        x.cadenciaS = r.n();
        x.confirmacionS = r.n();
        x.graciaZonaS = r.n();
        x.preavisoS = r.n();
        x.preavisoM = r.n();
        x.preavisoMinimoS = r.n();
        var f = r.empaquetado(Cod.ANCHOS_FLAGS_REGLAS);
        x.avisarCalentamiento = f[0] == 1;
        x.avisarRecuperacion = f[1] == 1;
    }

    function leerVocab(r as Lector, v as Vocab) as Void {
        var n = r.n();
        for (var i = 0; i < n; i++) {
            v.clases.add(r.codigo(Cod.N_CLASE, "vocabulario.clase"));
            v.nombres.add(r.cadena("vocabulario.clases"));
            v.femenino.add(r.n() == 1);
        }
        for (var i = 0; i < Cod.N_FORMATO; i++) {
            v.formatos.add(r.cadena("vocabulario.formatos"));
        }
        for (var i = 0; i < Cod.NUM_PALABRAS_RPE; i++) {
            v.rpe.add(r.cadena("vocabulario.rpe"));
        }
    }

    function leerMetodo(r as Lector, m as Metodo) as Void {
        m.paresMinimos = r.n();
        m.umbralHechoPct = r.n();
        m.guardarQuietoS = r.n();
        m.repsDeMas = r.n();
        m.rpeMin = r.n();
        m.rpeMax = r.n();
        m.rpePaso = r.n();
        m.rirMin = r.n();
        m.rirMax = r.n();
        m.rirPaso = r.n();
        m.kgMax = r.n();
    }

    // Las tareas del WOD y las listas de tareas: una vez, las citan los pasos.
    function leerTablas(r as Lector) as Tablas {
        var t = new Tablas();
        var nt = r.n();
        for (var i = 0; i < nt; i++) {
            t.tareas.add(DecodificadorPaso.leerTarea(r));
        }
        var nl = r.n();
        for (var i = 0; i < nl; i++) {
            var lista = [] as Lang.Array<Tarea>;
            var largo = r.n();
            for (var k = 0; k < largo; k++) {
                lista.add(t.tarea(r.n()));
            }
            t.listas.add(lista);
        }
        return t;
    }
}

// Las tablas leídas, para que los pasos las citen por índice.
class Tablas {
    var tareas as Lang.Array<Tarea> = [] as Lang.Array<Tarea>;
    var listas as Lang.Array<Lang.Array<Tarea> > = [] as Lang.Array<Lang.Array<Tarea> >;

    function tarea(i as Lang.Number) as Tarea {
        if (i < 0 || i >= tareas.size()) {
            throw new Lang.InvalidValueException("la tarea " + i + " no existe");
        }
        return tareas[i];
    }

    function lista(i as Lang.Number) as Lang.Array<Tarea> {
        if (i < 0 || i >= listas.size()) {
            throw new Lang.InvalidValueException("la lista " + i + " no existe");
        }
        return listas[i];
    }
}

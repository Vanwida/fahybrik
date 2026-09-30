//
// Lo que el reloj COMPONE con los pasos: la línea del brief, el paso en una línea
// («Luego · …») y el contexto de un paso en curso («Serie 3/6 · 1000 m»). El plan
// no trae ningún texto derivado: el reloj lo escribe del dato y del vocabulario
// del coach (los nombres de clase salen del plan, nunca de aquí).
//
using Toybox.Lang;

module Estructura {

    // Cuántos trozos como mucho lleva la línea del brief (la pantalla recorta el resto por el final).
    const MAX_TROZOS_BRIEF = 4;

    // El paso en una línea corta: «1000 m a 3:45-3:55», «r 90 s», «Calentamiento 5 min».
    function pasoCorto(s as Sesion, p as Paso) as Lang.String {
        var pr = Formato.prescrito(p);
        if (p.rol == Cod.ROL_RECUPERACION) {
            return "r " + pr;
        }
        if (p.rol == Cod.ROL_DESCANSO) {
            return s.vocab.nombreClase(p.clase) + " " + pr;
        }
        var o = p.principal();
        var quien = p.nombre != null ? p.nombre + " " : "";
        if (o == null) {
            return quien + (pr.equals("") ? s.vocab.nombreClase(p.clase) : pr);
        }
        var obj = o.eje == Cod.EJE_RPE ? "RPE " + Formato.num(o.min != null ? o.min : (o.max != null ? o.max : 0)) : Formato.objetivo(o);
        return quien + pr + " a " + obj;
    }

    // ¿Cuántos pasos seguidos, desde `i`, comparten el grupo del coach? (1 si no lleva grupo.)
    function largoDeGrupo(s as Sesion, i as Lang.Number) as Lang.Number {
        var g = s.pasos[i].grupoId;
        if (g == null) {
            return 1;
        }
        var n = 1;
        while (i + n < s.pasos.size() && s.pasos[i + n].grupoId != null && s.pasos[i + n].grupoId == g) {
            n++;
        }
        return n;
    }

    // «Calentamiento 5 min · 6 × (1000 m a 3:45-3:55 / r 90 s) · Vuelta a la calma 5 min».
    // Un grupo del coach (`grupo: {id, veces}`) se dice una vez con su repetición.
    function lineaBrief(s as Sesion) as Lang.String {
        var partes = [] as Lang.Array<Lang.String>;
        var i = 0;
        while (i < s.pasos.size() && partes.size() < MAX_TROZOS_BRIEF) {
            var n = largoDeGrupo(s, i);
            var p = s.pasos[i];
            if (p.grupoId != null && p.grupoVeces > 1 && n >= p.grupoVeces) {
                var porVuelta = n / p.grupoVeces;
                var txt = "";
                for (var k = 0; k < porVuelta; k++) {
                    txt += (k > 0 ? " / " : "") + pasoCorto(s, s.pasos[i + k]);
                }
                partes.add(p.grupoVeces + " × (" + txt + ")");
            } else {
                partes.add(nombreConPrescrito(s, p));
                n = 1;
            }
            i += n;
        }
        var linea = "";
        for (var k = 0; k < partes.size(); k++) {
            linea += (k > 0 ? " · " : "") + partes[k];
        }
        return i < s.pasos.size() ? linea + " …" : linea;
    }

    // «Calentamiento 5 min», «Rodaje 50 min a Z2».
    function nombreConPrescrito(s as Sesion, p as Paso) as Lang.String {
        var txt = s.vocab.nombreClase(p.clase);
        var pr = Formato.prescrito(p);
        if (!pr.equals("")) {
            txt += " " + pr;
        }
        var o = p.principal();
        if (o != null && p.rol == Cod.ROL_TRABAJO && (o.eje == Cod.EJE_ZONA || o.eje == Cod.EJE_RPE || o.eje == Cod.EJE_RITMO)) {
            txt += " " + Formato.textoObjetivo(o);
        }
        return txt;
    }

    // Las partes del contexto de un paso, por prioridad (la pantalla quita por el final si no caben).
    function contexto(s as Sesion, p as Paso) as Lang.Array<Lang.String> {
        var nombre = s.vocab.nombreClase(p.clase);
        var partes = [] as Lang.Array<Lang.String>;
        if (p.rol == Cod.ROL_RECUPERACION) {
            partes.add(nombre.equals("") ? "Recupera" : nombre);
            partes.add(p.recupera == Cod.RECUPERA_ANDAR + 1 ? "caminando" : (p.recupera == Cod.RECUPERA_PARADO + 1 ? "parado" : "trote"));
            return partes;
        }
        if (p.rol == Cod.ROL_DESCANSO) {
            partes.add(nombre);
            return partes;
        }
        var pos = p.pos;
        if (pos != null) {
            if (pos[2 * Cod.CONTADOR_TANDA] != 0) {
                partes.add("Tanda " + par(pos, Cod.CONTADOR_TANDA));
            }
            if (pos[2 * Cod.CONTADOR_SERIE] != 0) {
                partes.add(nombre + " " + par(pos, Cod.CONTADOR_SERIE));
            }
            if (pos[2 * Cod.CONTADOR_TRAMO] != 0) {
                partes.add(nombre);
                partes.add("tramo " + par(pos, Cod.CONTADOR_TRAMO));
                return partes;
            }
        }
        if (partes.size() == 0) {
            partes.add(nombre);
        }
        var o = p.principal();
        if ((pos == null || pos[2 * Cod.CONTADOR_SERIE] == 0) && o != null && (o.eje == Cod.EJE_ZONA || o.eje == Cod.EJE_RPE)) {
            partes.add(Formato.objetivo(o));
        }
        var pr = Formato.prescrito(p);
        if (!pr.equals("")) {
            partes.add(pr);
        }
        return partes;
    }

    // «3/6» de un contador de la posición (n se guarda +1).
    function par(pos as Lang.Array<Lang.Number>, contador as Lang.Number) as Lang.String {
        return (pos[2 * contador] - 1) + "/" + pos[2 * contador + 1];
    }
}

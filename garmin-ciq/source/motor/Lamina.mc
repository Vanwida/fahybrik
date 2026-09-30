//
// LA LÁMINA — todo lo que se pinta de un paso de correr, decidido UNA vez por
// segundo (en el tick), no en cada fotograma: la vista solo dibuja lo que ya está
// escrito aquí (el watchdog de Garmin mata una app que trabaja de más en onUpdate).
// Port de laminaDelPaso / heroeDelPaso / bandaDe de kit-reloj/lamina.ts.
//
// P3: el número grande es lo que el coach pide controlar (el ritmo actual, o el
// pulso con su zona); si no hay lectura, lo que falta; si nadie sabe lo que falta,
// lo que llevas. Un ritmo sin GPS se cae a lo siguiente que sí se sabe, jamás a "0:00".
//
using Toybox.Lang;

class Lamina {

    enum {
        HEROE_RITMO,
        HEROE_PULSO,
        HEROE_FALTA,
        HEROE_CRONO
    }

    // Partes del contexto, de la línea completa a la más corta (la vista elige la que cabe).
    var contexto as Lang.Array<Lang.String> = [] as Lang.Array<Lang.String>;
    var nota as Lang.String or Null = null;

    var heroeTipo as Lang.Number = HEROE_CRONO;
    var heroeTexto as Lang.String = "";
    var heroeUnidad as Lang.String or Null = null;
    var heroeEtiqueta as Lang.String or Null = null;
    var heroeZona as Lang.Number = 0;            // zona del pulso si el héroe es el pulso (0 = ninguna)
    var zonasTotal as Lang.Number = 0;

    // La banda del objetivo, en milésimas del ancho (0 = suave, 1000 = fuerte).
    var hayBanda as Lang.Boolean = false;
    var bandaDesde as Lang.Number = 0;
    var bandaHasta as Lang.Number = 0;
    var bandaMarca as Lang.Number = -1;          // -1 = sin lectura
    var bandaRotulo as Lang.String = "";
    var bandaPalabra as Lang.String or Null = null;
    var bandaDir as Lang.Number = 0;             // 0 sin marca · 1 ▲ · 2 ▼
    var bandaFuera as Lang.Boolean = false;

    var instruccion as Lang.String or Null = null;   // «RPE 7 · fuerte»: lo que no es un número vivo

    var segundoEtiqueta as Lang.String or Null = null;
    var segundoValor as Lang.String or Null = null;
    var segundoUnidad as Lang.String or Null = null;

    // El pie: el pulso (con su zona) o, si el héroe es el pulso, el ritmo.
    var pieValor as Lang.String or Null = null;
    var pieUnidad as Lang.String or Null = null;
    var pieCorazon as Lang.Boolean = false;
    var pieZona as Lang.Number = 0;
    var pieAviso as Lang.String or Null = null;  // «alto» si el techo de pulso está pasado
}

module Laminar {

    const MILESIMAS = 1000;
    // Margen mínimo de la escala lineal de una banda, en décimas (10 unidades).
    const MARGEN_MIN_DECI = 100;
    // Ancho por defecto de una banda con un solo extremo, en décimas (20 unidades).
    const ANCHO_ABIERTA_DECI = 200;

    // Lo que falta del paso en su unidad (s o m); null = nadie lo sabe.
    function falta(p as Paso, t as Lang.Number, hechoM as Lang.Number or Null) as Lang.Number or Null {
        var pr = p.medPrescrito;
        if (pr == null || p.medTipo == Cod.MEDIDA_ABIERTA) {
            return null;
        }
        if (p.medTipo == Cod.MEDIDA_TIEMPO) {
            return pr > t ? pr - t : 0;
        }
        if (p.medTipo == Cod.MEDIDA_DISTANCIA && hechoM != null) {
            return pr > hechoM ? pr - hechoM : 0;
        }
        return null;
    }

    function esCarrera(p as Paso) as Lang.Boolean {
        return Clases.corre(p.clase) || p.medMide == Cod.MIDE_GPS || p.medMide == Cod.MIDE_CINTA || p.entorno != 0;
    }

    // Rellena `lam` con lo que pinta el paso `p` de la sesión `s`. t = segundos del paso.
    function componer(lam as Lamina, s as Sesion, p as Paso, sig as Paso or Null, l as Juez.Lectura, t as Lang.Number, hechoM as Lang.Number or Null, gpsBuscando as Lang.Boolean) as Void {
        var o = p.principal();
        lam.contexto = variantes(Estructura.contexto(s, p));
        lam.zonasTotal = s.zonasTechos == null ? 0 : s.zonasTechos.size();
        var f = falta(p, t, hechoM);

        // ── héroe ────────────────────────────────────────────────────────────
        lam.heroeEtiqueta = null;
        lam.heroeUnidad = null;
        lam.heroeZona = 0;
        var objetivoVivo = false;
        if (p.rol == Cod.ROL_TRABAJO && o != null) {
            if ((o.eje == Cod.EJE_RITMO || Juez.zonaDeRitmo(o)) && l.ritmo != null && !Formato.ritmo(l.ritmo).equals(Formato.SIN_DATO)) {
                lam.heroeTipo = Lamina.HEROE_RITMO;
                lam.heroeTexto = Formato.ritmo(l.ritmo);
                lam.heroeUnidad = "/km";
                objetivoVivo = true;
            } else if (Juez.esPulso(o)) {
                lam.heroeTipo = Lamina.HEROE_PULSO;
                lam.heroeTexto = l.ppm == null ? Formato.SIN_DATO : ((l.ppm + 5) / Formato.DECI).toString();
                lam.heroeUnidad = "ppm";
                lam.heroeZona = (l.ppm != null && s.zonasTechos != null) ? Juez.zonaDe((l.ppm + 5) / Formato.DECI, s.zonasTechos) : 0;
                objetivoVivo = true;
            }
        }
        if (!objetivoVivo) {
            if (f == null) {
                lam.heroeTipo = Lamina.HEROE_CRONO;
                lam.heroeTexto = Formato.reloj(t);
                lam.heroeEtiqueta = "llevas";
            } else {
                lam.heroeTipo = Lamina.HEROE_FALTA;
                textoFalta(lam, p, f);
                lam.heroeEtiqueta = "quedan";
            }
        }

        // ── banda o instrucción ──────────────────────────────────────────────
        lam.hayBanda = false;
        lam.bandaPalabra = null;
        lam.bandaDir = 0;
        lam.bandaFuera = false;
        lam.instruccion = null;
        if (o != null && p.rol == Cod.ROL_TRABAJO) {
            if (o.eje == Cod.EJE_RPE) {
                lam.instruccion = Formato.objetivo(o) + " · " + Formato.palabraRpe(o, s.vocab);
            } else if (o.eje == Cod.EJE_KG || o.eje == Cod.EJE_PCTRM || o.eje == Cod.EJE_RIR || o.eje == Cod.EJE_INCLINACION) {
                lam.instruccion = Formato.objetivo(o);
            } else {
                banda(lam, o, Juez.valorDe(o, l), s);
                var ver = Juez.veredictoPrincipal(p, l, s);
                if (lam.hayBanda && ver != Juez.VER_NINGUNO) {
                    lam.bandaFuera = ver != Juez.VER_DENTRO;
                    lam.bandaDir = ver == Juez.VER_ENCIMA ? 1 : (ver == Juez.VER_DEBAJO ? 2 : 0);
                    // Fuera, la palabra va siempre; dentro, solo si la banda no es de zonas (como en la muñeca).
                    lam.bandaPalabra = ver == Juez.VER_DENTRO ? (o.eje == Cod.EJE_ZONA ? null : "dentro") : Juez.palabra(o, ver);
                }
            }
        }

        // Recuperar o descansar: no se juzga nada; se dice lo que viene («Luego · …»).
        if (p.rol != Cod.ROL_TRABAJO && sig != null) {
            lam.instruccion = "Luego · " + Estructura.pasoCorto(s, sig);
        }

        // ── segundo y pie ────────────────────────────────────────────────────
        lam.segundoValor = null;
        lam.pieValor = null;
        lam.pieAviso = null;
        lam.pieZona = 0;
        lam.pieCorazon = false;
        lam.pieUnidad = null;
        if (objetivoVivo) {
            if (f != null) {
                lam.segundoEtiqueta = "quedan";
                lam.segundoValor = valorFalta(p, f);
                lam.segundoUnidad = unidadFalta(p, f);
            }
            if (lam.heroeTipo == Lamina.HEROE_PULSO) {
                if (esCarrera(p)) {
                    lam.pieValor = Formato.ritmo(l.ritmo);
                    lam.pieUnidad = "/km";
                }
            } else {
                pie(lam, p, l, s);
            }
        } else {
            if (lam.instruccion == null && !lam.hayBanda && esCarrera(p) && p.rol == Cod.ROL_TRABAJO) {
                lam.segundoEtiqueta = null;
                lam.segundoValor = Formato.ritmo(l.ritmo);
                lam.segundoUnidad = "/km";
            }
            pie(lam, p, l, s);
        }

        // ── nota: honestidad o cue del coach ────────────────────────────────
        lam.nota = null;
        if (gpsBuscando && esCarrera(p)) {
            lam.nota = "GPS · buscando";
        } else if (p.cue != null) {
            lam.nota = "Coach · " + p.cue;
        } else if (p.entorno == Cod.ENTORNO_CINTA + 1) {
            var incl = p.objetivoDe(Cod.PAPEL_SECUNDARIO);
            lam.nota = incl != null && incl.eje == Cod.EJE_INCLINACION && incl.min != null ? "Cinta · " + Formato.num(incl.min) + " %" : "Cinta";
        } else if (p.entorno == Cod.ENTORNO_PISTA + 1) {
            lam.nota = "Pista";
        }
    }

    // La línea del pulso, con su zona y «alto» si el techo está pasado.
    function pie(lam as Lamina, p as Paso, l as Juez.Lectura, s as Sesion) as Void {
        lam.pieCorazon = true;
        lam.pieValor = l.ppm == null ? Formato.SIN_DATO : ((l.ppm + 5) / Formato.DECI).toString();
        lam.pieUnidad = "ppm";
        lam.pieZona = (l.ppm != null && s.zonasTechos != null) ? Juez.zonaDe((l.ppm + 5) / Formato.DECI, s.zonasTechos) : 0;
        var techo = p.objetivoDe(Cod.PAPEL_TECHO);
        if (l.ppm != null && techo != null && Juez.esPulso(techo) && Juez.techoPasado(p, l, s)) {
            lam.pieAviso = "alto";
        }
    }

    function textoFalta(lam as Lamina, p as Paso, f as Lang.Number) as Void {
        lam.heroeTexto = valorFalta(p, f);
        lam.heroeUnidad = unidadFalta(p, f);
    }

    function valorFalta(p as Paso, f as Lang.Number) as Lang.String {
        if (p.medTipo == Cod.MEDIDA_DISTANCIA) {
            return Formato.distanciaValor(f);
        }
        return Formato.reloj(f);
    }

    function unidadFalta(p as Paso, f as Lang.Number) as Lang.String or Null {
        return p.medTipo == Cod.MEDIDA_DISTANCIA ? Formato.distanciaUnidad(f) : null;
    }

    // De las partes del contexto, las variantes «todo», «sin la última»… (la vista pone la que cabe).
    function variantes(partes as Lang.Array<Lang.String>) as Lang.Array<Lang.String> {
        var out = [] as Lang.Array<Lang.String>;
        for (var n = partes.size(); n >= 1; n--) {
            var txt = "";
            for (var k = 0; k < n; k++) {
                txt += (k > 0 ? " · " : "") + partes[k];
            }
            out.add(txt);
        }
        return out;
    }

    // ── la banda del objetivo ────────────────────────────────────────────────

    function acotar(x as Lang.Number) as Lang.Number {
        return x < 0 ? 0 : (x > MILESIMAS ? MILESIMAS : x);
    }

    // La banda de un objetivo numérico sobre su escala de INTENSIDAD (izquierda suave, derecha fuerte).
    function banda(lam as Lamina, o as Objetivo, valor as Lang.Number or Null, s as Sesion) as Void {
        lam.hayBanda = false;
        lam.bandaMarca = -1;
        // Zonas de pulso: la banda es el espectro del coach y la marca cae dentro de su zona.
        if (o.eje == Cod.EJE_ZONA && !Juez.zonaDeRitmo(o) && s.zonasTechos != null) {
            var t = s.zonasTechos;
            var n = t.size();
            var zMin = o.papel == Cod.PAPEL_TECHO ? 1 : (o.min != null ? o.min / Formato.DECI : 1);
            var zMax = o.max != null ? o.max / Formato.DECI : n;
            if (zMin < 1 || zMax > n || zMin > zMax) {
                return;
            }
            lam.bandaDesde = (zMin - 1) * MILESIMAS / n;
            lam.bandaHasta = zMax * MILESIMAS / n;
            if (valor != null) {
                var bpm = (valor + 5) / Formato.DECI;
                var k = Juez.zonaDe(bpm, t);
                var lo = Juez.sueloZona(k, t);
                var hi = t[k - 1];
                var dentro = acotar((bpm - lo) * MILESIMAS / (hi - lo > 1 ? hi - lo : 1));
                lam.bandaMarca = acotar(((k - 1) * MILESIMAS + dentro) / n);
                lam.bandaRotulo = posicionZona(bpm, o, s);
            } else {
                lam.bandaRotulo = Formato.objetivo(o);
            }
            lam.hayBanda = true;
            return;
        }
        var r = Juez.rango(o, s);
        var lo = r[0];
        var hi = r[1];
        if (lo == null && hi == null) {
            return;
        }
        // Un objetivo de valor único se pinta con la holgura del coach como banda.
        var holgura = Juez.holguraDe(o, s.reglas);
        if (lo != null && hi != null && lo == hi && holgura > 0 && o.eje != Cod.EJE_ZONA) {
            lo = lo - holgura;
            hi = hi + holgura;
        }
        var a = lo != null ? lo : hi - ANCHO_ABIERTA_DECI;
        var b = hi != null ? hi : lo + ANCHO_ABIERTA_DECI;
        var margen = b - a > MARGEN_MIN_DECI ? b - a : MARGEN_MIN_DECI;
        var bajo = a - margen;
        var alto = b + margen;
        var inverso = Juez.esInverso(o);
        var pa = posicion(a, bajo, alto, inverso);
        var pb = posicion(b, bajo, alto, inverso);
        var menor = pa < pb ? pa : pb;
        var mayor = pa < pb ? pb : pa;
        // Un extremo sin límite deja la banda abierta por ese lado: en un ritmo, «sin límite lento»
        // la abre hacia lo suave (izquierda) y «sin límite rápido» hacia lo fuerte (derecha).
        if (inverso) {
            lam.bandaDesde = hi == null ? 0 : menor;
            lam.bandaHasta = lo == null ? MILESIMAS : mayor;
        } else {
            lam.bandaDesde = lo == null ? 0 : menor;
            lam.bandaHasta = hi == null ? MILESIMAS : mayor;
        }
        lam.bandaMarca = valor == null ? -1 : posicion(valor, bajo, alto, inverso);
        lam.bandaRotulo = Formato.objetivo(o);
        lam.hayBanda = true;
    }

    function posicion(x as Lang.Number, bajo as Lang.Number, alto as Lang.Number, inverso as Lang.Boolean) as Lang.Number {
        var ancho = alto - bajo > 0 ? alto - bajo : 1;
        return acotar(inverso ? (alto - x) * MILESIMAS / ancho : (x - bajo) * MILESIMAS / ancho);
    }

    // «Z2 · a 6 de Z3» (dentro, cuánto falta para el techo), «Z3 · a 5 de Z4» (por debajo),
    // «Z4 · 3 sobre Z3» (por encima), «Z5 · dentro».
    function posicionZona(bpm as Lang.Number, o as Objetivo, s as Sesion) as Lang.String {
        var t = s.zonasTechos as Lang.Array<Lang.Number>;
        var actual = Juez.zonaDe(bpm, t);
        var r = Juez.rango(o, s);
        var lo = r[0] == null ? null : r[0] / Formato.DECI;
        var hi = r[1] == null ? null : r[1] / Formato.DECI;
        var zMax = o.max != null ? o.max / Formato.DECI : actual;
        if (hi != null && bpm > hi) {
            return "Z" + actual + " · " + (bpm - hi) + " sobre Z" + zMax;
        }
        if (lo != null && bpm < lo) {
            return "Z" + actual + " · a " + (lo - bpm) + " de Z" + (o.min / Formato.DECI);
        }
        if (hi != null && zMax < t.size()) {
            return "Z" + actual + " · a " + (hi + 1 - bpm) + " de Z" + (zMax + 1);
        }
        return "Z" + actual + " · dentro";
    }
}

//
// DECODIFICAR UN PASO — el resto de decodificar.ts: tareas, objetivos, posición,
// WOD, ficha de fuerza y dobles. Mismo orden que el codificador, campo a campo.
// El reloj v1 solo GUÍA correr, pero lee todos los campos del formato: una
// sesión que no soporta se reconoce por sus pasos (`Sesion.soportada`) y el
// cursor tiene que llegar al final igual.
//
using Toybox.Lang;

module DecodificadorPaso {

    // Código de un campo opcional de tabla: 0 = sin dato, si no índice + 1 (se valida contra la tabla).
    function opcionalDeTabla(codigo as Lang.Number, max as Lang.Number, donde as Lang.String) as Lang.Number {
        if (codigo > max) {
            throw new Lang.InvalidValueException(donde + ": código " + codigo + " fuera de la tabla (" + max + ")");
        }
        return codigo;
    }

    function enTabla(codigo as Lang.Number, max as Lang.Number, donde as Lang.String) as Lang.Number {
        if (codigo >= max) {
            throw new Lang.InvalidValueException(donde + ": código " + codigo + " fuera de la tabla (" + max + ")");
        }
        return codigo;
    }

    function leerTarea(r as Lector) as Tarea {
        var t = new Tarea();
        t.nombre = r.cadena("tarea.nombre");
        var f = r.empaquetado(Cod.ANCHOS_TAREA);   // dosis · carga · corporal · corre · mide
        t.mide = enTabla(f[4], Cod.N_MIDE, "tarea.mide");
        if (f[0] == 1) {
            var m = r.empaquetado(Cod.ANCHOS_MEDIDA);
            t.dosisTipo = enTabla(m[0], Cod.N_MEDIDA, "tarea.dosis.tipo");
            t.dosisMide = enTabla(m[1], Cod.N_MIDE, "tarea.dosis.mide");
            t.dosisPrescrito = r.opc();
        }
        if (f[1] == 1) {
            t.cargaKg = r.n();
            t.cargaImpl = r.n();
        }
        t.corporal = f[2] == 1;
        t.corre = f[3] == 1;
        return t;
    }

    function leerObjetivo(r as Lector, k as Lang.Number) as Objetivo {
        var f = r.empaquetado(Cod.ANCHOS_OBJETIVO);   // eje · papel · lleva palabra · avisa · escala
        var o = new Objetivo();
        o.eje = enTabla(f[0], Cod.N_EJE, "objetivo.eje");
        o.papel = enTabla(f[1], Cod.N_PAPEL, "objetivo.papel");
        o.min = r.opc();
        o.max = r.opc();
        o.avisa = opcionalDeTabla(f[3], Cod.N_AVISA, "objetivo.avisa");
        if (f[2] == 1) {
            o.palabra = r.cadena("objetivo.palabra");
        }
        o.escala = opcionalDeTabla(f[4], Cod.N_ESCALA, "objetivo.escala");
        return o;
    }

    function leerPosicion(r as Lector, p as Paso) as Void {
        var mascara = r.empaquetado(Cod.ANCHOS_POSICION);
        var pos = [] as Lang.Array<Lang.Number>;
        for (var k = 0; k < Cod.N_CONTADOR; k++) {
            if (mascara[k] == 1) {
                pos.add(r.n() + 1);   // n (1-based; 0 = falta)
                pos.add(r.n());       // de
            } else {
                pos.add(0);
                pos.add(0);
            }
        }
        p.pos = pos;
        if (mascara[Cod.N_CONTADOR] == 1) {
            p.slotLetra = r.n();
            p.slotNum = r.n();
        }
    }

    function leerWod(r as Lector, t as Tablas) as Wod {
        var w = new Wod();
        w.formato = enTabla(r.n(), Cod.N_WOD, "wod.formato");
        if (w.formato == Cod.WOD_EMOM) {
            w.lista = t.lista(r.n());
            var i = r.n();
            if (i >= w.lista.size()) {
                throw new Lang.InvalidValueException("la tarea del EMOM no está en su ciclo");
            }
            w.tarea = w.lista[i];
            w.v = [r.n(), r.n()];
        } else if (w.formato == Cod.WOD_AMRAP || w.formato == Cod.WOD_PUNTUACION) {
            w.lista = t.lista(r.n());
            w.v = [r.n()];
        } else if (w.formato == Cod.WOD_FORTIME) {
            var i = r.opc();
            w.tarea = i == null ? null : t.tarea(i);
            w.v = [r.opc()];
        } else if (w.formato == Cod.WOD_PARED) {
            w.v = [r.n(), r.n(), r.n()];
        } else {
            w.tarea = t.tarea(r.n());
            w.v = [r.n(), r.n(), r.n(), r.opc()];
        }
        return w;
    }

    function leerFicha(r as Lector) as Ficha {
        var f = new Ficha();
        f.ejercicio = r.n();
        f.cargaTipo = enTabla(r.n(), Cod.N_CARGA, "ficha.carga.tipo");
        if (f.cargaTipo == Cod.CARGA_KG) {
            f.c = [r.n(), r.n()];
        } else if (f.cargaTipo == Cod.CARGA_RM) {
            f.c = [r.n(), r.n(), r.opc()];
        } else if (f.cargaTipo == Cod.CARGA_TUYA) {
            f.c = [r.opc(), r.n()];
        }
        var e = r.n();
        if (e != 0) {
            f.esfuerzoEje = enTabla(e - 1, Cod.N_ESFUERZO, "ficha.esfuerzo") + 1;
            f.esfuerzoMin = r.n();
            f.esfuerzoMax = r.n();
        }
        var x = r.empaquetado(Cod.ANCHOS_FICHA);   // por lado · aproximación · barra vacía
        f.pasoKg = r.n();
        f.porLado = opcionalDeTabla(x[0], Cod.N_LADO, "ficha.porLado");
        f.aproximacion = x[1] == 1;
        if (x[2] == 1) {
            f.vaciaKg = r.n();
        }
        return f;
    }

    function leerDobles(r as Lector) as Dobles {
        var d = new Dobles();
        d.turno = enTabla(r.n(), Cod.N_TURNO, "dobles.turno");
        d.tuyas = r.opc();
        d.suyas = r.opc();
        d.pctTuyo = r.n();
        var a = r.n();
        if (a != 0) {
            d.alternaTipo = enTabla(a - 1, Cod.N_ALTERNA, "dobles.alterna");
            d.alternaN = r.n();
        }
        return d;
    }

    // El paso i-ésimo del plan.
    function leerPaso(r as Lector, i as Lang.Number, t as Tablas) as Paso {
        var p = new Paso();
        p.clase = enTabla(r.n(), Cod.N_CLASE, "paso.clase");
        var rf = r.empaquetado(Cod.ANCHOS_ROL_FASE);   // rol · fase · cierre por el atleta
        p.rol = enTabla(rf[0], Cod.N_ROL, "paso.rol");
        p.fase = enTabla(rf[1], Cod.N_FASE, "paso.fase");
        p.cierreAtleta = rf[2] == 1;
        var m = r.empaquetado(Cod.ANCHOS_MEDIDA);
        p.medTipo = enTabla(m[0], Cod.N_MEDIDA, "paso.medida.tipo");
        p.medMide = enTabla(m[1], Cod.N_MIDE, "paso.medida.mide");
        p.medPrescrito = r.opc();

        var b = r.empaquetado(Cod.ANCHOS_BANDERAS_PASO);   // nº de objetivos · una bandera por sección
        var nObj = b[0];
        if (nObj > Cod.MAX_OBJETIVOS) {
            throw new Lang.InvalidValueException("paso " + i + ": " + nObj + " objetivos");
        }
        // b[1 + Cod.BANDERA_*] es la bandera de esa sección.
        if (b[1 + Cod.BANDERA_EXTRAS] == 1) {
            var x = r.empaquetado(Cod.ANCHOS_EXTRAS);   // recupera · entorno · máquina · Roxzone
            p.recupera = opcionalDeTabla(x[0], Cod.N_RECUPERA, "paso.recupera");
            p.entorno = opcionalDeTabla(x[1], Cod.N_ENTORNO, "paso.entorno");
            p.maquina = opcionalDeTabla(x[2], Cod.N_MAQUINA, "paso.maquina");
            p.roxzone = opcionalDeTabla(x[3], Cod.N_ROXZONA, "paso.roxzone");
        }
        for (var k = 0; k < nObj; k++) {
            p.objetivos.add(leerObjetivo(r, k));
        }
        if (b[1 + Cod.BANDERA_POSICION] == 1) {
            leerPosicion(r, p);
        }
        if (b[1 + Cod.BANDERA_BLOQUE] == 1) {
            p.bloque = r.n();
        }
        if (b[1 + Cod.BANDERA_NOMBRE] == 1) {
            p.nombre = r.cadena("paso.nombre");
        }
        if (b[1 + Cod.BANDERA_CARGA] == 1) {
            p.cargaKg = r.n();
            p.cargaImpl = r.n();
        }
        if (b[1 + Cod.BANDERA_TEMPO] == 1) {
            p.tempo = [r.n(), r.n(), r.n(), r.n()];
        }
        if (b[1 + Cod.BANDERA_CUE] == 1) {
            p.cue = r.cadena("paso.cue");
        }
        if (b[1 + Cod.BANDERA_VUELTAAUTO] == 1) {
            p.vueltaAutoM = r.n();
        }
        if (b[1 + Cod.BANDERA_DAMPER] == 1) {
            if (p.maquina == 0) {
                throw new Lang.InvalidValueException("paso " + i + ": damper sin máquina");
            }
            p.damper = r.n();
        }
        if (b[1 + Cod.BANDERA_WOD] == 1) {
            p.wod = leerWod(r, t);
        }
        if (b[1 + Cod.BANDERA_FUERZA] == 1) {
            p.ficha = leerFicha(r);
        }
        if (b[1 + Cod.BANDERA_DOBLES] == 1) {
            p.dobles = leerDobles(r);
        }
        if (b[1 + Cod.BANDERA_GRUPO] == 1) {
            p.grupoId = r.n();
            p.grupoVeces = r.n();
        }
        return p;
    }
}

//
// EL MOTOR DE CORRER — la sesión en curso, paso a paso.
//
// Lo llama el Controller cada segundo (`tick`) y en cada tecla. Sabe qué paso toca,
// cuánto lleva, cuánto falta, cuándo cerrarlo, contra qué se juzga y qué avisa. No
// pinta (deja una `Lamina` escrita) y no decide método: umbrales, holguras,
// cadencia, preaviso y vuelta automática vienen en el plan (G12).
//
// Relojes: desde anclas de `System.getTimer()`, jamás contando ticks (un tick
// puede llegar tarde y el reloj tiene que seguir siendo verdad). Los relojes de la
// SESIÓN no cuentan la pausa.
//
using Toybox.Activity;
using Toybox.Lang;
using Toybox.Position;
using Toybox.System;

class Motor {

    // Cuánto dura la ventana en la que se puede deshacer un cierre a mano (G3/G4).
    const DESHACER_MS = 5000;
    // Cada cuánto se guarda un checkpoint de la sesión aunque no cambie el paso (G10).
    const CHECKPOINT_S = 30;
    const EXTRA_DESCANSO_S = 30;
    const BATERIA_BAJA_PCT = 10;
    // Segundos que una pérdida o vuelta de GPS o pulso ha de sostenerse antes de avisar (evita el parpadeo).
    const DEBOUNCE_S = 3;
    // Segundos que la tarjeta de la vuelta automática se queda sobre el paso.
    const TARJETA_VUELTA_S = 5;
    const MS = 1000;
    const DECI = 10;
    const DM_POR_M = 10;
    const NO_PAUSA = -1;

    // Campos de un tramo cerrado (fila plana con paso `T_LARGO`).
    enum {
        T_PASO,
        T_INICIO_S,
        T_DUR_S,
        T_DIST_M,
        T_PPM_SUMA,
        T_PPM_N,
        T_PPM_MAX,
        T_CIERRE,
        T_VEREDICTO,        // 0 = no se juzgó; si no, Juez.VER_* + 1
        T_LARGO
    }

    enum {
        CIERRE_MEDIDA,
        CIERRE_ATLETA,
        CIERRE_SALTADO,
        CIERRE_INCOMPLETO   // se terminó a mitad de este paso
    }

    // Filas de una vuelta: [tipo (0 paso, 1 automática), segundos, metros, ritmo deci (0 = sin dato)].
    enum {
        V_TIPO,
        V_SEG,
        V_M,
        V_RITMO,
        V_LARGO
    }

    var s as Sesion;
    var i as Lang.Number;
    var grabacion as Grabacion;
    var ritmo as Ritmo;
    var lectura as Juez.Lectura;
    var lamina as Lamina;
    var aviso as Juez.EstadoAviso;
    var lote as Avisos.Lote;

    // La sesión (started_at se fija y guarda ANTES de grabar; el reintento manda el mismo).
    var inicioEpoch as Lang.Number;
    var relojInicioMs as Lang.Number;
    var pausadoAcumMs as Lang.Number;
    var pausaDesdeMs as Lang.Number;
    var ultimoCheckpointS as Lang.Number;

    // El paso en curso.
    var pasoInicioSesMs as Lang.Number;
    var pasoInicioDm as Lang.Number;
    var extraS as Lang.Number;
    var preavisado as Lang.Boolean;
    var pasoDentroS as Lang.Number;
    var pasoArribaS as Lang.Number;
    var pasoAbajoS as Lang.Number;
    var pasoPpmSuma as Lang.Number;
    var pasoPpmN as Lang.Number;
    var pasoPpmMax as Lang.Number;

    // La sesión entera.
    var sesDm as Lang.Number;
    // Metros (en decímetros) de una grabación anterior de esta misma sesión (si se sigue tras una interrupción).
    var dmBase as Lang.Number;
    var sesPpmSuma as Lang.Number;
    var sesPpmN as Lang.Number;
    var sesPpmMax as Lang.Number;
    var tramos as Lang.Array<Lang.Number>;
    var vueltas as Lang.Array<Lang.Number>;
    var vueltaN as Lang.Number;
    var vueltaDesdeMs as Lang.Number;
    var vueltaDesdeDm as Lang.Number;
    var terminado as Lang.Boolean;
    var completa as Lang.Boolean;

    // El aviso de cierre a mano y su deshacer (también al cerrar el último paso).
    var deshacerHasta as Lang.Number;
    var deshacerTexto as Lang.String;
    var cerrandoUltimo as Lang.Boolean;
    var uI as Lang.Number;
    var uPasoInicioSesMs as Lang.Number;
    var uPasoInicioDm as Lang.Number;
    var uExtraS as Lang.Number;
    var uPreavisado as Lang.Boolean;
    var uFuera as Lang.Number;
    var uDesde as Lang.Number;
    var uUltimo as Lang.Number or Null;
    var uTramos as Lang.Number;
    var uVueltas as Lang.Number;

    // La tarjeta de la vuelta automática y el estado de los sensores.
    var tarjetaHasta as Lang.Number;
    var tarjetaTitulo as Lang.String;
    var tarjetaValor as Lang.String;
    var tarjetaPie as Lang.String;
    var gpsListo as Lang.Boolean;
    var gpsCambioS as Lang.Number;
    var pulsoTuvo as Lang.Boolean;
    var pulsoCambioS as Lang.Number;
    var bateriaAvisada as Lang.Boolean;
    var sinGrabar as Lang.Boolean;

    // Páginas del vivo: 0 Paso · 1 Datos · 2 Vueltas · 3 Estructura.
    var pagina as Lang.Number;
    var filas as Lang.Array<Lang.String>;

    function initialize(sesion as Sesion, inicio as Lang.Number, graba as Grabacion) {
        s = sesion;
        i = 0;
        grabacion = graba;
        ritmo = new Ritmo();
        lectura = new Juez.Lectura();
        lamina = new Lamina();
        aviso = new Juez.EstadoAviso();
        lote = new Avisos.Lote();
        inicioEpoch = inicio;
        relojInicioMs = System.getTimer();
        pausadoAcumMs = 0;
        pausaDesdeMs = NO_PAUSA;
        ultimoCheckpointS = 0;
        pasoInicioSesMs = 0;
        pasoInicioDm = 0;
        extraS = 0;
        preavisado = false;
        pasoDentroS = 0;
        pasoArribaS = 0;
        pasoAbajoS = 0;
        pasoPpmSuma = 0;
        pasoPpmN = 0;
        pasoPpmMax = 0;
        sesDm = 0;
        dmBase = 0;
        sesPpmSuma = 0;
        sesPpmN = 0;
        sesPpmMax = 0;
        tramos = [] as Lang.Array<Lang.Number>;
        vueltas = [] as Lang.Array<Lang.Number>;
        vueltaN = 0;
        vueltaDesdeMs = 0;
        vueltaDesdeDm = 0;
        terminado = false;
        completa = false;
        deshacerHasta = 0;
        deshacerTexto = "";
        cerrandoUltimo = false;
        uI = 0;
        uPasoInicioSesMs = 0;
        uPasoInicioDm = 0;
        uExtraS = 0;
        uPreavisado = false;
        uFuera = 0;
        uDesde = 0;
        uUltimo = null;
        uTramos = 0;
        uVueltas = 0;
        tarjetaHasta = 0;
        tarjetaTitulo = "";
        tarjetaValor = "";
        tarjetaPie = "";
        gpsListo = true;
        gpsCambioS = 0;
        pulsoTuvo = false;
        pulsoCambioS = 0;
        bateriaAvisada = false;
        sinGrabar = false;
        pagina = 0;
        filas = [] as Lang.Array<Lang.String>;
    }

    // ── relojes ──────────────────────────────────────────────────────────────

    function pausado() as Lang.Boolean {
        return pausaDesdeMs != NO_PAUSA;
    }

    // ms de sesión: no cuentan la pausa.
    function sesionMs() as Lang.Number {
        var ahora = pausado() ? pausaDesdeMs : System.getTimer();
        return ahora - relojInicioMs - pausadoAcumMs;
    }

    function sesionS() as Lang.Number {
        return sesionMs() / MS;
    }

    function pasoS() as Lang.Number {
        return (sesionMs() - pasoInicioSesMs) / MS;
    }

    function pasoActual() as Paso {
        return s.pasos[i];
    }

    function hechoM() as Lang.Number {
        return (sesDm - pasoInicioDm) / DM_POR_M;
    }

    // ── arranque ─────────────────────────────────────────────────────────────

    // Empieza el paso 0 (al terminar la cuenta atrás): aquí arranca la grabación.
    function arrancar() as Void {
        sinGrabar = !grabacion.iniciar();
        relojInicioMs = System.getTimer();
        iniciarPaso(0);
        tick();
    }

    // Sigue una sesión interrumpida (G10): NUEVA grabación, MISMA sesión (mismo started_at y assignment_id;
    // el servidor las une). Retoma en el paso donde iba, con lo cerrado hasta el checkpoint.
    function restaurar(chk as Lang.Dictionary) as Void {
        var paso = Json.num(chk, "paso", 0);
        i = paso < s.pasos.size() ? paso : s.pasos.size() - 1;
        var t = chk.get("tramos");
        tramos = t instanceof Lang.Array ? t : [] as Lang.Array<Lang.Number>;
        var v = chk.get("vueltas");
        vueltas = v instanceof Lang.Array ? v : [] as Lang.Array<Lang.Number>;
        dmBase = Json.num(chk, "dm", 0);
        sesDm = dmBase;
        sesPpmSuma = Json.num(chk, "ppmS", 0);
        sesPpmN = Json.num(chk, "ppmN", 0);
        sesPpmMax = Json.num(chk, "ppmM", 0);
        var ya = Json.num(chk, "sesS", 0) * MS;
        relojInicioMs = System.getTimer() - ya;
        vueltaDesdeMs = ya;
        vueltaDesdeDm = dmBase;
        for (var k = 0; k + V_LARGO <= vueltas.size(); k += V_LARGO) {
            vueltaN += vueltas[k + V_TIPO] == 1 ? 1 : 0;
        }
        sinGrabar = !grabacion.iniciar();
        iniciarPaso(sesionMs());
        tick();
    }

    function iniciarPaso(desdeMs as Lang.Number) as Void {
        pasoInicioSesMs = desdeMs;
        pasoInicioDm = sesDm;
        extraS = 0;
        preavisado = false;
        pasoDentroS = 0;
        pasoArribaS = 0;
        pasoAbajoS = 0;
        pasoPpmSuma = 0;
        pasoPpmN = 0;
        pasoPpmMax = 0;
        aviso.reiniciar(0);
        var o = pasoActual().principal();
        grabacion.fijarPaso(i, o == null ? null : o.min);
        armarFilas();
        guardarCheckpoint();
    }

    // ── el segundo ───────────────────────────────────────────────────────────

    function tick() as Void {
        if (terminado) {
            return;
        }
        var p = pasoActual();
        var nowMs = sesionMs();
        var info = Activity.getActivityInfo();
        if (info != null && info.elapsedDistance != null) {
            sesDm = dmBase + (info.elapsedDistance * DM_POR_M).toNumber();
        }
        var hr = info != null ? info.currentHeartRate : null;
        lectura.ppm = hr == null ? null : hr * DECI;

        if (!pausado()) {
            ritmo.agregar(nowMs, sesDm);
            if (hr != null) {
                sesPpmSuma += hr;
                sesPpmN++;
                pasoPpmSuma += hr;
                pasoPpmN++;
                sesPpmMax = hr > sesPpmMax ? hr : sesPpmMax;
                pasoPpmMax = hr > pasoPpmMax ? hr : pasoPpmMax;
            }
        }
        lectura.ritmo = ritmo.deci();

        vigilarSensores(hr);
        if (!pausado()) {
            if (cerrandoUltimo) {
                // El último paso se cerró a mano: si pasan 5 s sin deshacer, la sesión termina de verdad.
                if (System.getTimer() >= deshacerHasta) {
                    terminarNatural();
                    Avisos.emitir(lote);
                    lote.limpiar();
                    return;
                }
            } else {
                eventosDelSegundo(p, nowMs);
            }
        }
        if (!terminado) {
            componer();
        }
        checkpointSiToca();
        Avisos.emitir(lote);
        lote.limpiar();
    }

    // Recompone la lámina del paso en curso (el tick y cada cambio de paso).
    function componer() as Void {
        var p = pasoActual();
        var t = pasoS();
        var tEfectivo = p.medTipo == Cod.MEDIDA_TIEMPO ? t - extraS : t;
        var gpsBuscando = !gpsListo && Laminar.esCarrera(p);
        Laminar.componer(lamina, s, p, i + 1 < s.pasos.size() ? s.pasos[i + 1] : null, lectura, tEfectivo, hechoM(), gpsBuscando);
        if (pagina != 0) {
            armarFilas();
        }
    }

    // Vuelta automática, preaviso, 3-2-1, aviso fuera de objetivo y cierre por medida.
    function eventosDelSegundo(p as Paso, nowMs as Lang.Number) as Void {
        var t = pasoS();
        var tEfectivo = p.medTipo == Cod.MEDIDA_TIEMPO ? t - extraS : t;
        var r = s.reglas;

        // Vuelta automática cada `vueltaAutoM` metros (dato del coach): el km, la vuelta de pista.
        var vam = p.vueltaAutoM;
        if (vam != null && vam > 0) {
            var k = sesDm / (vam * DM_POR_M);
            if (k > vueltaN) {
                vueltaAutomatica(k, vam, nowMs);
            }
        }

        var f = Laminar.falta(p, tEfectivo, hechoM());
        var pr = p.medPrescrito == null ? 0 : p.medPrescrito;
        // Preaviso: 10 s o 100 m, solo en pasos que no son cortos (dato del coach).
        if (!preavisado && f != null && f > 0) {
            var porTiempo = p.medTipo == Cod.MEDIDA_TIEMPO && f <= r.preavisoS && pr >= r.preavisoMinimoS;
            var porMetros = p.medTipo == Cod.MEDIDA_DISTANCIA && f <= r.preavisoM && pr >= 4 * r.preavisoM;
            if (porTiempo || porMetros) {
                preavisado = true;
                lote.meter(Avisos.EV_PREAVISO);
            }
        }
        // 3-2-1: un tic por segundo antes de un paso de trabajo de la parte principal.
        if (p.medTipo == Cod.MEDIDA_TIEMPO && entraConCuenta(p) && f != null && f > 0 && f <= 3) {
            lote.meter(Avisos.EV_CUENTA);
        }
        // Fuera de objetivo, con holgura y cadencia. UN veredicto (el techo pasado manda).
        var o = p.principal();
        if (p.rol == Cod.ROL_TRABAJO && (o != null || p.objetivoDe(Cod.PAPEL_TECHO) != null)) {
            var ver = Juez.veredictoDelPaso(p, lectura, s);
            var ev = Juez.decidirAviso(aviso, ver, t, p, o != null && Juez.esPulso(o), r);
            if (ev == Juez.AVISO_AFLOJA) {
                lote.meter(Avisos.EV_AFLOJA);
            } else if (ev == Juez.AVISO_APRIETA) {
                lote.meter(Avisos.EV_APRIETA);
            }
        }
        // El tiempo en zona de una serie a pulso, pasada la gracia (para el resumen «N de M dentro»).
        if (o != null && p.rol == Cod.ROL_TRABAJO && Juez.esPulso(o) && t > r.graciaZonaS) {
            var vp = Juez.veredictoPrincipal(p, lectura, s);
            if (vp == Juez.VER_DENTRO) {
                pasoDentroS++;
            } else if (vp == Juez.VER_ENCIMA) {
                pasoArribaS++;
            } else if (vp == Juez.VER_DEBAJO) {
                pasoAbajoS++;
            }
        }
        // Cierre por medida.
        if (!p.cierreAtleta && f != null && f <= 0) {
            cerrar(CIERRE_MEDIDA);
        }
    }

    function entraConCuenta(p as Paso) as Lang.Boolean {
        if (i + 1 >= s.pasos.size()) {
            return false;
        }
        var sig = s.pasos[i + 1];
        return sig.rol == Cod.ROL_TRABAJO && sig.fase == Cod.FASE_PRINCIPAL && (p.rol != Cod.ROL_TRABAJO || p.fase != Cod.FASE_PRINCIPAL);
    }

    // ── sensores ─────────────────────────────────────────────────────────────

    function vigilarSensores(hr as Lang.Number or Null) as Void {
        var t = sesionS();
        var gps = Position.getInfo().accuracy;
        var listo = gps != null && gps >= Position.QUALITY_USABLE;
        if (listo != gpsListo && t - gpsCambioS >= DEBOUNCE_S) {
            gpsListo = listo;
            gpsCambioS = t;
            lote.meter(listo ? Avisos.EV_RECUPERADO : Avisos.EV_ENLACE);
        } else if (listo == gpsListo) {
            gpsCambioS = t;
        }
        if (hr != null && !pulsoTuvo) {
            pulsoTuvo = true;
            pulsoCambioS = t;
        } else if (hr == null && pulsoTuvo && t - pulsoCambioS >= DEBOUNCE_S) {
            pulsoTuvo = false;
            lote.meter(Avisos.EV_ENLACE);
        } else if (hr != null) {
            pulsoCambioS = t;
        }
        if (!bateriaAvisada && System.getSystemStats().battery < BATERIA_BAJA_PCT) {
            bateriaAvisada = true;
            lote.meter(Avisos.EV_BATERIA);
        }
    }

    // ── cerrar un paso ───────────────────────────────────────────────────────

    // Guarda el tramo que acaba (para el resumen y el envío) y cierra la vuelta del FIT.
    function registrarTramo(cierre as Lang.Number, nowMs as Lang.Number) as Void {
        var p = pasoActual();
        var dur = (nowMs - pasoInicioSesMs) / MS;
        var dist = hechoM();
        tramos.addAll([i, pasoInicioSesMs / MS, dur, dist, pasoPpmSuma, pasoPpmN, pasoPpmMax, cierre, veredictoDelTramo(p, dur, dist) + 1]);
        var rd = Formato.ritmoDeTramo(dur, dist);
        vueltas.addAll([0, dur, dist, rd == null ? 0 : rd]);
        grabacion.vuelta();
    }

    // El veredicto de un paso cerrado, con la holgura con la que juzgó el motor en vivo. A ritmo: su media.
    // A pulso: donde pasó MÁS tiempo tras la gracia; si el paso fue más corto que la gracia, no se juzga.
    function veredictoDelTramo(p as Paso, dur as Lang.Number, dist as Lang.Number) as Lang.Number {
        var o = p.principal();
        if (o == null || p.rol != Cod.ROL_TRABAJO) {
            return Juez.VER_NINGUNO;
        }
        if (Juez.esPulso(o)) {
            var total = pasoDentroS + pasoArribaS + pasoAbajoS;
            if (total == 0) {
                return Juez.VER_NINGUNO;
            }
            if (pasoDentroS >= pasoArribaS && pasoDentroS >= pasoAbajoS) {
                return Juez.VER_DENTRO;
            }
            return pasoArribaS >= pasoAbajoS ? Juez.VER_ENCIMA : Juez.VER_DEBAJO;
        }
        var media = Formato.ritmoDeTramo(dur, dist);
        if ((o.eje == Cod.EJE_RITMO || Juez.zonaDeRitmo(o)) && media != null) {
            return Juez.veredicto(o, media, Juez.holguraDe(o, s.reglas), s);
        }
        return Juez.VER_NINGUNO;
    }

    // Cierra el paso en curso y pasa al siguiente (o termina).
    function cerrar(cierre as Lang.Number) as Void {
        var p = pasoActual();
        var nowMs = sesionMs();
        registrarTramo(cierre, nowMs);
        if (cierre == CIERRE_ATLETA) {
            lote.meter(Avisos.EV_PASO_A_MANO);
        }
        if (i + 1 >= s.pasos.size()) {
            // El último. Si lo cierra la mano, se espera al deshacer; si no, termina ya.
            if (cierre == CIERRE_ATLETA) {
                cerrandoUltimo = true;
                deshacerHasta = System.getTimer() + DESHACER_MS;
            } else {
                terminarNatural();
            }
            return;
        }
        var sig = s.pasos[i + 1];
        if (p.bloque != null && sig.bloque != null && p.bloque != sig.bloque && p.rol == Cod.ROL_TRABAJO) {
            lote.meter(Avisos.EV_BLOQUE);
        } else {
            lote.meter(sig.rol == Cod.ROL_TRABAJO ? Avisos.EV_GO : Avisos.EV_RECUPERA);
        }
        i++;
        iniciarPaso(nowMs);
        componer();
    }

    function terminarNatural() as Void {
        cerrandoUltimo = false;
        terminado = true;
        completa = true;
        lote.meter(Avisos.EV_SESION);
    }

    // ── lo que hace el atleta ────────────────────────────────────────────────

    // BACK/LAP: cierra el paso a mano, con 5 s para deshacerlo. Nunca dos pasos por una pulsación, nunca ninguno.
    function siguientePaso() as Void {
        if (terminado || pausado() || cerrandoUltimo) {
            return;
        }
        uI = i;
        uPasoInicioSesMs = pasoInicioSesMs;
        uPasoInicioDm = pasoInicioDm;
        uExtraS = extraS;
        uPreavisado = preavisado;
        uFuera = aviso.fuera;
        uDesde = aviso.desde;
        uUltimo = aviso.ultimo;
        uTramos = tramos.size();
        uVueltas = vueltas.size();
        var antes = s.vocab.nombreClase(pasoActual().clase);
        cerrar(CIERRE_ATLETA);
        deshacerTexto = antes;
        if (!cerrandoUltimo) {
            deshacerHasta = System.getTimer() + DESHACER_MS;
        }
        Avisos.emitir(lote);
        lote.limpiar();
        componer();
    }

    function puedeDeshacer() as Lang.Boolean {
        return deshacerHasta > 0 && System.getTimer() < deshacerHasta && !terminado;
    }

    // UP en los 5 s: el paso reabierto sigue contando desde donde iba; lo que midió la sesión se queda.
    function deshacer() as Void {
        if (!puedeDeshacer()) {
            return;
        }
        i = uI;
        pasoInicioSesMs = uPasoInicioSesMs;
        pasoInicioDm = uPasoInicioDm;
        extraS = uExtraS;
        preavisado = uPreavisado;
        aviso.fuera = uFuera;
        aviso.desde = uDesde;
        aviso.ultimo = uUltimo;
        tramos = tramos.slice(0, uTramos);
        vueltas = vueltas.slice(0, uVueltas);
        cerrandoUltimo = false;
        deshacerHasta = 0;
        var o = pasoActual().principal();
        grabacion.fijarPaso(i, o == null ? null : o.min);
        componer();
    }

    function pausar() as Void {
        if (pausado() || terminado) {
            return;
        }
        pausaDesdeMs = System.getTimer();
        grabacion.pausar();
    }

    function reanudar() as Void {
        if (!pausado()) {
            return;
        }
        pausadoAcumMs += System.getTimer() - pausaDesdeMs;
        pausaDesdeMs = NO_PAUSA;
        // Un hueco de pausa en la ventana de suavizado daría un ritmo falso.
        ritmo.reiniciar();
        grabacion.reanudar();
    }

    // Controles: saltar el paso sin haberlo hecho.
    function saltar() as Void {
        if (terminado || cerrandoUltimo) {
            return;
        }
        cerrar(CIERRE_SALTADO);
        Avisos.emitir(lote);
        lote.limpiar();
        componer();
    }

    // Controles: +30 s de descanso o recuperación (solo si el paso se mide por tiempo).
    function masTreinta() as Lang.Boolean {
        var p = pasoActual();
        if (p.rol == Cod.ROL_TRABAJO || p.medTipo != Cod.MEDIDA_TIEMPO) {
            return false;
        }
        extraS += EXTRA_DESCANSO_S;
        componer();
        return true;
    }

    // ¿Se puede sumar 30 s aquí? (lo pregunta el menú de Controles)
    function admiteMasTreinta() as Lang.Boolean {
        var p = pasoActual();
        return p.rol != Cod.ROL_TRABAJO && p.medTipo == Cod.MEDIDA_TIEMPO;
    }

    // Terminar antes de tiempo: lo hecho se guarda como parcial. El motor decide la completitud, no la pantalla.
    function terminarAntes() as Void {
        if (terminado) {
            return;
        }
        if (!cerrandoUltimo) {
            registrarTramo(CIERRE_INCOMPLETO, sesionMs());
        }
        cerrandoUltimo = false;
        terminado = true;
        completa = false;
    }

    function siguientePagina() as Void {
        pagina = (pagina + 1) % Paginas.N;
        armarFilas();
    }

    function anteriorPagina() as Void {
        pagina = (pagina + Paginas.N - 1) % Paginas.N;
        armarFilas();
    }

    function armarFilas() as Void {
        filas = Paginas.filas(self);
    }

    // ── vuelta automática ────────────────────────────────────────────────────

    function vueltaAutomatica(k as Lang.Number, vueltaM as Lang.Number, nowMs as Lang.Number) as Void {
        var seg = (nowMs - vueltaDesdeMs) / MS;
        var dist = (sesDm - vueltaDesdeDm) / DM_POR_M;
        var rr = Formato.ritmoDeTramo(seg, dist);
        var rit = rr == null ? 0 : rr;
        vueltaN = k;
        vueltaDesdeMs = nowMs;
        vueltaDesdeDm = sesDm;
        vueltas.addAll([1, seg, vueltaM, rit]);
        tarjetaTitulo = (vueltaM == 1000 ? "Kilómetro " : "Vuelta ") + k;
        tarjetaValor = Formato.ritmo(rit > 0 ? rit : null);
        tarjetaPie = "/km";
        tarjetaHasta = System.getTimer() + TARJETA_VUELTA_S * MS;
        grabacion.vuelta();
        lote.meter(Avisos.EV_VUELTA);
    }

    function tarjetaVisible() as Lang.Boolean {
        return tarjetaHasta > 0 && System.getTimer() < tarjetaHasta;
    }

    // ── checkpoint (G10): si la app muere, el siguiente arranque ofrece seguir ─

    function checkpointSiToca() as Void {
        var t = sesionS();
        if (t - ultimoCheckpointS >= CHECKPOINT_S) {
            guardarCheckpoint();
        }
    }

    function guardarCheckpoint() as Void {
        ultimoCheckpointS = sesionS();
        Store.escribir(Config.STORE_CHECKPOINT, {
            "id" => s.asignacionId,
            "huella" => s.huella,
            "inicio" => inicioEpoch,
            "paso" => i,
            "sesS" => sesionS(),
            "dm" => sesDm,
            "ppmS" => sesPpmSuma,
            "ppmN" => sesPpmN,
            "ppmM" => sesPpmMax,
            "tramos" => tramos,
            "vueltas" => vueltas
        });
    }

    // ── resumen ──────────────────────────────────────────────────────────────

    function totalM() as Lang.Number {
        return sesDm / DM_POR_M;
    }

    // Suma, sobre los tramos de trabajo de la parte principal, de segundos y metros (para «ritmo de lo fuerte»).
    // Devuelve [segundos, metros].
    function fuerte() as Lang.Array<Lang.Number> {
        var seg = 0;
        var m = 0;
        for (var k = 0; k + T_LARGO <= tramos.size(); k += T_LARGO) {
            var p = s.pasos[tramos[k + T_PASO]];
            if (p.rol == Cod.ROL_TRABAJO && p.fase == Cod.FASE_PRINCIPAL) {
                seg += tramos[k + T_DUR_S];
                m += tramos[k + T_DIST_M];
            }
        }
        return [seg, m];
    }

    // «5 de 6 dentro»: [dentro, juzgados].
    function dentro() as Lang.Array<Lang.Number> {
        var d = 0;
        var n = 0;
        for (var k = 0; k + T_LARGO <= tramos.size(); k += T_LARGO) {
            var v = tramos[k + T_VEREDICTO];
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

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
    const EXTRA_DESCANSO_S = 30;
    const DECI = 10;
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
    var instantanea as Instantanea;

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
        instantanea = new Instantanea();
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
        return sesionMs() / Formato.MS_POR_S;
    }

    function pasoS() as Lang.Number {
        return (sesionMs() - pasoInicioSesMs) / Formato.MS_POR_S;
    }

    function pasoActual() as Paso {
        return s.pasos[i];
    }

    function hechoM() as Lang.Number {
        return (sesDm - pasoInicioDm) / Formato.DM_POR_M;
    }

    // ── arranque ─────────────────────────────────────────────────────────────

    // Empieza el paso 0 (al terminar la cuenta atrás): aquí arranca la grabación.
    function arrancar() as Void {
        sinGrabar = !grabacion.iniciar();
        relojInicioMs = System.getTimer();
        iniciarPaso(0);
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
            sesDm = dmBase + (info.elapsedDistance * Formato.DM_POR_M).toNumber();
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

        Vigia.sensores(self, hr);
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
                Vigia.eventos(self, p, nowMs);
            }
        }
        if (!terminado) {
            componer();
        }
        Persistencia.siToca(self);
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

    // ── cerrar un paso ───────────────────────────────────────────────────────

    // Guarda el tramo que acaba (para el resumen y el envío) y cierra la vuelta del FIT.
    function registrarTramo(cierre as Lang.Number, nowMs as Lang.Number) as Void {
        var p = pasoActual();
        var dur = (nowMs - pasoInicioSesMs) / Formato.MS_POR_S;
        var dist = hechoM();
        tramos.addAll([i, pasoInicioSesMs / Formato.MS_POR_S, dur, dist, pasoPpmSuma, pasoPpmN, pasoPpmMax, cierre, Balance.veredictoDelTramo(self, p, dur, dist) + 1]);
        var rd = Formato.ritmoDeTramo(dur, dist);
        vueltas.addAll([0, dur, dist, rd == null ? 0 : rd]);
        grabacion.vuelta();
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
        instantanea.tomar(self);
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
        instantanea.volver(self);
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

    // Checkpoint, seguir tras una interrupción y metros: la lógica vive en Persistencia y Formato.
    function guardarCheckpoint() as Void {
        Persistencia.guardar(self);
    }

    function restaurar(chk as Lang.Dictionary) as Void {
        Persistencia.restaurar(self, chk);
    }

    function tarjetaVisible() as Lang.Boolean {
        return tarjetaHasta > 0 && System.getTimer() < tarjetaHasta;
    }

    // ── metros ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

    function totalM() as Lang.Number {
        return sesDm / Formato.DM_POR_M;
    }

}

//
// LA SESIÓN EN VIVO — el trozo del Controller que va desde «Empezar» hasta el
// resumen. El estado sigue siendo UNO (`Controller.state`); esta clase solo lo
// mueve según la tabla de botones de §5 (kit-garmin/mandos.ts) y mantiene al Motor.
//
// Una pulsación = una acción + un aviso propio + deshacer (G4). BACK jamás cierra
// la app mientras se graba (H7): en el vivo es la vuelta.
//
// Fases: brief → cuenta 3-2-1 → vivo (paso, pausa, controles, confirmar) → RPE →
// resumen → estado del envío.
//
using Toybox.Lang;
using Toybox.Position;
using Toybox.Time;
using Toybox.WatchUi;

class Vivo {

    // Lo que se puede hacer desde Controles.
    enum {
        C_PAUSAR,
        C_SALTAR,
        C_MAS_TREINTA,
        C_TERMINAR,
        C_DESCARTAR
    }

    // Qué se está confirmando en STATE_CONFIRMA.
    enum {
        CONFIRMA_TERMINAR,
        CONFIRMA_DESCARTAR
    }

    const CUENTA_INICIO = 3;
    const RPE_MIN = 0;
    const RPE_MAX = 10;
    const RPE_INICIAL = 5;
    // Descartar pide confirmar DOS veces (nunca se pierde una sesión por un roce).
    const CONFIRMAS_DESCARTAR = 2;

    var ctl as Controller;
    var grabacion as Grabacion or Null;
    var motor as Motor or Null;
    var cuentaN as Lang.Number;
    var inicioEpoch as Lang.Number;
    var gpsListo as Lang.Boolean;

    var controles as Lang.Array<Lang.Number>;
    var controlesSel as Lang.Number;
    var controlesVuelta as Lang.Number;     // el estado al que se vuelve al cerrar Controles
    var confirmaTipo as Lang.Number;
    var confirmaN as Lang.Number;

    var rpe as Lang.Number or Null;
    var rpeElegido as Lang.Number;
    var resumen as Lang.Array<Lang.String>;

    function initialize(c as Controller) {
        ctl = c;
        grabacion = null;
        motor = null;
        cuentaN = 0;
        inicioEpoch = 0;
        gpsListo = false;
        controles = [] as Lang.Array<Lang.Number>;
        controlesSel = 0;
        controlesVuelta = AppState.STATE_VIVO;
        confirmaTipo = CONFIRMA_TERMINAR;
        confirmaN = 0;
        rpe = null;
        rpeElegido = RPE_INICIAL;
        resumen = [] as Lang.Array<Lang.String>;
    }

    // ── el brief: GPS y pulso, antes de empezar ──────────────────────────────

    function prepararBrief() as Void {
        gpsListo = false;
        Grabacion.habilitarSensores(method(:onPosicion));
    }

    function onPosicion(info as Position.Info) as Void {
        var listo = info.accuracy != null && info.accuracy >= Position.QUALITY_USABLE;
        if (listo && !gpsListo && ctl.state == AppState.STATE_BRIEF) {
            var lote = new Avisos.Lote();
            lote.meter(Avisos.EV_GPS);
            Avisos.emitir(lote);
        }
        gpsListo = listo;
        WatchUi.requestUpdate();
    }

    function salirDelBrief() as Void {
        Grabacion.apagarSensores();
    }

    // Seguir una sesión interrumpida: sin cuenta atrás, en el paso donde iba.
    function seguir(chk as Lang.Dictionary, s as Sesion) as Void {
        ctl.sesion = s;
        inicioEpoch = Json.num(chk, "inicio", Time.now().value());
        prepararBrief();
        var g = new Grabacion();
        g.crear(s);
        grabacion = g;
        var m = new Motor(s, inicioEpoch, g);
        motor = m;
        ctl.state = AppState.STATE_VIVO;
        m.restaurar(chk);
        WatchUi.requestUpdate();
    }

    // La app se cierra con una sesión en curso: se guarda el FIT y el checkpoint (nada se pierde).
    function alSalir() as Void {
        if (motor != null && !(motor as Motor).terminado && grabacion != null) {
            (motor as Motor).guardarCheckpoint();
            (grabacion as Grabacion).terminar(true);
        }
    }

    // ── cuenta atrás 3-2-1 ───────────────────────────────────────────────────

    // START en el brief. `started_at` se fija y se guarda ANTES de grabar: el reintento manda el mismo.
    function empezar() as Void {
        inicioEpoch = Time.now().value();
        // started_at se guarda ANTES de grabar: si la app muere, el reintento manda el mismo.
        var s = ctl.sesion as Sesion;
        Store.escribir(Config.STORE_CHECKPOINT, { "id" => s.asignacionId, "huella" => s.huella, "inicio" => inicioEpoch, "paso" => 0, "sesS" => 0, "dm" => 0, "ppmS" => 0, "ppmN" => 0, "ppmM" => 0, "tramos" => [], "vueltas" => [] });
        var g = new Grabacion();
        g.crear(ctl.sesion as Sesion);
        grabacion = g;
        cuentaN = CUENTA_INICIO;
        ctl.state = AppState.STATE_CUENTA;
        avisar(Avisos.EV_CUENTA);
        WatchUi.requestUpdate();
    }

    function cancelarCuenta() as Void {
        if (grabacion != null) {
            (grabacion as Grabacion).terminar(false);
        }
        grabacion = null;
        ctl.state = AppState.STATE_BRIEF;
        WatchUi.requestUpdate();
    }

    function avisar(ev as Lang.Number) as Void {
        var lote = new Avisos.Lote();
        lote.meter(ev);
        Avisos.emitir(lote);
    }

    // ── el segundo ───────────────────────────────────────────────────────────

    function tick() as Void {
        if (ctl.state == AppState.STATE_CUENTA) {
            cuentaN--;
            if (cuentaN > 0) {
                avisar(Avisos.EV_CUENTA);
            } else {
                arrancar();
            }
        } else if (motor != null && !(motor as Motor).terminado) {
            var m = motor as Motor;
            m.tick();
            if (m.terminado) {
                finalizar();
            }
        }
        WatchUi.requestUpdate();
    }

    function arrancar() as Void {
        salirDelBrief();
        var m = new Motor(ctl.sesion as Sesion, inicioEpoch, grabacion as Grabacion);
        motor = m;
        ctl.state = AppState.STATE_VIVO;
        m.arrancar();
        avisar(Avisos.EV_GO);
    }

    // ── botones ──────────────────────────────────────────────────────────────

    function enSesion() as Lang.Boolean {
        var s = ctl.state;
        return s == AppState.STATE_CUENTA || s == AppState.STATE_VIVO || s == AppState.STATE_PAUSA || s == AppState.STATE_CONTROLES || s == AppState.STATE_CONFIRMA;
    }

    // START/STOP. Devuelve si lo consumió.
    function alSelect() as Lang.Boolean {
        var s = ctl.state;
        if (s == AppState.STATE_CUENTA) {
            cancelarCuenta();
        } else if (s == AppState.STATE_VIVO) {
            (motor as Motor).pausar();
            ctl.state = AppState.STATE_PAUSA;
        } else if (s == AppState.STATE_PAUSA) {
            (motor as Motor).reanudar();
            ctl.state = AppState.STATE_VIVO;
        } else if (s == AppState.STATE_CONTROLES) {
            elegirControl();
        } else if (s == AppState.STATE_CONFIRMA) {
            confirmar();
        } else if (s == AppState.STATE_RPE) {
            rpe = rpeElegido;
            irAlResumen();
        } else if (s == AppState.STATE_RESUMEN) {
            siguienteResumen();
        } else {
            return false;
        }
        WatchUi.requestUpdate();
        return true;
    }

    // BACK/LAP: en el vivo, la vuelta.
    function alBack() as Lang.Boolean {
        var s = ctl.state;
        if (s == AppState.STATE_CUENTA) {
            cancelarCuenta();
        } else if (s == AppState.STATE_VIVO) {
            (motor as Motor).siguientePaso();
            if ((motor as Motor).terminado) {
                finalizar();
            }
        } else if (s == AppState.STATE_PAUSA) {
            abrirControles(AppState.STATE_PAUSA);
        } else if (s == AppState.STATE_CONTROLES) {
            ctl.state = controlesVuelta;
        } else if (s == AppState.STATE_CONFIRMA) {
            ctl.state = AppState.STATE_CONTROLES;
        } else if (s == AppState.STATE_RPE) {
            rpe = null;         // un RPE omitido es nulo, nunca inventado
            irAlResumen();
        } else if (s == AppState.STATE_RESUMEN) {
            return true;        // atrás en el resumen no hace nada: lo hecho ya está guardado
        } else {
            return false;
        }
        WatchUi.requestUpdate();
        return true;
    }

    function alUp() as Lang.Boolean {
        var s = ctl.state;
        if (s == AppState.STATE_VIVO) {
            var m = motor as Motor;
            if (m.puedeDeshacer()) {
                m.deshacer();
            } else {
                m.anteriorPagina();
            }
        } else if (s == AppState.STATE_CONTROLES) {
            controlesSel = (controlesSel + controles.size() - 1) % controles.size();
        } else if (s == AppState.STATE_RPE) {
            rpeElegido = rpeElegido < RPE_MAX ? rpeElegido + 1 : RPE_MAX;
        } else {
            return enSesion() || s == AppState.STATE_RESUMEN;      // en pausa y cuenta, UP no hace nada, pero se consume
        }
        WatchUi.requestUpdate();
        return true;
    }

    function alDown() as Lang.Boolean {
        var s = ctl.state;
        if (s == AppState.STATE_VIVO) {
            (motor as Motor).siguientePagina();
        } else if (s == AppState.STATE_CONTROLES) {
            controlesSel = (controlesSel + 1) % controles.size();
        } else if (s == AppState.STATE_RPE) {
            rpeElegido = rpeElegido > RPE_MIN ? rpeElegido - 1 : RPE_MIN;
        } else {
            return enSesion() || s == AppState.STATE_RESUMEN;   // el resumen es una sola página
        }
        WatchUi.requestUpdate();
        return true;
    }

    // UP largo: Controles.
    function alMenu() as Lang.Boolean {
        if (ctl.state == AppState.STATE_VIVO) {
            abrirControles(AppState.STATE_VIVO);
            WatchUi.requestUpdate();
            return true;
        }
        return enSesion();
    }

    // ── Controles ────────────────────────────────────────────────────────────

    function abrirControles(desde as Lang.Number) as Void {
        var m = motor as Motor;
        controles = [C_PAUSAR, C_SALTAR] as Lang.Array<Lang.Number>;
        if (m.admiteMasTreinta()) {
            controles.add(C_MAS_TREINTA);
        }
        controles.add(C_TERMINAR);
        controles.add(C_DESCARTAR);
        controlesSel = 0;
        controlesVuelta = desde;
        ctl.state = AppState.STATE_CONTROLES;
    }

    function elegirControl() as Void {
        var m = motor as Motor;
        var c = controles[controlesSel];
        if (c == C_PAUSAR) {
            m.pausar();
            ctl.state = AppState.STATE_PAUSA;
        } else if (c == C_SALTAR) {
            m.saltar();
            ctl.state = controlesVuelta == AppState.STATE_PAUSA ? AppState.STATE_PAUSA : AppState.STATE_VIVO;
            if (m.terminado) {
                finalizar();
            }
        } else if (c == C_MAS_TREINTA) {
            m.masTreinta();
            ctl.state = controlesVuelta;
        } else if (c == C_TERMINAR) {
            confirmaTipo = CONFIRMA_TERMINAR;
            confirmaN = 1;
            ctl.state = AppState.STATE_CONFIRMA;
        } else {
            confirmaTipo = CONFIRMA_DESCARTAR;
            confirmaN = 1;
            ctl.state = AppState.STATE_CONFIRMA;
        }
    }

    function confirmar() as Void {
        var m = motor as Motor;
        if (confirmaTipo == CONFIRMA_TERMINAR) {
            m.terminarAntes();
            finalizar();
            return;
        }
        if (confirmaN < CONFIRMAS_DESCARTAR) {
            confirmaN++;
            return;
        }
        // Descartar: se tira la grabación y el checkpoint; no queda nada que enviar.
        (grabacion as Grabacion).terminar(false);
        Store.borrar(Config.STORE_CHECKPOINT);
        motor = null;
        grabacion = null;
        ctl.showToday(ctl.sinConexion, 0);
    }

    // ── el final ─────────────────────────────────────────────────────────────

    // La sesión ha terminado (natural o antes): se guarda el FIT y se pide el RPE.
    function finalizar() as Void {
        var m = motor as Motor;
        var ok = (grabacion as Grabacion).terminar(true);
        Store.borrar(Config.STORE_CHECKPOINT);
        m.sinGrabar = m.sinGrabar || !ok;
        // Escribir primero, enviar después (G8): el resultado queda en la cola ANTES de pedir el RPE.
        var s = ctl.sesion as Sesion;
        Cola.encolar(Resultado.item(s, s.asignacionId, s.huella, inicioEpoch, m.sesionS(), m.completa, m.tramos));
        rpe = null;
        rpeElegido = RPE_INICIAL;
        armarResumen();
        ctl.state = AppState.STATE_RPE;
    }

    function irAlResumen() as Void {
        // El RPE (o su omisión) se anota en el resultado ya guardado y este queda listo para irse.
        Cola.fijarRpe(inicioEpoch, rpe);
        Cola.drenar(Store.token(), 0);
        armarResumen();
        ctl.state = AppState.STATE_RESUMEN;
    }

    // «Distancia · Tiempo · Ritmo de lo fuerte · N de M dentro»: [etiqueta, valor, …].
    function armarResumen() as Void {
        var m = motor as Motor;
        var f = Balance.fuerte(m);
        var d = Balance.dentro(m);
        var out = ["Distancia", Formato.distancia(m.totalM()), "Tiempo", Formato.reloj(m.sesionS())] as Lang.Array<Lang.String>;
        if (f[1] > 0) {
            out.addAll(["Ritmo fuerte", Formato.ritmo(Formato.ritmoDeTramo(f[0], f[1]))]);
        }
        if (d[1] > 0) {
            out.addAll(["Dentro", d[0] + " de " + d[1]]);
        }
        resumen = out;
    }

    // START en el resumen: «Hecho».
    function siguienteResumen() as Void {
        ctl.state = AppState.STATE_ENVIO;
    }

    // START en el estado del envío: vuelve a hoy.
    function cerrarEnvio() as Void {
        Cola.drenar(Store.token(), 0);
        motor = null;
        grabacion = null;
        ctl.showToday(ctl.sinConexion, 0);
    }
}

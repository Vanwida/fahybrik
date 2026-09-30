//
// LO QUE EL MOTOR VIGILA CADA SEGUNDO: la vuelta automática, el preaviso, el 3-2-1, el aviso
// fuera de objetivo, el cierre por medida y los sensores (GPS, pulso, batería). Sale del
// Motor para que este se quede en la máquina de estados; escribe sobre el motor que recibe.
//
using Toybox.Lang;
using Toybox.Position;
using Toybox.System;

module Vigia {

    // Segundos que una pérdida o vuelta de GPS o pulso ha de sostenerse antes de avisar (evita el parpadeo).
    const DEBOUNCE_S = 3;
    const BATERIA_BAJA_PCT = 10;
    // Segundos que la tarjeta de la vuelta automática se queda sobre el paso.
    const TARJETA_VUELTA_S = 5;
    // Los últimos segundos antes de un paso de trabajo en los que suena el 3-2-1.
    const CUENTA_S = 3;

    // Vuelta automática, preaviso, 3-2-1, aviso fuera de objetivo y cierre por medida.
    function eventos(m as Motor, p as Paso, nowMs as Lang.Number) as Void {
        var t = m.pasoS();
        var tEfectivo = p.medTipo == Cod.MEDIDA_TIEMPO ? t - m.extraS : t;
        var r = m.s.reglas;

        // Vuelta automática cada `vueltaAutoM` metros (dato del coach): el km, la vuelta de pista.
        var vam = p.vueltaAutoM;
        if (vam != null && vam > 0) {
            var k = m.sesDm / (vam * Formato.DM_POR_M);
            if (k > m.vueltaN) {
                vueltaAutomatica(m, k, vam, nowMs);
            }
        }

        var f = Laminar.falta(p, tEfectivo, m.hechoM());
        var pr = p.medPrescrito == null ? 0 : p.medPrescrito;
        // Preaviso: 10 s o 100 m, solo en pasos que no son cortos (dato del coach).
        if (!m.preavisado && f != null && f > 0) {
            var porTiempo = p.medTipo == Cod.MEDIDA_TIEMPO && f <= r.preavisoS && pr >= r.preavisoMinimoS;
            var porMetros = p.medTipo == Cod.MEDIDA_DISTANCIA && f <= r.preavisoM && pr >= 4 * r.preavisoM;
            if (porTiempo || porMetros) {
                m.preavisado = true;
                m.lote.meter(Avisos.EV_PREAVISO);
            }
        }
        // 3-2-1: un tic por segundo antes de un paso de trabajo de la parte principal.
        if (p.medTipo == Cod.MEDIDA_TIEMPO && entraConCuenta(m, p) && f != null && f > 0 && f <= CUENTA_S) {
            m.lote.meter(Avisos.EV_CUENTA);
        }
        // Fuera de objetivo, con holgura y cadencia. UN veredicto (el techo pasado manda).
        var o = p.principal();
        if (p.rol == Cod.ROL_TRABAJO && (o != null || p.objetivoDe(Cod.PAPEL_TECHO) != null)) {
            var ver = Juez.veredictoDelPaso(p, m.lectura, m.s);
            var ev = Juez.decidirAviso(m.aviso, ver, t, p, o != null && Juez.esPulso(o), r);
            if (ev == Juez.AVISO_AFLOJA) {
                m.lote.meter(Avisos.EV_AFLOJA);
            } else if (ev == Juez.AVISO_APRIETA) {
                m.lote.meter(Avisos.EV_APRIETA);
            }
        }
        // El tiempo en zona de una serie a pulso, pasada la gracia (para el resumen «N de M dentro»).
        if (o != null && p.rol == Cod.ROL_TRABAJO && Juez.esPulso(o) && t > r.graciaZonaS) {
            var vp = Juez.veredictoPrincipal(p, m.lectura, m.s);
            if (vp == Juez.VER_DENTRO) {
                m.pasoDentroS++;
            } else if (vp == Juez.VER_ENCIMA) {
                m.pasoArribaS++;
            } else if (vp == Juez.VER_DEBAJO) {
                m.pasoAbajoS++;
            }
        }
        // Cierre por medida.
        if (!p.cierreAtleta && f != null && f <= 0) {
            m.cerrar(Motor.CIERRE_MEDIDA);
        }
    }

    // ¿Entra el siguiente paso con cuenta atrás? Solo un trabajo de la parte principal tras algo que no lo es.
    function entraConCuenta(m as Motor, p as Paso) as Lang.Boolean {
        if (m.i + 1 >= m.s.pasos.size()) {
            return false;
        }
        var sig = m.s.pasos[m.i + 1];
        return sig.rol == Cod.ROL_TRABAJO && sig.fase == Cod.FASE_PRINCIPAL && (p.rol != Cod.ROL_TRABAJO || p.fase != Cod.FASE_PRINCIPAL);
    }

    // Una vuelta cada `vueltaM` metros: se anota, se cierra la vuelta del FIT y suena.
    function vueltaAutomatica(m as Motor, k as Lang.Number, vueltaM as Lang.Number, nowMs as Lang.Number) as Void {
        var seg = (nowMs - m.vueltaDesdeMs) / Formato.MS_POR_S;
        var dist = (m.sesDm - m.vueltaDesdeDm) / Formato.DM_POR_M;
        var rr = Formato.ritmoDeTramo(seg, dist);
        var rit = rr == null ? 0 : rr;
        m.vueltaN = k;
        m.vueltaDesdeMs = nowMs;
        m.vueltaDesdeDm = m.sesDm;
        m.vueltas.addAll([1, seg, vueltaM, rit]);
        m.tarjetaTitulo = (vueltaM == 1000 ? "Kilómetro " : "Vuelta ") + k;
        m.tarjetaValor = Formato.ritmo(rit > 0 ? rit : null);
        m.tarjetaPie = "/km";
        m.tarjetaHasta = System.getTimer() + TARJETA_VUELTA_S * Formato.MS_POR_S;
        m.grabacion.vuelta();
        m.lote.meter(Avisos.EV_VUELTA);
    }

    // GPS y pulso perdidos o recuperados (con debounce) y batería baja.
    function sensores(m as Motor, hr as Lang.Number or Null) as Void {
        var t = m.sesionS();
        var gps = Position.getInfo().accuracy;
        var listo = gps != null && gps >= Position.QUALITY_USABLE;
        if (listo != m.gpsListo && t - m.gpsCambioS >= DEBOUNCE_S) {
            m.gpsListo = listo;
            m.gpsCambioS = t;
            m.lote.meter(listo ? Avisos.EV_RECUPERADO : Avisos.EV_ENLACE);
        } else if (listo == m.gpsListo) {
            m.gpsCambioS = t;
        }
        if (hr != null && !m.pulsoTuvo) {
            m.pulsoTuvo = true;
            m.pulsoCambioS = t;
        } else if (hr == null && m.pulsoTuvo && t - m.pulsoCambioS >= DEBOUNCE_S) {
            m.pulsoTuvo = false;
            m.lote.meter(Avisos.EV_ENLACE);
        } else if (hr != null) {
            m.pulsoCambioS = t;
        }
        if (!m.bateriaAvisada && System.getSystemStats().battery < BATERIA_BAJA_PCT) {
            m.bateriaAvisada = true;
            m.lote.meter(Avisos.EV_BATERIA);
        }
    }
}

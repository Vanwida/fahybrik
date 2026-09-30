//
// LAS CARAS — lo que se dibuja del brief, la cuenta, el paso en curso, las páginas,
// la pausa, Controles, el RPE, el resumen y el estado del envío. Una por lo que haces.
//
// Solo DIBUJA: todo lo que decide qué número manda, contra qué banda se juzga y qué
// palabra lleva ya viene escrito en la `Lamina` del motor (una vez por segundo).
// Aquí no se reserva memoria más allá de lo indispensable y no hay cálculo de
// reglas: es el watchdog de Garmin lo que se cuida.
//
// Todo en fracciones del diámetro (Lienzo); texto nunca bajo el 6,2 % de D; ningún
// color fuera de Theme; el pulso, siempre en la fila de abajo.
//
using Toybox.Graphics;
using Toybox.Lang;
using Toybox.System;
using Toybox.WatchUi;

module VistaVivo {

    const MILESIMAS = 1000;
    const RESTANTE_DESHACER_MS = 5000;
    // Fila de la píldora de acción y de los rótulos de una lista.
    const LISTA_DESDE = 0.24;
    const LISTA_HASTA = 0.80;
    const FILA_ALTO = 0.13;
    const MARCO = 0.008;
    // Cuántas confirmaciones pide Descartar (la misma que Vivo.CONFIRMAS_DESCARTAR).
    const CONFIRMAS_DESCARTAR_N = 2;

    // Pinta el estado actual. false = no es una cara del vivo (lo pinta la vista de texto).
    function pintar(dc as Graphics.Dc, ctl as Controller) as Lang.Boolean {
        var s = ctl.state;
        if (s == AppState.STATE_BRIEF) {
            brief(dc, ctl);
        } else if (s == AppState.STATE_CUENTA) {
            cuenta(dc, ctl);
        } else if (s == AppState.STATE_VIVO) {
            vivo(dc, ctl.vivo.motor as Motor);
        } else if (s == AppState.STATE_PAUSA) {
            pausa(dc, ctl.vivo.motor as Motor);
        } else if (s == AppState.STATE_CONTROLES) {
            controles(dc, ctl.vivo);
        } else if (s == AppState.STATE_CONFIRMA) {
            confirma(dc, ctl.vivo);
        } else if (s == AppState.STATE_RPE) {
            rpe(dc, ctl.vivo);
        } else if (s == AppState.STATE_RESUMEN) {
            resumen(dc, ctl.vivo);
        } else if (s == AppState.STATE_ENVIO) {
            envio(dc, ctl);
        } else {
            return false;
        }
        return true;
    }

    function fondo(dc as Graphics.Dc) as Void {
        dc.setColor(Theme.FG, Theme.BG);
        dc.clear();
    }

    function texto(id) as Lang.String {
        return WatchUi.loadResource(id) as Lang.String;
    }

    // ── el brief ─────────────────────────────────────────────────────────────

    function brief(dc as Graphics.Dc, ctl as Controller) as Void {
        fondo(dc);
        var s = ctl.sesion as Sesion;
        Lienzo.aro(dc, 0, Theme.MUTED);
        var titulo = ctl.filas.size() > 1 ? texto(Rez.Strings.BriefHoy) + " · " + (ctl.sel + 1) + "/" + ctl.filas.size() : texto(Rez.Strings.BriefHoy);
        Lienzo.linea(dc, titulo, Lienzo.T_CONTEXTO, false, Lienzo.CONTEXTO_HASTA - 0.045, Theme.MUTED);
        heroe(dc, Formato.duracionLarga(s.duracionEstS), null, Lienzo.HEROE_DESDE, Lienzo.HEROE_HASTA, Theme.FG);
        // La estructura, en una línea que se recorta por el final.
        Lienzo.linea(dc, ctl.body, Lienzo.T_NOTA, false, Lienzo.BANDA_Y + 0.04, Theme.MUTED);
        var listo = ctl.vivo.gpsListo;
        Lienzo.linea(dc, texto(listo ? Rez.Strings.GpsListo : Rez.Strings.GpsBuscando), Lienzo.T_TERCERO, false, Lienzo.SEGUNDA_Y, listo ? Theme.FG : Theme.MUTED);
        Lienzo.linea(dc, texto(listo ? Rez.Strings.StartEmpezar : Rez.Strings.StartEmpezarSinGps), Lienzo.T_TERCERO, true, Lienzo.PIE_Y, Theme.ACCENT);
    }

    // ── 3-2-1 ────────────────────────────────────────────────────────────────

    function cuenta(dc as Graphics.Dc, ctl as Controller) as Void {
        fondo(dc);
        var s = ctl.sesion as Sesion;
        Lienzo.aro(dc, 0, Theme.ACCENT);
        var ctx = Laminar.variantes(Estructura.contexto(s, s.pasos[0]));
        Lienzo.linea(dc, Lienzo.elegirVariante(dc, ctx, Lienzo.T_CONTEXTO, Lienzo.CONTEXTO_HASTA - 0.045), Lienzo.T_CONTEXTO, false, Lienzo.CONTEXTO_HASTA - 0.045, Theme.FG);
        heroe(dc, ctl.vivo.cuentaN > 0 ? ctl.vivo.cuentaN.toString() : "GO", null, Lienzo.HEROE_DESDE, Lienzo.HEROE_HASTA, Theme.ACCENT);
        Lienzo.linea(dc, texto(Rez.Strings.CancelarUnaTecla), Lienzo.T_NOTA, false, Lienzo.PIE_Y, Theme.MUTED);
    }

    // ── el paso ──────────────────────────────────────────────────────────────

    function vivo(dc as Graphics.Dc, m as Motor) as Void {
        fondo(dc);
        aroDeSesion(dc, m);
        if (m.tarjetaVisible()) {
            tarjeta(dc, m);
            return;
        }
        if (m.pagina != Paginas.PASO) {
            pagina(dc, m);
            return;
        }
        paso(dc, m);
        if (m.puedeDeshacer() || m.cerrandoUltimo) {
            deshacer(dc, m);
        }
    }

    function aroDeSesion(dc as Graphics.Dc, m as Motor) as Void {
        var est = m.s.duracionEstS;
        var hecho = est > 0 ? m.sesionS() * MILESIMAS / est : 0;
        hecho = hecho > MILESIMAS ? MILESIMAS : hecho;
        Lienzo.aro(dc, hecho, m.pasoActual().rol == Cod.ROL_TRABAJO ? Theme.ACCENT : Theme.MUTED);
    }

    function paso(dc as Graphics.Dc, m as Motor) as Void {
        var lam = m.lamina;
        var yCtx = Lienzo.CONTEXTO_HASTA - 0.045;
        Lienzo.linea(dc, Lienzo.elegirVariante(dc, lam.contexto, Lienzo.T_CONTEXTO, yCtx), Lienzo.T_CONTEXTO, false, yCtx, Theme.FG);
        var y0 = Lienzo.HEROE_DESDE;
        if (lam.nota != null) {
            Lienzo.linea(dc, lam.nota as Lang.String, Lienzo.T_NOTA, false, y0 + 0.03, Theme.MUTED);
            y0 += Lienzo.FILA_NOTA_Y;
        }
        if (lam.heroeEtiqueta != null) {
            Lienzo.linea(dc, lam.heroeEtiqueta as Lang.String, Lienzo.T_NOTA, false, y0 + 0.03, Theme.MUTED);
            y0 += Lienzo.FILA_NOTA_Y;
        }
        heroe(dc, lam.heroeTexto, lam.heroeUnidad, y0, Lienzo.HEROE_HASTA, Theme.FG);
        if (lam.hayBanda) {
            banda(dc, lam);
        } else if (lam.instruccion != null) {
            Lienzo.linea(dc, lam.instruccion as Lang.String, Lienzo.T_TERCERO, true, Lienzo.BANDA_Y + 0.04, Theme.FG);
        }
        if (lam.segundoValor != null) {
            trio(dc, lam.segundoEtiqueta, lam.segundoValor as Lang.String, lam.segundoUnidad, Lienzo.T_SEGUNDO, Lienzo.SEGUNDA_Y);
        }
        if (lam.pieValor != null) {
            pie(dc, lam);
        }
    }

    // El número que manda, en la fuente de cifras, con su unidad pegada, ajustado al ancho de su fila.
    function heroe(dc as Graphics.Dc, txt as Lang.String, unidad as Lang.String or Null, yDesde as Lang.Float, yHasta as Lang.Float, color as Lang.Number) as Void {
        var D = dc.getWidth();
        var alto = yHasta - yDesde;
        var maxPx = Lienzo.cuerpo(Lienzo.T_HEROE, D);
        var porAlto = Lienzo.px(alto / Lienzo.CAJA_CIFRAS, D);
        var p = maxPx < porAlto ? maxPx : porAlto;
        var disp = Lienzo.anchoFila(D, yDesde, alto);
        var suelo = Lienzo.cuerpo(Lienzo.T_SUELO, D);
        var gap = Lienzo.px(Lienzo.AIRE_UNIDAD, D);
        var up = p;
        var w = 0;
        for (var k = 0; k < 3; k++) {
            up = Lienzo.px(Lienzo.T_UNIDAD * p / D, D);
            up = up < suelo ? suelo : up;
            w = Lienzo.ancho(dc, txt, p, true) + (unidad != null ? gap + Lienzo.ancho(dc, unidad, up, false) : 0);
            if (w <= disp || p <= suelo) {
                break;
            }
            p = p * disp / w;
            p = p < suelo ? suelo : p;
        }
        var yC = Lienzo.px((yDesde + yHasta) / 2, D);
        var x0 = (D - w) / 2;
        Lienzo.texto(dc, txt, p, true, x0, yC, Graphics.TEXT_JUSTIFY_LEFT, color);
        if (unidad != null) {
            var xu = x0 + Lienzo.ancho(dc, txt, p, true) + gap;
            Lienzo.texto(dc, unidad, up, false, xu, yC + (p - up) * 42 / 100, Graphics.TEXT_JUSTIFY_LEFT, Theme.MUTED);
        }
    }

    // La banda del objetivo: rótulo a la izquierda, palabra con su ▲▼ a la derecha, y la pista debajo.
    function banda(dc as Graphics.Dc, lam as Lamina) as Void {
        var D = dc.getWidth();
        var cuerpoNota = Lienzo.cuerpo(Lienzo.T_NOTA, D);
        var alto = cuerpoNota * Lienzo.CAJA_TEXTO / D;
        var total = alto + Lienzo.PISTA_HUECO + Lienzo.PISTA_ALTO;
        var disp = Lienzo.anchoFila(D, Lienzo.BANDA_Y, total);
        var x0 = (D - disp) / 2;
        var yTexto = Lienzo.px(Lienzo.BANDA_Y + alto / 2, D);
        var derecha = x0 + disp;
        var reservado = 0;
        var pal = lam.bandaPalabra;
        if (pal != null) {
            var flecha = lam.bandaDir != 0 ? Lienzo.px(Lienzo.FLECHA, D) : 0;
            var aire = Lienzo.px(Lienzo.AIRE_PIEZAS, D);
            var w = Lienzo.ancho(dc, pal, cuerpoNota, lam.bandaFuera);
            Lienzo.texto(dc, pal, cuerpoNota, lam.bandaFuera, derecha, yTexto, Graphics.TEXT_JUSTIFY_RIGHT, lam.bandaFuera ? Theme.FG : Theme.MUTED);
            reservado = w + (flecha > 0 ? flecha + aire / 2 : 0) + aire;
            if (flecha > 0) {
                Lienzo.flecha(dc, derecha - w - aire / 2 - flecha / 2, yTexto, flecha, lam.bandaDir == 1, Theme.FG);
            }
        }
        var rot = lam.bandaRotulo;
        var p = Lienzo.cabe(dc, rot, false, cuerpoNota, disp - reservado, D);
        var t = Lienzo.ancho(dc, rot, p, false) > disp - reservado ? Lienzo.recortar(dc, rot, p, false, disp - reservado) : rot;
        Lienzo.texto(dc, t, p, false, x0, yTexto, Graphics.TEXT_JUSTIFY_LEFT, Theme.MUTED);
        var yPista = Lienzo.px(Lienzo.BANDA_Y + alto + Lienzo.PISTA_HUECO, D);
        var minAncho = 2;
        var marca = Lienzo.px(Lienzo.MARCA_ANCHO, D);
        Lienzo.pista(dc, yPista, x0, disp, lam.bandaDesde, lam.bandaHasta, lam.bandaMarca, Lienzo.px(Lienzo.PISTA_ALTO, D), Lienzo.px(Lienzo.PISTA_MARCA, D), marca < minAncho ? minAncho : marca);
    }

    // «quedan 650 m»: etiqueta pequeña, valor mediano, unidad pequeña, centrados.
    function trio(dc as Graphics.Dc, etiqueta as Lang.String or Null, valor as Lang.String, unidad as Lang.String or Null, frac as Lang.Float, yFrac as Lang.Float) as Void {
        var D = dc.getWidth();
        var pv = Lienzo.cuerpo(frac, D);
        var pe = Lienzo.cuerpo(Lienzo.T_NOTA, D);
        var gap = Lienzo.px(Lienzo.AIRE_PIEZAS, D);
        var alto = pv * Lienzo.CAJA_TEXTO / D;
        var disp = Lienzo.anchoFila(D, yFrac - alto / 2, alto);
        var we = etiqueta != null ? Lienzo.ancho(dc, etiqueta, pe, false) + gap : 0;
        var wu = unidad != null ? Lienzo.ancho(dc, unidad, pe, false) + gap / 2 : 0;
        var wv = Lienzo.ancho(dc, valor, pv, true);
        if (we + wv + wu > disp) {
            pv = Lienzo.cabe(dc, valor, true, pv, disp - we - wu, D);
            wv = Lienzo.ancho(dc, valor, pv, true);
        }
        var x = (D - (we + wv + wu)) / 2;
        var y = Lienzo.px(yFrac, D);
        if (etiqueta != null) {
            Lienzo.texto(dc, etiqueta, pe, false, x, y, Graphics.TEXT_JUSTIFY_LEFT, Theme.MUTED);
        }
        Lienzo.texto(dc, valor, pv, true, x + we, y, Graphics.TEXT_JUSTIFY_LEFT, Theme.FG);
        if (unidad != null) {
            Lienzo.texto(dc, unidad, pe, false, x + we + wv + gap / 2, y + (pv - pe) * 30 / 100, Graphics.TEXT_JUSTIFY_LEFT, Theme.MUTED);
        }
    }

    // El pie: el corazón, el pulso con su zona y «alto» si el techo está pasado; o el ritmo si el héroe es el pulso.
    function pie(dc as Graphics.Dc, lam as Lamina) as Void {
        var D = dc.getWidth();
        var pv = Lienzo.cuerpo(Lienzo.T_TERCERO, D);
        var pe = Lienzo.cuerpo(Lienzo.T_NOTA, D);
        var gap = Lienzo.px(Lienzo.AIRE_PIEZAS, D);
        var corazon = lam.pieCorazon ? Lienzo.px(0.05, D) : 0;
        var valor = lam.pieValor as Lang.String;
        var unidad = lam.pieUnidad;
        var zona = lam.pieZona > 0 ? "Z" + lam.pieZona : null;
        var aviso = lam.pieAviso;
        var wc = corazon > 0 ? corazon + gap / 2 : 0;
        var wv = Lienzo.ancho(dc, valor, pv, true);
        var wu = unidad != null ? Lienzo.ancho(dc, unidad, pe, false) + gap / 2 : 0;
        var wz = zona != null ? Lienzo.ancho(dc, zona, pe, true) + gap : 0;
        var wa = aviso != null ? Lienzo.ancho(dc, aviso, pe, true) + gap + Lienzo.px(Lienzo.FLECHA, D) : 0;
        var alto = pv * Lienzo.CAJA_TEXTO / D;
        var disp = Lienzo.anchoFila(D, Lienzo.PIE_Y - alto / 2, alto);
        // Si no cabe todo, primero cae la zona y luego el aviso (el número no).
        if (wc + wv + wu + wz + wa > disp) {
            zona = null;
            wz = 0;
        }
        if (wc + wv + wu + wa > disp) {
            aviso = null;
            wa = 0;
        }
        var x = (D - (wc + wv + wu + wz + wa)) / 2;
        var y = Lienzo.px(Lienzo.PIE_Y, D);
        if (corazon > 0) {
            Lienzo.corazon(dc, x + corazon / 2, y, corazon, Theme.FG);
            x += wc;
        }
        Lienzo.texto(dc, valor, pv, true, x, y, Graphics.TEXT_JUSTIFY_LEFT, Theme.FG);
        x += wv;
        if (unidad != null) {
            Lienzo.texto(dc, unidad, pe, false, x + gap / 2, y, Graphics.TEXT_JUSTIFY_LEFT, Theme.MUTED);
            x += wu;
        }
        if (zona != null) {
            Lienzo.texto(dc, zona, pe, true, x + gap, y, Graphics.TEXT_JUSTIFY_LEFT, Theme.FG);
            x += wz;
        }
        if (aviso != null) {
            var flecha = Lienzo.px(Lienzo.FLECHA, D);
            Lienzo.flecha(dc, x + gap + flecha / 2, y, flecha, true, Theme.FG);
            Lienzo.texto(dc, aviso, pe, true, x + gap + flecha + gap / 2, y, Graphics.TEXT_JUSTIFY_LEFT, Theme.FG);
        }
    }

    // El deshacer, en la fila del pie: la barra que drena y la acción con su tecla.
    function deshacer(dc as Graphics.Dc, m as Motor) as Void {
        var D = dc.getWidth();
        var disp = Lienzo.anchoFila(D, Lienzo.PIE_Y - 0.04, 0.08);
        var yPie = Lienzo.PIE_Y - 0.04;
        dc.setColor(Theme.BG, Theme.BG);
        dc.fillRectangle(0, Lienzo.px(yPie - 0.012, D), D, Lienzo.px(0.1, D));
        var resta = m.deshacerHasta - System.getTimer();
        resta = resta < 0 ? 0 : (resta > RESTANTE_DESHACER_MS ? RESTANTE_DESHACER_MS : resta);
        dc.setColor(Theme.ACCENT, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle((D - disp) / 2, Lienzo.px(yPie - 0.006, D), disp * resta / RESTANTE_DESHACER_MS, Lienzo.px(0.009, D));
        Lienzo.linea(dc, texto(Rez.Strings.DeshacerAccion), Lienzo.T_NOTA, true, Lienzo.PIE_Y + 0.005, Theme.ACCENT);
    }

    // La vuelta automática recién hecha, unos segundos sobre el paso.
    function tarjeta(dc as Graphics.Dc, m as Motor) as Void {
        Lienzo.linea(dc, m.tarjetaTitulo, Lienzo.T_CONTEXTO, false, Lienzo.CONTEXTO_HASTA - 0.045, Theme.FG);
        heroe(dc, m.tarjetaValor, m.tarjetaPie, Lienzo.HEROE_DESDE, Lienzo.HEROE_HASTA, Theme.FG);
    }

    // ── páginas: Datos, Vueltas, Estructura ──────────────────────────────────

    function pagina(dc as Graphics.Dc, m as Motor) as Void {
        var nombres = [texto(Rez.Strings.PagPaso), texto(Rez.Strings.PagDatos), texto(Rez.Strings.PagVueltas), texto(Rez.Strings.PagEstructura)];
        Lienzo.linea(dc, nombres[m.pagina], Lienzo.T_CONTEXTO, false, Lienzo.CONTEXTO_HASTA - 0.045, Theme.MUTED);
        listaDos(dc, m.filas);
    }

    // Filas de dos columnas [etiqueta, valor, …] repartidas entre 24 % y 84 %.
    function listaDos(dc as Graphics.Dc, filas as Lang.Array<Lang.String>) as Void {
        var D = dc.getWidth();
        var n = filas.size() / 2;
        if (n == 0) {
            return;
        }
        var paso = (0.84 - Lienzo.HEROE_DESDE) / (n > 4 ? n : 4);
        var pl = Lienzo.cuerpo(Lienzo.T_NOTA, D);
        var pv = Lienzo.cuerpo(Lienzo.T_SEGUNDO * 0.8, D);
        for (var k = 0; k < n; k++) {
            var y = Lienzo.HEROE_DESDE + paso * (k + 0.5);
            var alto = pv * Lienzo.CAJA_TEXTO / D;
            var disp = Lienzo.anchoFila(D, y - alto / 2, alto);
            var x0 = (D - disp) / 2;
            var yp = Lienzo.px(y, D);
            var v = filas[2 * k + 1];
            var wv = Lienzo.ancho(dc, v, pv, true);
            var pvv = wv > disp * 62 / 100 ? Lienzo.cabe(dc, v, true, pv, disp * 62 / 100, D) : pv;
            Lienzo.texto(dc, filas[2 * k], pl, false, x0, yp, Graphics.TEXT_JUSTIFY_LEFT, Theme.MUTED);
            Lienzo.texto(dc, v, pvv, true, x0 + disp, yp, Graphics.TEXT_JUSTIFY_RIGHT, Theme.FG);
        }
    }

    // ── pausa, Controles, confirmar ──────────────────────────────────────────

    function pausa(dc as Graphics.Dc, m as Motor) as Void {
        fondo(dc);
        aroDeSesion(dc, m);
        Lienzo.linea(dc, texto(Rez.Strings.EnPausa), Lienzo.T_CONTEXTO, false, Lienzo.CONTEXTO_HASTA - 0.045, Theme.MUTED);
        heroe(dc, Formato.reloj(m.sesionS()), null, Lienzo.HEROE_DESDE, Lienzo.HEROE_HASTA, Theme.FG);
        var ctx = Lienzo.elegirVariante(dc, m.lamina.contexto, Lienzo.T_NOTA, Lienzo.BANDA_Y + 0.04);
        Lienzo.linea(dc, ctx, Lienzo.T_NOTA, false, Lienzo.BANDA_Y + 0.04, Theme.MUTED);
        Lienzo.linea(dc, texto(Rez.Strings.PausaAyuda), Lienzo.T_NOTA, false, Lienzo.PIE_Y, Theme.ACCENT);
    }

    function controles(dc as Graphics.Dc, v as Vivo) as Void {
        fondo(dc);
        var D = dc.getWidth();
        Lienzo.linea(dc, texto(Rez.Strings.CtlTitulo), Lienzo.T_CONTEXTO, false, Lienzo.CONTEXTO_HASTA - 0.045, Theme.MUTED);
        var n = v.controles.size();
        var paso = (0.86 - Lienzo.HEROE_DESDE) / (n > 4 ? n : 4);
        var p = Lienzo.cuerpo(Lienzo.T_TERCERO, D);
        for (var k = 0; k < n; k++) {
            var y = Lienzo.HEROE_DESDE + paso * (k + 0.5);
            var sel = k == v.controlesSel;
            var alto = paso * 0.86;
            var disp = Lienzo.anchoFila(D, y - alto / 2, alto);
            if (sel) {
                dc.setColor(Theme.ACCENT, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(Lienzo.px(MARCO, D) < 2 ? 2 : Lienzo.px(MARCO, D));
                dc.drawRoundedRectangle((D - disp) / 2, Lienzo.px(y - alto / 2, D), disp, Lienzo.px(alto, D), Lienzo.px(alto / 2, D));
                dc.setPenWidth(1);
            }
            var etq = etiquetaControl(v.controles[k]);
            var pc = Lienzo.cabe(dc, etq, sel, p, disp - Lienzo.px(0.05, D), D);
            Lienzo.texto(dc, etq, pc, sel, D / 2, Lienzo.px(y, D), Graphics.TEXT_JUSTIFY_CENTER, sel ? Theme.FG : Theme.MUTED);
        }
    }

    function etiquetaControl(c as Lang.Number) as Lang.String {
        if (c == Vivo.C_PAUSAR) {
            return texto(Rez.Strings.CtlPausar);
        }
        if (c == Vivo.C_SALTAR) {
            return texto(Rez.Strings.CtlSaltar);
        }
        if (c == Vivo.C_MAS_TREINTA) {
            return texto(Rez.Strings.CtlMasTreinta);
        }
        return texto(c == Vivo.C_TERMINAR ? Rez.Strings.CtlTerminar : Rez.Strings.CtlDescartar);
    }

    function confirma(dc as Graphics.Dc, v as Vivo) as Void {
        fondo(dc);
        var terminar = v.confirmaTipo == Vivo.CONFIRMA_TERMINAR;
        Lienzo.linea(dc, texto(terminar ? Rez.Strings.ConfTerminar : Rez.Strings.ConfDescartar), Lienzo.T_SEGUNDO, true, 0.34, Theme.FG);
        var cuerpo = terminar ? Rez.Strings.ConfTerminarCuerpo : (v.confirmaN < CONFIRMAS_DESCARTAR_N ? Rez.Strings.ConfDescartarCuerpo1 : Rez.Strings.ConfDescartarCuerpo2);
        Lienzo.linea(dc, texto(cuerpo), Lienzo.T_TERCERO, false, 0.50, Theme.MUTED);
        Lienzo.linea(dc, texto(Rez.Strings.ConfAyuda), Lienzo.T_NOTA, false, 0.72, Theme.ACCENT);
    }

    // ── el final: RPE, resumen y envío ───────────────────────────────────────

    function rpe(dc as Graphics.Dc, v as Vivo) as Void {
        fondo(dc);
        var m = v.motor as Motor;
        Lienzo.linea(dc, texto(Rez.Strings.RpeTitulo), Lienzo.T_CONTEXTO, false, Lienzo.CONTEXTO_HASTA - 0.045, Theme.MUTED);
        heroe(dc, v.rpeElegido.toString(), null, Lienzo.HEROE_DESDE, Lienzo.HEROE_HASTA, Theme.FG);
        var palabras = m.s.vocab.rpe;
        Lienzo.linea(dc, v.rpeElegido < palabras.size() ? palabras[v.rpeElegido] : "", Lienzo.T_SEGUNDO, true, Lienzo.SEGUNDA_Y - 0.06, Theme.FG);
        Lienzo.linea(dc, texto(Rez.Strings.RpeAyuda), Lienzo.T_NOTA, false, Lienzo.PIE_Y, Theme.MUTED);
    }

    function resumen(dc as Graphics.Dc, v as Vivo) as Void {
        fondo(dc);
        var m = v.motor as Motor;
        Lienzo.aro(dc, MILESIMAS, Theme.ACCENT);
        Lienzo.linea(dc, texto(m.completa ? Rez.Strings.SesionCompletada : Rez.Strings.SesionTerminada), Lienzo.T_CONTEXTO, false, Lienzo.CONTEXTO_HASTA - 0.045, Theme.FG);
        listaDos(dc, v.resumen);
        Lienzo.linea(dc, texto(Rez.Strings.StartHecho), Lienzo.T_NOTA, true, Lienzo.PIE_Y, Theme.ACCENT);
    }

    // El estado honesto del envío: guardado en el reloj, enviado, sesión caducada o el servidor no contesta.
    function envio(dc as Graphics.Dc, ctl as Controller) as Void {
        fondo(dc);
        Lienzo.aro(dc, MILESIMAS, Theme.ACCENT);
        var e = Cola.estado;
        var titulo = Rez.Strings.EnvioGuardado;
        var cuerpo = Rez.Strings.EnvioGuardadoCuerpo;
        if (e == Cola.ESTADO_ENVIANDO) {
            titulo = Rez.Strings.EnvioEnviando;
            cuerpo = Rez.Strings.EnvioEnviandoCuerpo;
        } else if (e == Cola.ESTADO_ENVIADO) {
            titulo = Rez.Strings.EnvioEnviado;
            cuerpo = Rez.Strings.EnvioEnviadoCuerpo;
        } else if (e == Cola.ESTADO_CADUCADA) {
            titulo = Rez.Strings.EnvioCaducada;
            cuerpo = Rez.Strings.EnvioCaducadaCuerpo;
        } else if (e == Cola.ESTADO_SERVIDOR) {
            titulo = Rez.Strings.EnvioServidor;
            cuerpo = Rez.Strings.EnvioServidorCuerpo;
        } else if (e == Cola.ESTADO_SIN_SITIO) {
            titulo = Rez.Strings.EnvioSinSitio;
            cuerpo = Rez.Strings.EnvioSinSitioCuerpo;
        }
        Lienzo.linea(dc, texto(titulo), Lienzo.T_SEGUNDO, true, 0.36, Theme.FG);
        Lienzo.linea(dc, texto(cuerpo), Lienzo.T_TERCERO, false, 0.52, Theme.MUTED);
        var m = ctl.vivo.motor;
        if (m != null && m.sinGrabar) {
            Lienzo.linea(dc, texto(Rez.Strings.EnvioSinGrabarCuerpo), Lienzo.T_NOTA, false, 0.66, Theme.MUTED);
        }
        Lienzo.linea(dc, texto(Rez.Strings.StartHecho), Lienzo.T_NOTA, true, Lienzo.PIE_Y, Theme.ACCENT);
    }
}

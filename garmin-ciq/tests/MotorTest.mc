//
// El motor por partes, en el simulador: ritmo suavizado, veredicto con dirección,
// histéresis del aviso, formatos y el cierre/deshacer de pasos. Funciones puras y un
// Motor sobre una sesión real de los vectores de oro.
//
using Toybox.Lang;
using Toybox.Test;

(:test)
module MotorTest {

    function objetivo(eje as Lang.Number, papel as Lang.Number, min as Lang.Number or Null, max as Lang.Number or Null) as Objetivo {
        var o = new Objetivo();
        o.eje = eje;
        o.papel = papel;
        o.min = min;
        o.max = max;
        return o;
    }

    function sesionDe(caso as Lang.String) as Sesion {
        return Decodificador.decodificar(PlanStoreTest.vector(caso)) as Sesion;
    }

    function sesionVacia() as Sesion {
        var s = new Sesion();
        s.zonasTechos = [138, 150, 160, 173, 192];
        s.reglas.holguraRitmo = 3;
        s.reglas.holguraPpm = 2;
        return s;
    }
}

(:test)
function ritmoSuavizadoDesdeLaDistancia(logger as Test.Logger) as Lang.Boolean {
    var r = new Ritmo();
    // 3,3 m/s = 33 dm por segundo: 5:03/km.
    for (var t = 0; t <= 12; t++) {
        r.agregar(t * 1000, t * 33);
    }
    var d = r.deci();
    if (d == null || d < 3000 || d > 3060) {
        logger.debug("ritmo " + d + " (esperaba ~3030)");
        return false;
    }
    var parado = new Ritmo();
    for (var t = 0; t <= 12; t++) {
        parado.agregar(t * 1000, 100);
    }
    var pocos = new Ritmo();
    pocos.agregar(0, 0);
    pocos.agregar(2000, 60);
    return parado.deci() == null && pocos.deci() == null;
}

(:test)
function elVeredictoDeUnRitmoTieneDireccion(logger as Test.Logger) as Lang.Boolean {
    var s = MotorTest.sesionVacia();
    var o = MotorTest.objetivo(Cod.EJE_RITMO, Cod.PAPEL_PRINCIPAL, 2250, 2350);
    var h = 30;
    // Más rápido = por encima; más lento = por debajo; la holgura es histéresis.
    if (Juez.veredicto(o, 2200, h, s) != Juez.VER_ENCIMA || Juez.veredicto(o, 2225, h, s) != Juez.VER_DENTRO) {
        return false;
    }
    if (Juez.veredicto(o, 2300, h, s) != Juez.VER_DENTRO || Juez.veredicto(o, 2400, h, s) != Juez.VER_DEBAJO) {
        return false;
    }
    o.avisa = Cod.AVISA_SOLO_ARRIBA + 1;
    return Juez.veredicto(o, 2400, h, s) == Juez.VER_DENTRO;
}

(:test)
function laZonaDeUnPasoSeJuzgaConLasZonasDelCoach(logger as Test.Logger) as Lang.Boolean {
    var s = MotorTest.sesionVacia();
    var z2 = MotorTest.objetivo(Cod.EJE_ZONA, Cod.PAPEL_PRINCIPAL, 20, 20);
    var h = 20;
    // Z2 = 139-150 bpm. 160 está por encima; 145 dentro; 130 por debajo.
    return Juez.veredicto(z2, 1600, h, s) == Juez.VER_ENCIMA &&
           Juez.veredicto(z2, 1450, h, s) == Juez.VER_DENTRO &&
           Juez.veredicto(z2, 1300, h, s) == Juez.VER_DEBAJO &&
           Juez.zonaDe(145, s.zonasTechos as Lang.Array<Lang.Number>) == 2;
}

(:test)
function elAvisoEsperaLaConfirmacionYRespetaLaCadencia(logger as Test.Logger) as Lang.Boolean {
    var r = new Reglas();
    r.confirmacionS = 4;
    r.cadenciaS = 20;
    r.graciaZonaS = 45;
    var p = new Paso();
    p.rol = Cod.ROL_TRABAJO;
    p.fase = Cod.FASE_PRINCIPAL;
    var e = new Juez.EstadoAviso();
    var eventos = [] as Lang.Array<Lang.Number>;
    // Se sale por encima en t=10 y se sigue fuera: el aviso llega 4 s después de salir (t=14) y no se repite antes de 20 s.
    for (var t = 10; t <= 40; t++) {
        eventos.add(Juez.decidirAviso(e, Juez.VER_ENCIMA, t, p, false, r));
    }
    var avisos = 0;
    var primero = -1;
    for (var k = 0; k < eventos.size(); k++) {
        if (eventos[k] == Juez.AVISO_AFLOJA) {
            avisos++;
            primero = primero < 0 ? 10 + k : primero;
        }
    }
    if (avisos != 2 || primero != 14) {
        logger.debug("avisos " + avisos + " primero " + primero);
        return false;
    }
    // En un calentamiento no se avisa nunca (salvo que el coach lo pida).
    var c = new Paso();
    c.fase = Cod.FASE_CALENTAMIENTO;
    c.rol = Cod.ROL_TRABAJO;
    var e2 = new Juez.EstadoAviso();
    for (var t = 0; t < 30; t++) {
        if (Juez.decidirAviso(e2, Juez.VER_ENCIMA, t, c, false, r) != Juez.AVISO_NINGUNO) {
            return false;
        }
    }
    return true;
}

(:test)
function losFormatosSonEnterosYConComaEspanola(logger as Test.Logger) as Lang.Boolean {
    return Formato.reloj(2246).equals("37:26") &&
           Formato.reloj(3725).equals("1:02:05") &&
           Formato.ritmo(2320).equals("3:52") &&
           Formato.ritmo(null).equals("--") &&
           Formato.distancia(1250).equals("1,25 km") &&
           Formato.distancia(800).equals("800 m") &&
           Formato.duracion(90).equals("90 s") &&
           Formato.duracion(150).equals("2:30 min") &&
           Formato.num(85).equals("8,5") &&
           Formato.duracionLarga(3900).equals("1 h 05");
}

(:test)
function laLaminaDeUnRodajeADosPonePulsoYFalta(logger as Test.Logger) as Lang.Boolean {
    var s = MotorTest.sesionDe("491");
    var p = s.pasos[0];
    var lam = new Lamina();
    var l = new Juez.Lectura();
    l.ppm = 1450;
    Laminar.componer(lam, s, p, s.pasos[1], l, 120, null, false);
    // Un paso a zona manda el pulso (145 ppm, zona 2), con banda y lo que falta; el ritmo, ausente.
    return lam.heroeTipo == Lamina.HEROE_PULSO && lam.heroeTexto.equals("145") && lam.heroeZona == 2 && lam.hayBanda && lam.bandaMarca >= 0;
}

(:test)
function cerrarUnPasoADedoSeDeshaceYElUltimoEspera(logger as Test.Logger) as Lang.Boolean {
    var s = MotorTest.sesionDe("491");
    var m = new Motor(s, 0, new Grabacion());
    m.arrancar();
    m.siguientePaso();
    if (m.i != 1 || !m.puedeDeshacer()) {
        logger.debug("tras BACK: paso " + m.i);
        return false;
    }
    m.deshacer();
    if (m.i != 0 || m.tramos.size() != 0) {
        logger.debug("tras deshacer: paso " + m.i + " tramos " + m.tramos.size());
        return false;
    }
    m.siguientePaso();
    m.siguientePaso();
    // El último paso cerrado a mano espera 5 s: aún no ha terminado y se puede reabrir.
    if (!m.cerrandoUltimo || m.terminado) {
        return false;
    }
    m.deshacer();
    return !m.cerrandoUltimo && m.i == 1 && !m.terminado;
}

(:test)
function terminarAntesDejaLoHechoComoParcial(logger as Test.Logger) as Lang.Boolean {
    var m = new Motor(MotorTest.sesionDe("491"), 0, new Grabacion());
    m.arrancar();
    m.terminarAntes();
    return m.terminado && !m.completa && m.tramos.size() == Motor.T_LARGO && m.tramos[Motor.T_CIERRE] == Motor.CIERRE_INCOMPLETO;
}

(:test)
function seguirUnaSesionInterrumpidaRetomaEnSuPasoYSuTiempo(logger as Test.Logger) as Lang.Boolean {
    var s = MotorTest.sesionDe("479");
    var m = new Motor(s, 1000, new Grabacion());
    var chk = { "id" => 479, "huella" => s.huella, "inicio" => 1000, "paso" => 3, "sesS" => 600, "dm" => 15000, "ppmS" => 1000, "ppmN" => 10, "ppmM" => 170, "tramos" => [0, 0, 300, 900, 0, 0, 0, 0, 0], "vueltas" => [0, 300, 900, 3330] };
    m.restaurar(chk);
    // Retoma en el paso 3 con los 10 min hechos, 1500 m y el tramo ya cerrado.
    return m.i == 3 && m.sesionS() >= 600 && m.sesionS() <= 602 && m.totalM() >= 1500 && m.tramos.size() == Motor.T_LARGO && m.pasoS() <= 2;
}

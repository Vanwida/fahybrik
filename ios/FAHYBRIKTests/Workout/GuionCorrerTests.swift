import XCTest
@testable import FAHYBRIK

// LAS TRES PÁGINAS DE CORRER — y sobre todo que SUS SUJETOS CABEN.
//
// El presupuesto del lienzo (`WatchSujeto`) es aritmética pura, así que se puede
// recorrer sin montar un reloj: un sujeto que no entra rompe aquí en vez de llegar
// a la muñeca encogido, que es la clase de fallo que sólo se ve mirando la pantalla
// a tamaño real.
final class GuionCorrerTests: XCTestCase {

    // MARK: - El orden y quién manda

    /// EL VIVO ES EL CENTRO. No es estética: ni los datos ni los controles pueden
    /// estar a más de un gesto, y volver al esfuerzo tampoco.
    func testElVivoEsLaDelCentroYLaDeArranque() {
        let p = GuionCorrer.paginas(rodaje(), .init())
        XCTAssertEqual(p.map(\.id), [GuionCorrer.idDatos, GuionCorrer.idVivo, GuionCorrer.idControles])
        XCTAssertEqual(p[1].id, GuionCorrer.idVivo, "el vivo va en medio")
    }

    /// La de datos es la única SIN sujeto, y la de controles la única con botones.
    func testCadaPaginaEsDeSuClase() {
        let p = GuionCorrer.paginas(rodaje(), .init())
        XCTAssertNotNil(p[0].filas, "los datos son un panel de filas")
        XCTAssertFalse(p[0].tieneSujeto, "la página de datos no gobierna con un número")
        XCTAssertTrue(p[1].tieneSujeto, "el vivo es un numeral a sangre")
        XCTAssertNotNil(p[2].botones, "los controles son botones")
    }

    /// CERO CONTROLES CORRIENDO: el vivo no anuncia franja. Es `ojeada`, así que
    /// aunque trajera acción el lienzo no la pintaría.
    func testElVivoNoAnunciaControlesMientrasCorres() {
        let vivo = GuionCorrer.vivo(rodaje(), .init())
        XCTAssertEqual(vivo.modo, .ojeada)
        XCTAssertNil(vivo.accion, "corriendo no se toca: el reloj no pide nada")
    }

    // MARK: - El sujeto del vivo es LO QUE FALTA

    func testElSujetoSonLosMetrosQueFaltanConSusDosDecimales() {
        // Rodaje de 10 km a los 5.240 m: faltan 4,76.
        var e = rodaje()
        e.pieza = .distancia(objetivoM: 10_000, hechoM: 5_240)
        let vivo = GuionCorrer.vivo(e, .init())
        XCTAssertEqual(vivo.sujeto, "4,76")
        XCTAssertEqual(vivo.unidad, "km")
        XCTAssertTrue(vivo.contexto.hasSuffix("te quedan"), "la banda lo dice con palabras")
    }

    /// Los dos decimales no son adorno: 5,24 + 4,76 = 10,00, y si el que falta
    /// redondeara a uno, la suma dejaría de dar.
    func testLosDosDecimalesCuadranConLoCubierto() {
        var e = rodaje()
        e.pieza = .distancia(objetivoM: 10_000, hechoM: 5_240)
        let falta = GuionCorrer.loQueFalta(e)
        let cubierto = Formato.distanciaCifra(5_240)
        XCTAssertEqual(falta?.cifra, "4,76")
        XCTAssertEqual(cubierto?.cifra, "5,24")
    }

    /// Por debajo del kilómetro el sujeto son METROS: «500 m», no «0,50 km».
    func testPorDebajoDelKilometroElSujetoSonMetros() {
        var e = serie()
        e.pieza = .distancia(objetivoM: 1_000, hechoM: 500)
        let vivo = GuionCorrer.vivo(e, .init())
        XCTAssertEqual(vivo.sujeto, "500")
        XCTAssertEqual(vivo.unidad, "m")
    }

    /// SIN SEÑAL: el GPS no ha fijado, así que no hay metros ni ritmo que pintar y el
    /// sujeto cae al reloj de la pieza. No se inventa un ritmo ni se pinta un cero
    /// que parezca dato, y la banda pasa a decir «llevas».
    func testSinSenalElSujetoCaeAlRelojYLoDice() {
        var e = rodaje()
        e.pieza = .distancia(objetivoM: 10_000, hechoM: nil)
        e.enPiezaS = 48
        let vivo = GuionCorrer.vivo(e, .init())
        // Ancho fijo, que es la regla del reloj de la muñeca: la cifra no baila
        // mientras corres. No se inventa aquí una segunda grafía del crono.
        XCTAssertEqual(vivo.sujeto, "00:48")
        XCTAssertNil(vivo.unidad)
        XCTAssertTrue(vivo.contexto.hasSuffix("llevas"), "sin resta que hacer, se dice lo que llevas")
        XCTAssertEqual(vivo.nota, WatchNota.sinSenal)
    }

    // MARK: - Los estados

    /// EN PAUSA el dato no desaparece, se APAGA: sigues sabiendo dónde lo dejaste.
    func testEnPausaElDatoSeApagaPeroSigueAhi() {
        var e = rodaje()
        e.pieza = .distancia(objetivoM: 10_000, hechoM: 5_240)
        e.fase = .pausa
        let vivo = GuionCorrer.vivo(e, .init())
        XCTAssertEqual(vivo.sujeto, "4,76", "el número se queda donde lo dejaste")
        XCTAssertEqual(vivo.tono, WatchTheme.inkApagado)
        XCTAssertTrue(vivo.contexto.hasPrefix("En pausa"))
    }

    /// EL DESCANSO es el único tramo en marcha en el que se puede mirar y tocar, y el
    /// único fondo apagado: aquí la zona deja de mandar. Es `restBg`, no un tinte.
    func testEnElDescansoLaZonaDejaDeMandarYSeAnunciaElGesto() {
        var e = serie()
        e.fase = .recupera
        e.pieza = .tiempo(quedaS: 72)
        e.siguiente = "1200 m"
        let vivo = GuionCorrer.vivo(e, .init())
        // La cuenta atrás tiene UNA regla en toda la app (`CountdownFormat`), y es de
        // ancho fijo. Aquí no se escribe «1:12» a mano: sería la segunda grafía del
        // mismo número.
        XCTAssertEqual(vivo.sujeto, "01:12")
        XCTAssertEqual(vivo.tono, WatchTheme.zoneGreen)
        XCTAssertEqual(vivo.fondo, WatchTheme.restBg, "en el descanso el fondo no es la zona")
        XCTAssertEqual(vivo.modo, .mando, "es el único sitio del vivo donde se puede tocar")
        XCTAssertNotNil(vivo.accion, "y por eso es el único que anuncia el gesto")
        XCTAssertEqual(vivo.segundoValor, "1200 m", "parado, lo que hace falta saber es qué toca")
    }

    /// Con serie prescrita cambia el CONTENIDO, no la interfaz: la etiqueta del ritmo
    /// pasa a decir cómo vas contra el suyo.
    func testConObjetivoLaEtiquetaDelRitmoEsElVeredicto() {
        var e = serie()
        e.objetivoLabel = "4:10 /km"
        e.objetivoEstado = .inTarget
        XCTAssertEqual(GuionCorrer.etiquetaDelRitmo(e), "En objetivo")
        e.objetivoEstado = .tooSlow
        XCTAssertEqual(GuionCorrer.etiquetaDelRitmo(e), "Vas lento")
    }

    /// Sin objetivo escrito NO hay veredicto: un rodaje libre no está «mal» a
    /// ninguna intensidad.
    func testSinObjetivoNoHayVeredicto() {
        XCTAssertEqual(GuionCorrer.etiquetaDelRitmo(rodaje()), "Ritmo")
    }

    /// Y el veredicto NO habla en color: mientras el lienzo lleve la zona, un «en
    /// objetivo» verde sobre un lienzo verde no se lee, y sobre un ámbar diría dos
    /// cosas a la vez.
    func testElVeredictoNoHablaEnColor() {
        var e = serie()
        e.objetivoLabel = "4:10 /km"
        e.objetivoEstado = .inTarget
        XCTAssertNil(GuionCorrer.vivo(e, .init()).segundoTono)
    }

    // MARK: - Los datos son de LA SESIÓN

    func testElPanelLlevaLasCuatroCifrasDeLaSesion() {
        var e = rodaje()
        e.sesionS = 1_635          // 27:15
        e.sesionMetros = 5_240
        e.sesionRitmoSecPorKm = 312 // 5:12
        e.bpm = 150
        e.zonaViva = .z3
        guard let filas = GuionCorrer.datos(e).filas else {
            return XCTFail("los datos son un panel")
        }
        XCTAssertEqual(filas.map(\.id), ["tiempo", "distancia", "ritmo", "pulso"])
        XCTAssertEqual(filas[0].valor, "27:15")
        XCTAssertEqual(filas[1].valor, "5,24")
        XCTAssertEqual(filas[1].unidad, "km")
        XCTAssertEqual(filas[2].valor, "5:12")
        XCTAssertEqual(filas[3].valor, "150")
        XCTAssertEqual(filas[3].cola, "Z3 medio", "la zona va CON el pulso, no en su propia fila")
        XCTAssertEqual(GuionCorrer.datos(e).contexto, "La sesión", "y lo dice arriba de qué habla")
    }

    /// SIN UMBRAL — el estado de hoy: ningún atleta tiene umbral medido, así que no
    /// hay zona. El pulso va en ppm crudos y la nota del pie dice por qué.
    func testSinUmbralElPulsoVaCrudoYLoDiceElPie() {
        var e = rodaje()
        e.bpm = 150
        e.zonaViva = nil
        let datos = GuionCorrer.datos(e)
        guard let filas = datos.filas else { return XCTFail("panel") }
        XCTAssertNil(filas.last?.cola, "sin umbral no se insinúa una zona")
        XCTAssertEqual(datos.nota, WatchNota.sinAncla)
    }

    /// Sin GPS no hay fila de distancia ni de ritmo. Un cero ahí se lee como una
    /// medida, y no lo es.
    func testSinMetrosNoSeInventanFilas() {
        var e = rodaje()
        e.sesionMetros = nil
        e.sesionRitmoSecPorKm = nil
        e.bpm = nil
        guard let filas = GuionCorrer.datos(e).filas else { return XCTFail("panel") }
        XCTAssertEqual(filas.map(\.id), ["tiempo"], "el tiempo es lo único que el reloj sabe siempre")
    }

    // MARK: - Los controles

    func testLosControlesSonPausarNuevoTramoYTerminar() {
        guard let b = GuionCorrer.controles(rodaje(), .init()).botones else {
            return XCTFail("controles")
        }
        XCTAssertEqual(b.map(\.id), ["pausa", "nuevoTramo", "terminar"])
        XCTAssertEqual(b[0].titulo, "Pausar")
        XCTAssertEqual(b[0].peso, .principal, "la más frecuente y la más urgente")
        XCTAssertEqual(b[2].peso, .destructiva)
        XCTAssertNotNil(b[2].confirma, "un desliz de más no puede acabar una carrera")
    }

    func testEnPausaElPrincipalDiceReanudar() {
        var e = rodaje()
        e.fase = .pausa
        guard let b = GuionCorrer.controles(e, .init()).botones else {
            return XCTFail("controles")
        }
        XCTAssertEqual(b[0].titulo, "Reanudar")
    }

    /// «NUEVO TRAMO» ES EL CORTE DEL ATLETA. Con estructura escrita el corte ya lo
    /// puso el coach, así que el botón no está — y no es prudencia de pantalla: el
    /// motor tampoco crea el parcial ahí, porque cada tramo ya escribe el suyo.
    func testConEstructuraDelCoachNoHayNuevoTramo() {
        var e = serie()
        e.hayEstructura = true
        guard let b = GuionCorrer.controles(e, .init()).botones else {
            return XCTFail("controles")
        }
        XCTAssertFalse(b.contains { $0.id == "nuevoTramo" })
    }

    func testSoloConBloqueDetrasApareceSiguienteBloque() {
        var e = rodaje()
        e.hayBloqueSiguiente = true
        guard let b = GuionCorrer.controles(e, .init()).botones else {
            return XCTFail("controles")
        }
        XCTAssertEqual(b.map(\.id), ["pausa", "nuevoTramo", "siguiente", "terminar"])
        XCTAssertEqual(b.last?.id, "terminar", "la destructiva siempre abajo")
    }

    /// EL RELOJ NO SE VA: se decide sin perder de vista la carrera.
    func testLosControlesMantienenElCronoDeLaSesion() {
        var e = rodaje()
        e.sesionS = 1_635
        XCTAssertEqual(GuionCorrer.controles(e, .init()).contexto, "Rodaje · 27:15")
    }

    /// UN LARGO PASA DE LA HORA, y es el entreno más habitual de todos. El crono de
    /// la muñeca se escribe en MINUTOS también entonces: «1:02:40» son siete glifos y
    /// el sujeto tiene un tope de cinco, así que ahí el numeral se encogía por debajo
    /// de su suelo y dejaba de leerse como el dato.
    func testPasadaLaHoraElCronoSigueEnMinutos() {
        XCTAssertEqual(WatchFormat.clock(3_760), "62:40")
        var e = rodaje()
        e.pieza = .abierta
        e.enPiezaS = 3_760
        let vivo = GuionCorrer.vivo(e, .init())
        XCTAssertEqual(vivo.sujeto, "62:40")
        guard case let .cabe(alto) = WatchSujeto.veredicto(de: vivo, varias: true) else {
            return XCTFail("un rodaje de más de una hora tiene que caber en la muñeca")
        }
        XCTAssertGreaterThanOrEqual(alto, WatchSujeto.suelo)
    }

    // MARK: - AUTO-QA: que los sujetos CABEN

    /// Cada sujeto de cada estado, contra el suelo de 43 pt y el tope de cinco
    /// cifras enteras. Sin esto, «no cabe en la muñeca» vuelve a ser una opinión.
    func testTodosLosSujetosDeCorrerCabenEnLaMuneca() {
        var casos: [(String, GuionCorrer.Estado)] = []

        var rodajeLargo = rodaje()
        rodajeLargo.pieza = .distancia(objetivoM: 10_000, hechoM: 5_240)
        casos.append(("rodaje de 10 km", rodajeLargo))

        var arranque = rodaje()
        arranque.pieza = .distancia(objetivoM: 10_000, hechoM: 0)
        casos.append(("recién salido (faltan 10,00)", arranque))

        var sinSenal = rodaje()
        sinSenal.pieza = .distancia(objetivoM: 10_000, hechoM: nil)
        sinSenal.enPiezaS = 48
        casos.append(("sin señal", sinSenal))

        var largo = rodaje()
        largo.pieza = .abierta
        largo.enPiezaS = 3_780      // «63:00» — el crono pasa de la hora
        casos.append(("rodaje de hora y pico", largo))


        var serieMil = serie()
        serieMil.pieza = .distancia(objetivoM: 1_000, hechoM: 500)
        casos.append(("serie de 1.000 a medias", serieMil))

        var umbral = serie()
        umbral.pieza = .tiempo(quedaS: 300)
        casos.append(("5:00 de umbral", umbral))

        var descanso = serie()
        descanso.fase = .recupera
        descanso.pieza = .tiempo(quedaS: 72)
        descanso.siguiente = "1200 m"
        casos.append(("descanso", descanso))

        for (nombre, e) in casos {
            let vivo = GuionCorrer.vivo(e, .init())
            switch WatchSujeto.veredicto(de: vivo, varias: true) {
            case let .cabe(alto):
                XCTAssertGreaterThanOrEqual(alto, WatchSujeto.suelo, nombre)
            case let .demasiadosGlifos(n):
                XCTFail("«\(nombre)»: «\(vivo.sujeto)» tiene \(n) cifras enteras (máx \(WatchSujeto.glifosMax))")
            case let .sinSitio(alto):
                XCTFail("«\(nombre)»: «\(vivo.sujeto)» se queda en \(Int(alto)) pt (suelo \(Int(WatchSujeto.suelo)))")
            }
        }
    }

    /// EL TECHO QUE SÍ SE CRUZA, escrito para que no se descubra en la muñeca.
    ///
    /// Pasados los 99 minutos el crono son SEIS glifos («119:00») y ya no cabe como
    /// sujeto. Sólo se llega ahí con el crono DE SUJETO, o sea sin un solo metro
    /// medido en una hora y cuarenta, que es el único caso en que el vivo cae al
    /// reloj. La respuesta de diseño está escrita en el kit —la hora se va al
    /// contexto y el sujeto se queda en los minutos— y NO está construida: este test
    /// clava el límite en vez de dejar un verde que no lo cubre.
    func testPasados99MinutosElCronoYaNoCabeComoSujeto() {
        var e = rodaje()
        e.pieza = .abierta
        e.enPiezaS = 7_140
        let vivo = GuionCorrer.vivo(e, .init())
        XCTAssertEqual(vivo.sujeto, "119:00")
        guard case let .demasiadosGlifos(n) = WatchSujeto.veredicto(de: vivo, varias: true) else {
            return XCTFail("si esto empieza a caber es que alguien resolvió la hora: quita este test")
        }
        XCTAssertEqual(n, 6)
    }

    /// Y la aritmética que lo sostiene: la unidad y el decimal NO cuentan como
    /// cifras enteras. Con el `switch` sobre `texto.count` de antes, «4,76 km» salía
    /// a cuatro glifos y el numeral perdía un tercio de su tamaño.
    func testElDecimalYLaUnidadNoCuentanComoCifras() {
        XCTAssertEqual(WatchSujeto.anchoEnGlifos("4,76", unidad: "km"), 1 + 3 * 0.42 + 2 * 0.30, accuracy: 0.001)
        XCTAssertGreaterThan(WatchSujeto.altoPorAncho("4,76", unidad: "km"),
                             WatchSujeto.altoPorAncho("4,76 km"),
                             "partir la unidad le devuelve altura al numeral")
    }

    // MARK: - Estados de prueba

    private func rodaje() -> GuionCorrer.Estado {
        GuionCorrer.Estado(contextoPieza: "Rodaje")
    }

    private func serie() -> GuionCorrer.Estado {
        GuionCorrer.Estado(contextoPieza: "Serie 3 de 5")
    }
}

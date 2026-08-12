import XCTest
@testable import FAHYBRIK

// LA PRECEDENCIA DEL SUJETO, clavada. Un error aquí no se ve mirando la pantalla: se
// ve cuando un atleta lee el número equivocado de su propia sesión, y por eso esta
// mitad se prueba sola, sin vista.
//
// Contrato: `web/components/design-twin/screens/lectura-carrera/modelo.ts` y la
// entrada de `docs/DECISIONS.md` del 12-ago.
final class LecturaDeCarreraTests: XCTestCase {

    // MARK: - Escenarios

    private func trabajo(
        _ n: Int, skm: Double?, dur: Double = 180, veredicto: RunComplianceVerdict? = nil,
        pendiente: Double? = nil, fc: Double? = nil
    ) -> Repeticion {
        Repeticion(n: n, papel: .trabajo, modo: nil, inicioS: Double(n - 1) * 300,
                   duracionS: dur, distanciaM: nil, ritmoSkm: skm, fcMediaPpm: fc,
                   pendientePct: pendiente, veredicto: veredicto)
    }

    private func recuperacion(
        _ n: Int, skm: Double?, modo: ModoRecuperacion, dur: Double = 120,
        inicio: Double? = nil, veredicto: RunComplianceVerdict? = nil
    ) -> Repeticion {
        Repeticion(n: n, papel: .recuperacion, modo: modo,
                   inicioS: inicio ?? (Double(n - 1) * 300 + 180), duracionS: dur,
                   distanciaM: nil, ritmoSkm: skm, fcMediaPpm: nil,
                   pendientePct: nil, veredicto: veredicto)
    }

    private func carrera(
        objetivo: Objetivo = .ninguno,
        objetivoRecuperacion: Objetivo? = nil,
        repeticiones: [Repeticion] = [],
        conTraza: Bool = true,
        momento: MomentoDeLectura = .alTerminar,
        zonasS: [Zona: Double] = [:],
        distanciaM: Double = 10_000,
        duracionS: Double = 2_700
    ) -> Carrera {
        Carrera(
            titulo: "Sesión", cuando: "Hoy", momento: momento, prescrito: nil,
            objetivo: objetivo, objetivoRecuperacion: objetivoRecuperacion,
            superficie: .calle, distanciaM: distanciaM, duracionS: duracionS,
            fcMediaPpm: nil, fcMaxPpm: nil, desnivelM: nil,
            traza: conTraza ? Traza(ritmo: [Muestra(t: 0, v: 270)], pulso: []) : nil,
            repeticiones: repeticiones, certezaTramos: repeticiones.isEmpty ? nil : .marcados,
            kilometros: [], zonasS: zonasS, derivado: .init(), ruta: [], dicho: nil
        )
    }

    // MARK: - 1 · Hubo objetivo medible → el veredicto

    // EL SUJETO QUE ALEX ELIGIÓ. El ritmo medio de unas series lo da cualquier reloj de
    // 200 euros; el veredicto contra la banda del entrenador no lo puede dar nadie más.
    func testConObjetivoYVariasRepeticionesElSujetoEsElVeredicto() {
        let c = carrera(
            objetivo: .ritmo(rapidoSkm: 200, lentoSkm: 215),
            repeticiones: [
                trabajo(1, skm: 205, veredicto: .dentro),
                trabajo(2, skm: 208, veredicto: .dentro),
                trabajo(3, skm: 210, veredicto: .dentro),
                trabajo(4, skm: 212, veredicto: .dentro),
                trabajo(5, skm: 224, veredicto: .fueraLento),
                trabajo(6, skm: 218, veredicto: .fueraLento),
            ]
        )
        let l = Lectura.deCorrer(c)

        guard case .veredicto(let dentro, let evaluables, let sesgo, let peor, _) = l.sujeto else {
            return XCTFail("el sujeto tenía que ser el veredicto, fue \(l.sujeto)")
        }
        XCTAssertEqual(dentro, 4)
        XCTAssertEqual(evaluables, 6)
        XCTAssertEqual(sesgo, .lento, "las dos que se salieron se fueron lentas")
        XCTAssertEqual(peor ?? 0, 9, accuracy: 0.01, "224 contra el borde lento de 215")
        XCTAssertEqual(l.troceado, .repeticiones, "los kilómetros de un 6×800 no dicen nada")
        XCTAssertEqual(l.eje, .ritmo)
        XCTAssertEqual(l.banda, .ritmo(rapidoSkm: 200, lentoSkm: 215))
        XCTAssertEqual(l.veredictos.count, 6)
    }

    // CON UN SOLO TRAMO NO HAY VEREDICTO QUE DAR. «1 de 1 dentro» no es una lectura:
    // es la media con un sello encima, así que manda la media.
    func testUnSoloTramoNoDaVeredicto() {
        let c = carrera(
            objetivo: .ritmo(rapidoSkm: 200, lentoSkm: 215),
            repeticiones: [trabajo(1, skm: 205, veredicto: .dentro)]
        )
        let l = Lectura.deCorrer(c)

        guard case .ritmoMedio(let skm, let veredicto) = l.sujeto else {
            return XCTFail("con un tramo manda la media, fue \(l.sujeto)")
        }
        XCTAssertEqual(skm, 205, accuracy: 0.01)
        XCTAssertEqual(veredicto, .dentro, "el veredicto baja a apoyo, servido por el servidor")
        XCTAssertEqual(l.troceado, .kilometros)
    }

    // El sesgo distingue hacia dónde se falló, que es lo que informa al coach.
    func testElSesgoDistingueHaciaDondeSeFallo() {
        XCTAssertNil(Lectura.sesgoDe([.dentro, .dentro]))
        XCTAssertEqual(Lectura.sesgoDe([.dentro, .fueraLento]), .lento)
        XCTAssertEqual(Lectura.sesgoDe([.dentro, .fueraRapido]), .rapido)
        XCTAssertEqual(Lectura.sesgoDe([.fueraRapido, .fueraLento]), .mixto)
    }

    // Sin ni un tramo evaluable (el servidor no pudo juzgar ninguno) el veredicto no
    // se enseña vacío: se cae al siguiente escalón de la precedencia.
    func testSinTramosEvaluablesNoHayVeredicto() {
        let c = carrera(
            objetivo: .ritmo(rapidoSkm: 200, lentoSkm: 215),
            repeticiones: [
                trabajo(1, skm: 205, veredicto: .sinDato),
                trabajo(2, skm: 208, veredicto: .sinDato),
            ]
        )
        if case .veredicto = Lectura.deCorrer(c).sujeto {
            XCTFail("sin nada evaluable no se puede afirmar un veredicto")
        }
    }

    // MARK: - 2 · Contraste sin objetivo

    // Un fartlek por sensaciones no tiene número contra el que medir: el contraste
    // fuerte contra suave ES la lectura.
    func testSinObjetivoManaElContraste() {
        let c = carrera(
            objetivo: .sensacion,
            repeticiones: [
                trabajo(1, skm: 200, dur: 60), recuperacion(1, skm: 330, modo: .trote),
                trabajo(2, skm: 204, dur: 60), recuperacion(2, skm: 340, modo: .trote),
                trabajo(3, skm: 202, dur: 60), recuperacion(3, skm: 335, modo: .trote),
            ]
        )
        let l = Lectura.deCorrer(c)

        guard case .contraste(let n, let fuerte, let suave, let contraste, let modo) = l.sujeto else {
            return XCTFail("tenía que mandar el contraste, fue \(l.sujeto)")
        }
        XCTAssertEqual(n, 3)
        XCTAssertEqual(fuerte, 202, accuracy: 0.01)
        XCTAssertEqual(suave ?? 0, 335, accuracy: 0.01)
        XCTAssertEqual(contraste ?? 0, 133, accuracy: 0.01)
        XCTAssertEqual(modo, .trote)
        XCTAssertNil(l.banda, "no había objetivo: no hay franja que dibujar")
    }

    // MARK: - 3 y 4 · Continuo

    // Objetivo de zona en un continuo: el sujeto es el tiempo DENTRO de la zona, y la
    // banda se dibuja sobre el PULSO — dibujarle una de ritmo sería enseñar una
    // comparación que nadie hizo.
    func testZonaEnContinuoDaTiempoEnZonaYBandaDePulso() {
        let c = carrera(
            objetivo: .zona(2, minPpm: 130, maxPpm: 148),
            zonasS: [2: 2_160], duracionS: 2_700
        )
        let l = Lectura.deCorrer(c)

        guard case .tiempoEnZona(let zona, let segundos, let pct) = l.sujeto else {
            return XCTFail("tenía que ser el tiempo en zona, fue \(l.sujeto)")
        }
        XCTAssertEqual(zona, 2)
        XCTAssertEqual(segundos, 2_160)
        XCTAssertEqual(pct, 80)
        XCTAssertEqual(l.banda, .pulso(minPpm: 130, maxPpm: 148, zona: 2))
        XCTAssertEqual(l.troceado, .kilometros, "un rodaje no tiene repeticiones")
    }

    // Un rodaje sin objetivo: la media geométrica de la sesión, y ninguna banda.
    func testRodajeSinObjetivoDaLaMedia() {
        let c = carrera(distanciaM: 10_000, duracionS: 2_700)
        let l = Lectura.deCorrer(c)

        guard case .ritmoMedio(let skm, let veredicto) = l.sujeto else {
            return XCTFail("tenía que ser la media, fue \(l.sujeto)")
        }
        XCTAssertEqual(skm, 270, accuracy: 0.01, "2700 s / 10 km")
        XCTAssertNil(veredicto)
        XCTAssertNil(l.banda)
    }

    // MARK: - 5 · El corrector de pendiente

    // EN CUESTA EL VEREDICTO DE RITMO SE RETIRA. Un ritmo bruto al 8% no significa
    // nada, así que el troceado se lee en TIEMPO y no se emite un juicio malo.
    func testEnCuestaElRitmoSeRetiraYSeLeeEnTiempo() {
        let c = carrera(
            objetivo: .ritmo(rapidoSkm: 200, lentoSkm: 215),
            objetivoRecuperacion: .ritmo(rapidoSkm: 320, lentoSkm: 360),
            repeticiones: [
                trabajo(1, skm: 300, dur: 48, veredicto: .fueraLento, pendiente: 8),
                trabajo(2, skm: 310, dur: 50, veredicto: .fueraLento, pendiente: 8),
                recuperacion(1, skm: 700, modo: .andando),
                trabajo(3, skm: 320, dur: 53, veredicto: .fueraLento, pendiente: 8),
            ]
        )
        let l = Lectura.deCorrer(c)

        guard case .tiempoPorRepeticion(let n, let media, let primera, let ultima, let pct) = l.sujeto
        else { return XCTFail("en cuesta se lee en tiempo, fue \(l.sujeto)") }
        XCTAssertEqual(n, 3)
        XCTAssertEqual(media, 50.33, accuracy: 0.01)
        XCTAssertEqual(primera, 48)
        XCTAssertEqual(ultima, 53)
        XCTAssertEqual(pct, 8, accuracy: 0.01)
        XCTAssertEqual(l.eje, .tiempo)
        XCTAssertNil(l.banda, "una banda de ritmo en cuesta compara lo incomparable")
        XCTAssertTrue(l.veredictos.isEmpty)
        XCTAssertNil(l.bandaRecuperacion, "se retira también la del paseo de bajada")
        XCTAssertTrue(l.veredictosRecuperacion.isEmpty)
    }

    // Justo por debajo del umbral el ritmo SÍ se compara: el corrector no se dispara
    // con cualquier repecho.
    func testPorDebajoDelUmbralElRitmoSigueMandando() {
        let c = carrera(
            objetivo: .ritmo(rapidoSkm: 200, lentoSkm: 215),
            repeticiones: [
                trabajo(1, skm: 205, veredicto: .dentro, pendiente: 2.9),
                trabajo(2, skm: 208, veredicto: .dentro, pendiente: 2.9),
            ]
        )
        guard case .veredicto = Lectura.deCorrer(c).sujeto else {
            return XCTFail("2,9 % no retira el ritmo")
        }
    }

    // MARK: - 6 · Sin archivo

    // Una sesión anterior a la tanda del archivo no es un error: enseña sus totales y
    // DICE POR QUÉ no hay más. Ninguna casilla vacía, ningún guion.
    func testSinTrazaSeDanLosTotalesDiciendoPorQue() {
        let deHoy = Lectura.deCorrer(carrera(conTraza: false, momento: .alTerminar))
        guard case .kilometros(let km, let porque) = deHoy.sujeto else {
            return XCTFail("sin traza mandan los totales, fue \(deHoy.sujeto)")
        }
        XCTAssertEqual(km, 10, accuracy: 0.01)
        XCTAssertTrue(porque.contains("No se archivó"))
        XCTAssertEqual(deHoy.troceado, .ninguno, "sin señal no hay nada que trocear")
        XCTAssertFalse(porque.contains("—"), "ni un guion de relleno en el copy")

        let delHistorial = Lectura.deCorrer(carrera(conTraza: false, momento: .revision))
        guard case .kilometros(_, let porqueViejo) = delHistorial.sujeto else {
            return XCTFail("igual desde el historial")
        }
        XCTAssertTrue(porqueViejo.contains("anterior al archivo"),
                      "del historial la razón es otra, y se dice")
    }

    // MARK: - La recuperación

    // LA ASIMETRÍA: en una recuperación irse RÁPIDO es el fallo que importa — suele ser
    // LA explicación de que la quinta se caiga. El dominio la sirve por separado para
    // que quien pinte no pueda tratarlas igual que el trabajo.
    func testLaRecuperacionTraeSusVeredictosAparte() {
        let c = carrera(
            objetivo: .ritmo(rapidoSkm: 200, lentoSkm: 215),
            objetivoRecuperacion: .ritmo(rapidoSkm: 320, lentoSkm: 360),
            repeticiones: [
                trabajo(1, skm: 205, veredicto: .dentro),
                recuperacion(1, skm: 300, modo: .trote, veredicto: .fueraRapido),
                trabajo(2, skm: 212, veredicto: .dentro),
                recuperacion(2, skm: 340, modo: .trote, veredicto: .dentro),
            ]
        )
        let l = Lectura.deCorrer(c)

        XCTAssertEqual(l.veredictos, [.dentro, .dentro], "solo el TRABAJO")
        XCTAssertEqual(l.veredictosRecuperacion, [.fueraRapido, .dentro])
        XCTAssertEqual(l.bandaRecuperacion?.rapidoSkm, 320)
        XCTAssertEqual(l.bandaRecuperacion?.lentoSkm, 360)
    }

    // Sin objetivo de recuperación no se inventa ninguno.
    func testSinObjetivoDeRecuperacionNoSeJuzga() {
        let c = carrera(
            objetivo: .ritmo(rapidoSkm: 200, lentoSkm: 215),
            repeticiones: [
                trabajo(1, skm: 205, veredicto: .dentro),
                recuperacion(1, skm: 330, modo: .trote),
                trabajo(2, skm: 212, veredicto: .dentro),
            ]
        )
        let l = Lectura.deCorrer(c)
        XCTAssertTrue(l.veredictosRecuperacion.isEmpty)
        XCTAssertNil(l.bandaRecuperacion)
    }

    // MARK: - Invariantes del reparto

    // NUNCA LOS DOS TROCEADOS A LA VEZ, en ningún escenario.
    func testElTroceadoNuncaEsLosDos() {
        let escenarios: [Carrera] = [
            carrera(objetivo: .ritmo(rapidoSkm: 200, lentoSkm: 215),
                    repeticiones: [trabajo(1, skm: 205, veredicto: .dentro),
                                   trabajo(2, skm: 208, veredicto: .dentro)]),
            carrera(objetivo: .zona(2, minPpm: 130, maxPpm: 148), zonasS: [2: 900]),
            carrera(),
            carrera(conTraza: false),
        ]
        for c in escenarios {
            let t = Lectura.deCorrer(c).troceado
            XCTAssertTrue([.repeticiones, .kilometros, .ninguno].contains(t))
        }
        // Y el reparto es el que dice el contrato: repeticiones para lo que tiene
        // tramos, kilómetros para lo continuo.
        XCTAssertEqual(Lectura.deCorrer(escenarios[0]).troceado, .repeticiones)
        XCTAssertEqual(Lectura.deCorrer(escenarios[1]).troceado, .kilometros)
        XCTAssertEqual(Lectura.deCorrer(escenarios[3]).troceado, .ninguno)
    }

    // La media del trabajo pondera por duración: cuatro tramos de 3′ y uno de 30″ no
    // pesan igual.
    func testLaMediaPonderaPorDuracion() {
        let reps = [trabajo(1, skm: 200, dur: 180), trabajo(2, skm: 260, dur: 20)]
        XCTAssertEqual(Lectura.mediaSkm(reps) ?? 0, 206, accuracy: 0.01,
                       "no es 230: el tramo corto pesa menos")
        XCTAssertNil(Lectura.mediaSkm([trabajo(1, skm: nil)]), "sin ritmo no hay media")
    }
}

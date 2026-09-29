import XCTest
@testable import FAHYBRIK

// CORRER, LEÍDO: lo que decide `LecturaDeCorrer` sobre el detalle real del motor. Traducción de `detalleCorrerDe` del doble (los cinco
// atletas, las mismas preguntas: ¿hay curva?, ¿qué falta y se dice?, ¿qué se calla?) a lo que el servidor SÍ sirve.
final class LecturaDeCorrerTests: XCTestCase {

    private func lectura(_ a: DetalleFixtures.Atleta) throws -> LecturaDeCorrer {
        LecturaDeCorrer.desde(try DetalleFixtures.detalle(.correr, a))
    }

    // MARK: - Mejores esfuerzos

    func testLosMejoresSalenPorDistanciaConElNombreQueEscribeElServidor() throws {
        let l = try lectura(.lleno)
        XCTAssertEqual(l.mejores.map(\.clave), [400, 1000, 1600, 3000, 5000, 10000], "sin los peldaños que el servidor declara sin dato")
        XCTAssertEqual(l.mejores.map(\.nombre), ["400 m", "1 km", "1600 m", "3 km", "5 km", "10 km"])
        XCTAssertTrue(l.mejores.allSatisfy { $0.metros == Double($0.clave) })
    }

    func testUnMejorLlevaLoQueFueEnElPeriodoAnteriorYSiEsNuevo() throws {
        let cinco = try XCTUnwrap(try lectura(.lleno).mejores.first { $0.clave == 5000 })
        XCTAssertEqual(cinco.segundos, 1260)
        XCTAssertEqual(cinco.anterior, 1290, "la comparación del servidor guarda el anterior en la unidad del dato (segundos), no en la del umbral")
        XCTAssertTrue(cinco.nuevo, "iguala su récord de siempre: es de esta ventana")
        XCTAssertFalse(cinco.viejo)
        XCTAssertEqual(cinco.cuando, .semana("2026-09-07"))
        XCTAssertEqual(cinco.ritmoSKm, 252, accuracy: 1e-9, "1260 s en 5 km: 4:12/km")
        XCTAssertFalse(cinco.enCinta)
    }

    func testLaCurvaSeDibujaConDosEsfuerzosYElAnteriorSoloDondeHuboEnLosDos() throws {
        let l = try lectura(.lleno)
        XCTAssertTrue(l.hayCurva)
        XCTAssertEqual(l.curvaHoy.count, 6)
        // 3 km y 10 km no tienen comparación (no hubo esfuerzo en el periodo anterior): no están en la curva de «antes».
        XCTAssertEqual(l.curvaAntes.map(\.clave), [400, 1000, 1600, 5000])
        XCTAssertTrue(l.curvaAntes.allSatisfy { $0.anterior != nil })
    }

    func testUnDatoViejoNoEsDeEstaVentanaYNoEntraEnLaCurva() throws {
        let l = try lectura(.viejo)
        XCTAssertFalse(l.mejores.isEmpty, "las marcas de siempre siguen en la tabla")
        XCTAssertTrue(l.mejores.allSatisfy(\.viejo))
        XCTAssertTrue(l.curvaHoy.isEmpty, "nada de esta ventana: no hay curva «esta ventana»")
        XCTAssertFalse(l.hayCurva)
        XCTAssertTrue(l.mejores.allSatisfy { $0.anterior == nil && !$0.nuevo }, "un dato viejo no se compara ni es nuevo")
        let mil = try XCTUnwrap(l.mejores.first { $0.clave == 1000 })
        XCTAssertEqual(mil.cuando, .dia("2026-06-25"))
    }

    func testConUnSoloEsfuerzoNoHayCurva() throws {
        // Jordi tiene seis esfuerzos en tres semanas: hay curva; con uno solo no la habría.
        let l = try lectura(.poco)
        XCTAssertTrue(l.hayCurva)
        XCTAssertTrue(l.curvaAntes.isEmpty, "sin periodo anterior no hay «antes»")
        let uno = LecturaDeCorrer(sujeto: l.sujeto, fila: nil, umbral: nil, mejores: [l.mejores[0]], motor: nil, desacople: nil, velocidadCritica: nil, deposito: nil, vdot: nil, porTipo: [], hoy: l.hoy)
        XCTAssertFalse(uno.hayCurva)
    }

    // MARK: - El umbral, el motor y la capacidad

    func testLaFilaEsElMotorYSuSerieNoSeRepite() throws {
        let l = try lectura(.lleno)
        XCTAssertTrue(l.filaEsMotor, "Marta: la fila es el Motor (la primera señal comparable)")
        XCTAssertFalse(try lectura(.poco).filaEsMotor, "Jordi: la fila es un mejor esfuerzo; el Motor no existe todavía")
    }

    func testElUmbralViajaConSuAncla() throws {
        let u = try XCTUnwrap(try lectura(.lleno).umbral)
        XCTAssertEqual(u.estado, .medida)
        XCTAssertEqual(u.dato?.valor, 252)
        XCTAssertEqual(u.procedencia.ancla, .medida)
        let sin = try XCTUnwrap(try lectura(.poco).umbral)
        XCTAssertEqual(sin.estado, .sinDato)
        XCTAssertEqual(sin.cobertura.falta, .ancla, "sin test de zonas no hay umbral: la salida es hacerlo")
        XCTAssertTrue(AnaliticasFilaSinDato.dice(sin))
        XCTAssertEqual(AnaliticasEstados.salida(de: .ancla), .accion("Hacer el test de zonas", .tests))
    }

    func testUnHuecoSeDeclaraSiHayActoOPlazoYSeCallaSiNo() throws {
        let lleno = try lectura(.lleno)
        // La velocidad crítica de Marta no sale (esfuerzos que no son máximos): `ocasion`, sin plazo que dibujar → se calla.
        let vc = try XCTUnwrap(lleno.velocidadCritica)
        XCTAssertEqual(vc.cobertura.falta, .ocasion)
        XCTAssertFalse(AnaliticasFilaSinDato.dice(vc))
        // El Motor de Jordi tampoco existe y tampoco le pide nada al atleta.
        XCTAssertFalse(AnaliticasFilaSinDato.dice(try XCTUnwrap(try lectura(.poco).motor)))
        // Lucía (viejo): la velocidad crítica espera esfuerzos («0 de 3»): se declara con su plazo.
        let viejo = try XCTUnwrap(try lectura(.viejo).velocidadCritica)
        XCTAssertEqual(viejo.cobertura.falta, .historia(llevas: 0, hacen: 3))
        XCTAssertTrue(AnaliticasFilaSinDato.dice(viejo))
    }

    func testLaVelocidadCriticaSeDiceCuandoElMotorLaCalcula() throws {
        let l = try lectura(.poco)
        let vc = try XCTUnwrap(l.velocidadCritica)
        XCTAssertEqual(vc.estado, .medida)
        XCTAssertEqual(vc.dato?.unidad, .mS)
        XCTAssertEqual(try XCTUnwrap(l.deposito?.dato).unidad, .metros)
        let velocidad = try XCTUnwrap(vc.dato?.valor)
        XCTAssertEqual(AnaliticasFormato.formatear(1000 / velocidad, .sKm), "4:17/km", "≈ el ritmo de la velocidad crítica, en la unidad del corredor")
    }

    // MARK: - Por tipo de sesión

    func testElRitmoPorTipoNombraElTipoSinElPrefijoDelServidor() throws {
        let l = try lectura(.lleno)
        XCTAssertEqual(Set(l.porTipo.map { LecturaDeCorrer.nombreDeTipo($0) }), ["series", "rodajes", "por tiempo"])
        XCTAssertEqual("rodajes".capitalizadoEs, "Rodajes")
        XCTAssertEqual("".capitalizadoEs, "")
    }

    func testElVacioNoTieneNadaQuePintar() throws {
        let l = try lectura(.vacio)
        XCTAssertEqual(l.estado, .vacio)
        XCTAssertTrue(l.mejores.isEmpty)
        XCTAssertTrue(l.porTipo.isEmpty)
        XCTAssertNil(l.fila?.dato)
    }
}

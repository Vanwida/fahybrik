import XCTest
@testable import FAHYBRIK

// LAS CINCO FILAS DE RENDIMIENTO, CLAVADAS SOBRE LOS VEINTE CASOS.
//
// Traducción de `describe('Rendimiento: las cinco filas')` de
// `web/tests/design-twin/perfil-rehecho.test.ts`: mismos casos, mismos resultados. Que un contador se
// pinte en cero, que un valor medido no exista hasta que se mide o que una fuente caída no se quede en
// esqueleto no se ve mirando un mockup: se ve igual de bien un perfil que miente que uno que no. Así
// que cada regla se fija aquí, caso a caso, y cada decisión tiene al menos un caso que la ejercita.

final class RendimientoPerfilTests: XCTestCase {

    private func lectura(_ id: String) -> LecturaPerfil { CasosPerfil.caso(id).lectura }

    private func fila(_ l: LecturaPerfil, _ clave: FilaRendimiento.Clave, file: StaticString = #filePath, line: UInt = #line) throws -> FilaRendimiento {
        try XCTUnwrap(RendimientoEstados.filas(l).first { $0.clave == clave }, "sin fila \(clave)", file: file, line: line)
    }

    /// El separador lleva un espacio de no separación (`TextosPerfil.sep`): para comparar, se lee como un espacio.
    private func plano(_ s: String?) -> String? { s?.replacingOccurrences(of: "\u{00A0}", with: " ") }

    private struct Valor: Equatable {
        var cifra: String
        var sufijo: String?
        var pie: String?
    }

    private func valor(_ f: FilaRendimiento) -> Valor? {
        guard case let .valor(cifra, sufijo, pie) = f.estado else { return nil }
        return Valor(cifra: cifra, sufijo: sufijo, pie: plano(pie))
    }

    private func invitacion(_ f: FilaRendimiento) -> String? {
        guard case let .vacio(texto) = f.estado else { return nil }
        return texto
    }

    // MARK: Cuántas filas

    func testConCoachSonCincoSinCoachTresNiTestsNiZonas() {
        XCTAssertEqual(RendimientoEstados.filas(lectura("veterano")).map(\.clave), [.tests, .marcas, .vo2, .zonas, .fuerza])
        for id in ["libre", "libre-alta"] {
            XCTAssertEqual(RendimientoEstados.filas(lectura(id)).map(\.clave), [.marcas, .vo2, .fuerza], id)
        }
    }

    // MARK: Contador y valor medido

    func testUnContadorSePintaEnCeroYUnCeroNoEsUnLogro() throws {
        let l = lectura("alta")
        XCTAssertEqual(valor(try fila(l, .tests)), Valor(cifra: "0", sufijo: "de 4", pie: "calibrados"))
        XCTAssertEqual(valor(try fila(l, .marcas)), Valor(cifra: "0", sufijo: "de 12", pie: "con récord"))
        XCTAssertFalse(try fila(l, .tests).logrado)
        XCTAssertFalse(try fila(l, .marcas).logrado)
        XCTAssertEqual(RendimientoEstados.linea(RendimientoEstados.filas(l)), "0 de 5 con dato")
    }

    func testUnValorMedidoNoExisteHastaQueSeMideInvitacionConSuVerboJamasUnGuion() throws {
        let l = lectura("alta")
        for clave in [FilaRendimiento.Clave.vo2, .zonas, .fuerza] {
            let f = try fila(l, clave)
            let texto = try XCTUnwrap(invitacion(f), "\(clave) debía ser una invitación")
            XCTAssertNotNil(f.salida, "\(clave) lo llena el atleta: tiene que llevar su verbo")
            XCTAssertNil(texto.range(of: #"^[—–-]+$"#, options: .regularExpression))
        }
    }

    func testSinAnclaNoHayZonasYNoSeInventaNinguna() throws {
        let f = try fila(lectura("sin-ancla"), .zonas)
        XCTAssertEqual(invitacion(f), "Tu edad o un test de umbral las calculan")
        XCTAssertEqual(f.salida, "Cómo tenerlas")
        XCTAssertNil(invitacion(f)?.range(of: #"\d{3}"#, options: .regularExpression), "ni una cifra por defecto")
    }

    func testUnUmbralEstimadoEscribeDeDondeSale() throws {
        XCTAssertEqual(
            valor(try fila(lectura("tests-a-medias"), .zonas)),
            Valor(cifra: "171", sufijo: "ppm", pie: "Estimado por tu edad")
        )
        for caso in CasosPerfil.todos {
            let z = RendimientoEstados.filas(caso.lectura).first { $0.clave == .zonas }
            if let z, case let .valor(_, _, pie) = z.estado { XCTAssertFalse((pie ?? "").isEmpty, caso.id) }
        }
    }

    // MARK: La batería

    func testLaBateriaAMediasPideUnActoLaCerradaNo() throws {
        let medias = try fila(lectura("tests-a-medias"), .tests)
        XCTAssertTrue(medias.pideActo)
        XCTAssertTrue(medias.logrado)
        XCTAssertEqual(valor(medias), Valor(cifra: "2", sufijo: "de 4", pie: "calibrados · 1 sin resultado"))
        XCTAssertEqual(medias.avance, FilaRendimiento.Avance(n: 2, de: 4))
        XCTAssertFalse(try fila(lectura("veterano"), .tests).pideActo)
        XCTAssertTrue(try fila(lectura("alta"), .tests).pideActo)
    }

    func testUnTestEmpezadoCuentaComoAlgoDelAtletaAunqueNoTengaNumero() throws {
        var l = lectura("alta")
        l.rendimiento.bateria = .contesto(BateriaPerfil(total: 4, completados: 0, aMedias: 1))
        XCTAssertTrue(try fila(l, .tests).logrado)
    }

    func testSinBateriaProgramadaJamasSePintaCeroDeCeroSeDiceQuienLaProgramaYNoHaySalida() throws {
        for bateria in [BateriaPerfil(total: 0, completados: 0, aMedias: 0), nil] {
            var l = lectura("alta")
            l.rendimiento.bateria = .contesto(bateria)
            let f = try fila(l, .tests)
            XCTAssertEqual(f.estado, .vacio(invitacion: "Tu coach los programa y aparecen aquí"))
            XCTAssertNil(f.salida)
        }
    }

    func testUnHuecoQueElAtletaNoPuedeLlenarLoDiceYNoOfreceSalidaLosTestsYElCatalogoSonDelCoach() throws {
        XCTAssertEqual(invitacion(try fila(lectura("sin-pareja"), .tests)), "Tu coach los programa y aparecen aquí")
        XCTAssertNil(try fila(lectura("sin-pareja"), .tests).salida)
        XCTAssertEqual(invitacion(try fila(lectura("invitacion"), .marcas)), "Aún no hay marcas que probar")
        XCTAssertNil(try fila(lectura("invitacion"), .marcas).salida)
    }

    func testUnHuecoSinSalidaSoloLoEsCuandoElAtletaNoPuedeLlenarlo() {
        for caso in CasosPerfil.todos {
            for f in RendimientoEstados.filas(caso.lectura) {
                guard case .vacio = f.estado else { continue }
                if f.salida == nil { XCTAssertTrue([.tests, .marcas].contains(f.clave), "\(caso.id) · \(f.clave)") }
                if [.vo2, .zonas, .fuerza].contains(f.clave) { XCTAssertNotNil(f.salida, "\(caso.id) · \(f.clave)") }
            }
        }
    }

    // MARK: Fuerza y VO₂

    func testElMasPesadoAbreLaFilaYElPieDiceCual() throws {
        XCTAssertEqual(
            valor(try fila(lectura("veterano"), .fuerza)),
            Valor(cifra: "165", sufijo: "kg", pie: "peso muerto · 3 levantamientos")
        )
        XCTAssertEqual(
            valor(try fila(lectura("libre"), .fuerza)),
            Valor(cifra: "90", sufijo: "kg", pie: "sentadilla · 1 levantamiento")
        )
        var decimal = lectura("veterano")
        decimal.rendimiento.fuerza = .contesto([LevantamientoPerfil(etiqueta: "Sentadilla", kg: 186.7)])
        XCTAssertEqual(valor(try fila(decimal, .fuerza))?.cifra, "186,7")
    }

    func testEnUnEmpateDeCargaGanaElPrimero() throws {
        var l = lectura("veterano")
        l.rendimiento.fuerza = .contesto([
            LevantamientoPerfil(etiqueta: "Sentadilla", kg: 150),
            LevantamientoPerfil(etiqueta: "Peso muerto", kg: 150),
        ])
        XCTAssertEqual(valor(try fila(l, .fuerza))?.pie, "sentadilla · 2 levantamientos")
    }

    func testElVo2DiceDeDondeSale() throws {
        XCTAssertEqual(valor(try fila(lectura("veterano"), .vo2)), Valor(cifra: "52,8", sufijo: nil, pie: "ml/kg/min · tu reloj"))
        XCTAssertEqual(valor(try fila(lectura("tests-a-medias"), .vo2)), Valor(cifra: "46,5", sufijo: nil, pie: "ml/kg/min · tu Cooper"))
    }

    // MARK: El recuento y sus estados

    func testElRecuentoCuentaLasFilasVisibles() {
        func linea(_ id: String) -> String? { RendimientoEstados.linea(RendimientoEstados.filas(lectura(id))) }
        XCTAssertEqual(linea("veterano"), "5 de 5 con dato")
        XCTAssertEqual(linea("libre"), "3 de 3 con dato")
        XCTAssertEqual(linea("libre-alta"), "0 de 3 con dato")
        XCTAssertEqual(linea("sin-ancla"), "3 de 5 con dato")
    }

    func testEnFrioTodoEsEsqueletoYNoHayRecuento() {
        let filas = RendimientoEstados.filas(lectura("cargando"))
        XCTAssertTrue(filas.allSatisfy { $0.estado == .cargando })
        XCTAssertNil(RendimientoEstados.linea(filas))
        // Aunque el relleno dijera otra cosa, en frío manda «cargando».
        var conRelleno = lectura("veterano")
        conRelleno.cargando = true
        XCTAssertTrue(RendimientoEstados.filas(conRelleno).allSatisfy { $0.estado == .cargando })
    }

    func testUnaFuenteQueFalloDiceQueFalloYElRecuentoSeCalla() throws {
        let l = lectura("fuente-caida")
        XCTAssertEqual(try fila(l, .vo2).estado, .sinRespuesta)
        XCTAssertNotNil(valor(try fila(l, .fuerza)))
        XCTAssertNil(RendimientoEstados.linea(RendimientoEstados.filas(l)))
        XCTAssertFalse(RendimientoEstados.sinRespuesta(RendimientoEstados.filas(l)))
    }

    func testUnaFuenteQueFalloNoEsUnaFuenteQueAunCargaNiUnHueco() throws {
        // La mentira que este diseño evita: un servidor caído NO puede pintarle «Aún no hay marcas que
        // probar» a un atleta con récords, ni dejarlo en un esqueleto que no se va nunca.
        var l = lectura("veterano")
        l.rendimiento.marcas = .sinRespuesta
        XCTAssertEqual(try fila(l, .marcas).estado, .sinRespuesta)
        XCTAssertNotEqual(try fila(l, .marcas).estado, .cargando)
        XCTAssertFalse(try fila(l, .marcas).logrado)
        XCTAssertFalse(try fila(l, .marcas).pideActo)
    }

    func testSinRedLaSeccionEsUnaFraseYNoCincoTeselasDeError() {
        XCTAssertTrue(RendimientoEstados.sinRespuesta(RendimientoEstados.filas(lectura("error"))))
        XCTAssertFalse(RendimientoEstados.sinRespuesta(RendimientoEstados.filas(lectura("veterano"))))
    }

    func testLasZonasViajanConLaIdentidadSiElLaCayoNoPuedenContestar() throws {
        var l = lectura("veterano")
        l.errorCarga = true
        XCTAssertEqual(try fila(l, .zonas).estado, .sinRespuesta)
        XCTAssertNotNil(valor(try fila(l, .vo2)))
    }

    func testElPieDeUnContadorSiempreTieneSuUnidadDeMedidaNuncaGuionDeCuatro() {
        for caso in CasosPerfil.todos {
            for f in RendimientoEstados.filas(caso.lectura) {
                guard case let .valor(cifra, _, _) = f.estado else { continue }
                XCTAssertNotNil(cifra.range(of: #"^\d+(,\d+)?$"#, options: .regularExpression), "\(caso.id) · \(f.clave): «\(cifra)»")
            }
        }
    }
}

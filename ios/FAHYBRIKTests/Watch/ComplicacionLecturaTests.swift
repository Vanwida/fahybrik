import XCTest
@testable import FAHYBRIK

// LA ESFERA Y EL SMART STACK DICEN LO DE HOY, Y NADA MÁS (P13, 30-sep).
//
// La complicación pinta un `ComplicacionHoy` que escribe la app del reloj con
// `ComplicacionLectura`. Estos tests son la lectura: con los planes reales del vivo
// (`VivoPlanesDePrueba`, los de `EntradaBriefTests`), todos los estados (sesión, descanso,
// hecha completa y parcial, sin plan, sin detalle, sin duración, plan de ayer) y el
// almacén compartido (App Group, aquí con una suite de pruebas). Cero fixtures nuevos.
final class ComplicacionLecturaTests: XCTestCase {
    private typealias P = VivoPlanesDePrueba

    private let dia = "2026-09-30"

    /// Una línea como se lee en la muñeca: espacios normales y sin los atados de partir.
    private func llano(_ t: String) -> String {
        t.replacingOccurrences(of: "\u{00A0}", with: " ").replacingOccurrences(of: EntradaNotacion.unido, with: "")
    }

    private func payload(_ titulo: String? = "Series 6×1000", minutos: Int? = 55, actividad: String? = "running",
                         descanso: Bool = false, hecha: String? = nil,
                         acento: WatchClubAccentPayload? = nil) -> WatchTodayPayload {
        WatchTodayPayload(
            dayKind: descanso ? WatchDayKind.rest : WatchDayKind.session, assignmentId: descanso ? nil : "901",
            title: titulo, focus: nil, estDurationMinutes: minutos, intensityLabel: nil, activityKind: actividad,
            athleteHrZones: nil, readinessScore: nil, readinessDelta7d: nil, readinessWorstDriver: nil,
            isDone: hecha != nil, doneCompleteness: hecha, isDoubles: false, partnerFirstName: nil,
            partnerVisibility: nil, detailJson: nil, clubAccent: acento)
    }

    // MARK: - Con plan: el caso del modelo

    /// «Hoy · 55′ / 6 × 1000 m / a 3:45–3:55 · r 90″» del doble, con la notación del brief.
    func testLaSesionDeSeriesDiceElBloqueYContraQue() throws {
        let h = ComplicacionLectura.leer(hoy: payload(), plan: try P.seisPorMilCompleto(), dia: dia)
        XCTAssertEqual(h.estado, .sesion)
        XCTAssertEqual(llano(h.contexto), "Hoy · desde 55 min",
                       "el rato que escribe el plan, como suelo: nunca un «~» inventado")
        XCTAssertEqual(llano(h.titulo), "6 × 1000 m", "el bloque de series, no el calentamiento")
        XCTAssertEqual(h.detalle.map(llano), ["a 3:45–3:55", "r 90″ suave"],
                       "el objetivo y la recuperación del brief, en trozos que se pueden soltar por la cola")
        XCTAssertEqual(h.icono, .correr)
        XCTAssertEqual(h.dia, dia)
    }

    /// Una sola notación: la de la esfera es la de la fila del brief a la que lleva el toque.
    func testLaEsferaDiceLoMismoQueElBrief() throws {
        let plan = try P.seisPorMilCompleto()
        let h = ComplicacionLectura.leer(hoy: payload(), plan: plan, dia: dia)
        let fila = try XCTUnwrap(EntradaBrief.filas(plan).first { $0.esTrabajo })
        XCTAssertEqual(llano(([h.titulo] + h.detalle).joined(separator: " · ")),
                       llano(([fila.titular, fila.objetivo].compactMap { $0 } + fila.partes).joined(separator: " · ")))
        XCTAssertEqual(llano(fila.linea), "6 × 1000 m a 3:45–3:55",
                       "la fila de siempre no cambia: el titular y el objetivo son un dato más")
    }

    /// El titular y el objetivo son la línea partida por el dato, no por el texto: juntos dan siempre
    /// la línea de siempre, en cualquier sesión.
    func testTitularMasObjetivoEsLaLineaDeSiempre() throws {
        let planes = [try P.seisPorMilCompleto(), try P.sesion494(), try P.tempoCinta(), try P.sesion529(), try P.sesion551()]
        for plan in planes {
            for fila in EntradaBrief.filas(plan) {
                let esperado = fila.objetivo.map { "\(fila.titular) \($0)" } ?? fila.titular
                XCTAssertEqual(fila.linea, esperado, "\(fila.linea)")
            }
        }
    }

    func testUnRodajeSeNombraConSuObjetivo() throws {
        let h = ComplicacionLectura.leer(hoy: payload("Rodaje", minutos: 80), plan: try P.sesion494(), dia: dia)
        XCTAssertEqual(llano(h.titulo), "Carrera 80′")
        XCTAssertEqual(h.detalle.map(llano), ["a Z2"])
    }

    /// 529: la fuerza se llama por su primer ejercicio de la parte principal, con su dosis debajo.
    func testUnaSesionDeFuerzaSeNombraPorSuPrimerEjercicio() throws {
        let h = ComplicacionLectura.leer(hoy: payload("Fuerza", minutos: 70, actividad: "strength"),
                                         plan: try P.sesion529(), dia: dia)
        XCTAssertEqual(h.titulo, "Back Squat", "no la movilidad de antes")
        XCTAssertEqual(Array(h.detalle.map(llano).prefix(2)), ["4 × 8", "65–70% 1RM"])
        XCTAssertEqual(h.icono, .fuerza)
    }

    // MARK: - La forma: el aro desenrollado

    func testLaFormaEsLaDeLaSesionConElTrabajoEnMedio() throws {
        let h = ComplicacionLectura.leer(hoy: payload(), plan: try P.seisPorMilCompleto(), dia: dia)
        XCTAssertFalse(h.forma.isEmpty)
        XCTAssertEqual(h.forma.first?.trabajo, false, "calentar, en gris")
        XCTAssertEqual(h.forma.last?.trabajo, false, "la vuelta a la calma, en gris")
        XCTAssertEqual(h.forma.filter(\.trabajo).count, 6, "las seis series, cada una su arco entre recuperaciones")
        XCTAssertTrue(h.forma.allSatisfy { $0.peso > 0 })
    }

    /// Los arcos vecinos del mismo tipo se juntan: nunca dos seguidos del mismo color.
    func testLosArcosVecinosDelMismoTipoSeJuntan() throws {
        for plan in [try P.seisPorMilCompleto(), try P.sesion529(), try P.sesion494()] {
            let forma = ComplicacionLectura.forma(plan)
            for (a, b) in zip(forma, forma.dropFirst()) {
                XCTAssertNotEqual(a.trabajo, b.trabajo)
            }
        }
    }

    // MARK: - Los estados

    func testUnDiaDeDescansoEsDescanso() {
        let h = ComplicacionLectura.leer(hoy: payload(nil, minutos: nil, actividad: nil, descanso: true), plan: nil, dia: dia)
        XCTAssertEqual(h.estado, .descanso)
        XCTAssertEqual(h.titulo, "Descanso")
        XCTAssertTrue(h.detalle.isEmpty, "de mañana la muñeca no sabe nada: no se dice")
        XCTAssertTrue(h.forma.isEmpty)
        XCTAssertEqual(h.icono, .descanso)
    }

    func testUnaSesionHechaLoDiceConSuForma() throws {
        let h = ComplicacionLectura.leer(hoy: payload(hecha: "full"), plan: try P.seisPorMilCompleto(), dia: dia)
        XCTAssertEqual(h.estado, .hecha)
        XCTAssertEqual(h.contexto, "Hoy · hecha")
        XCTAssertEqual(h.titulo, "Series 6×1000")
        XCTAssertEqual(h.detalle, ["Sesión completada"])
        XCTAssertFalse(h.parcial)
        XCTAssertFalse(h.forma.isEmpty, "la tira se queda: lo que hiciste, con su forma")
    }

    func testUnaSesionParcialLoDiceConPalabras() {
        let h = ComplicacionLectura.leer(hoy: payload(hecha: "partial"), plan: nil, dia: dia)
        XCTAssertEqual(h.estado, .hecha)
        XCTAssertEqual(h.detalle, ["Sesión parcial registrada"])
        XCTAssertTrue(h.parcial)
        XCTAssertTrue(h.forma.isEmpty, "sin plan no hay forma que inventar")
    }

    func testSinNadaDelIPhoneDiceQueNoHayPlanYComoArreglarlo() {
        let h = ComplicacionLectura.leer(hoy: nil, plan: nil, dia: dia)
        XCTAssertEqual(h.estado, .sinPlan)
        XCTAssertEqual(h.titulo, "Sin plan")
        XCTAssertEqual(h.detalle, ["Abre \(Marca.nombre) en el iPhone"])
        XCTAssertEqual(h.icono, .iphone)
    }

    /// Hay sesión pero no el detalle del coach (o es un test de salto): sale su título, sin
    /// bloque, sin objetivo y sin forma. Nunca un plan de solo título contra la asignación.
    func testSinDetalleSaleElTituloSinInventarNada() {
        let h = ComplicacionLectura.leer(hoy: payload(), plan: nil, dia: dia)
        XCTAssertEqual(h.estado, .sesion)
        XCTAssertEqual(h.titulo, "Series 6×1000")
        XCTAssertTrue(h.detalle.isEmpty)
        XCTAssertTrue(h.forma.isEmpty)
        XCTAssertEqual(llano(h.contexto), "Hoy · desde 55 min")
    }

    func testSinDuracionEscritaSoloDiceHoy() throws {
        let h = ComplicacionLectura.leer(hoy: payload(minutos: nil), plan: try P.seisPorMilCompleto(), dia: dia)
        XCTAssertEqual(h.contexto, "Hoy")
    }

    func testSinTituloSaleSesion() {
        let h = ComplicacionLectura.leer(hoy: payload("  "), plan: nil, dia: dia)
        XCTAssertEqual(h.titulo, "Sesión")
    }

    func testElAcentoDelClubViaja() {
        let acento = WatchClubAccentPayload(fill: "#1E88E5", press: "#1565C0", text: "#64B5F6")
        XCTAssertEqual(ComplicacionLectura.leer(hoy: payload(acento: acento), plan: nil, dia: dia).acento, "#1E88E5")
        XCTAssertNil(ComplicacionLectura.leer(hoy: payload(), plan: nil, dia: dia).acento)
    }

    // MARK: - El día

    func testLoDeAyerNoSeEnseñaComoLoDeHoy() throws {
        let ayer = ComplicacionLectura.leer(hoy: payload(), plan: try P.seisPorMilCompleto(), dia: "2026-09-29")
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Madrid")!
        let hoy = try XCTUnwrap(cal.date(from: DateComponents(year: 2026, month: 9, day: 30, hour: 8)))
        let visto = ayer.paraElDia(hoy, calendario: cal)
        XCTAssertEqual(visto.estado, .sinPlan, "hasta que el iPhone empuje el día nuevo")
        XCTAssertEqual(visto.dia, "2026-09-30")
        XCTAssertEqual(ayer.paraElDia(try XCTUnwrap(cal.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 23))),
                                      calendario: cal), ayer, "el mismo día, tal cual")
    }

    /// La medianoche cambia el día: a las 23:59 es de hoy y a las 00:00 ya no.
    func testLaClaveDeDiaCambiaALaMedianoche() throws {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Madrid")!
        let a = try XCTUnwrap(cal.date(from: DateComponents(year: 2026, month: 9, day: 30, hour: 23, minute: 59)))
        let b = try XCTUnwrap(cal.date(from: DateComponents(year: 2026, month: 10, day: 1, hour: 0, minute: 0)))
        XCTAssertEqual(ComplicacionHoy.claveDeDia(a, calendario: cal), "2026-09-30")
        XCTAssertEqual(ComplicacionHoy.claveDeDia(b, calendario: cal), "2026-10-01")
    }

    // MARK: - El almacén compartido

    private func suite() throws -> UserDefaults {
        let nombre = "complicacion-tests-\(UUID().uuidString)"
        let d = try XCTUnwrap(UserDefaults(suiteName: nombre))
        addTeardownBlock { d.removePersistentDomain(forName: nombre) }
        return d
    }

    func testElRegistroVaYVuelveIgual() throws {
        let d = try suite()
        let h = ComplicacionLectura.leer(hoy: payload(), plan: try P.seisPorMilCompleto(), dia: dia)
        XCTAssertNil(ComplicacionAlmacen.leer(de: d), "nada escrito, nada que leer")
        XCTAssertTrue(ComplicacionAlmacen.guardar(h, en: d))
        XCTAssertEqual(ComplicacionAlmacen.leer(de: d), h)
    }

    /// Solo se recargan las líneas de tiempo cuando lo que se ve puede ser distinto.
    func testGuardarLoMismoNoCuentaComoCambio() throws {
        let d = try suite()
        let h = ComplicacionLectura.leer(hoy: nil, plan: nil, dia: dia)
        XCTAssertTrue(ComplicacionAlmacen.guardar(h, en: d))
        XCTAssertFalse(ComplicacionAlmacen.guardar(h, en: d))
        XCTAssertTrue(ComplicacionAlmacen.guardar(ComplicacionLectura.leer(hoy: nil, plan: nil, dia: "2026-10-01"), en: d),
                      "un día nuevo sí")
    }

    func testBorrarDejaSinPlan() throws {
        let d = try suite()
        ComplicacionAlmacen.guardar(ComplicacionLectura.leer(hoy: payload(), plan: nil, dia: dia), en: d)
        XCTAssertTrue(ComplicacionAlmacen.borrar(de: d))
        XCTAssertNil(ComplicacionAlmacen.leer(de: d))
        XCTAssertFalse(ComplicacionAlmacen.borrar(de: d), "ya estaba vacío")
    }

    /// Sin grupo (o sin la capacidad firmada) no hay dónde escribir y no se finge que sí.
    func testSinGrupoNoSeEscribe() {
        XCTAssertFalse(ComplicacionAlmacen.guardar(.sinPlan(dia: dia), en: nil))
        XCTAssertNil(ComplicacionAlmacen.leer(de: nil))
    }

    // MARK: - El toque

    func testElToqueDeLaComplicacionAbreLoDeHoy() {
        XCTAssertEqual(ComplicacionEnlace.pagina(ComplicacionEnlace.hoy), .dia)
        XCTAssertNil(ComplicacionEnlace.pagina(URL(string: "otramarca://hoy")!), "otro esquema no mueve nada")
        XCTAssertNil(ComplicacionEnlace.pagina(URL(string: "\(Marca.esquemaURL)://ajustes")!), "otro destino tampoco")
    }
}

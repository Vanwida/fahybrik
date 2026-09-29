import XCTest
@testable import FAHYBRIK

// DE LA APP A LA LECTURA — cada campo de `LecturaHoy` contra lo que la app ya lee.
//
// `MomentoHoyTests` fija QUÉ sujeto toca; esto fija que la lectura que llega a esa función es la que
// dice el dato: las sesiones de hoy y su franja, el descanso con lo que sigue, la pausa, la fase que
// escribió el coach, la marca con su tendencia, lo que reclama y lo que aún no ha llegado. Todo con
// datos hechos a mano decodificados como los del cable, y con un «hoy» fijo.

final class LecturaHoyDesdeTests: XCTestCase {

    // MARK: - Datos de prueba

    private let decodificador: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private func decodifica<T: Decodable>(_ json: String, _ tipo: T.Type = T.self) -> T {
        do { return try decodificador.decode(T.self, from: Data(json.utf8)) } catch { fatalError("\(error)") }
    }

    /// El 29-sep-2026 (martes) a las 7:40, hora local: el «hoy» de estas pruebas.
    private var ahora: Date {
        Calendar.current.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 7, minute: 40))!
    }

    private struct DiaJSON {
        var iso: String
        var sesiones: [(id: String, slot: String, titulo: String, estado: String, modalidad: String?, origen: String?, formato: String?)] = []
    }

    private func plan(
        hoy: String = "2026-09-29",
        pausado: Bool = false,
        haySiguiente: Bool = false,
        empiezaEl: String? = nil,
        objetivo: String? = nil,
        dias: [DiaJSON]
    ) -> AthletePlanWeekResponse {
        let diasJSON = dias.map { d -> String in
            let ss = d.sesiones.map { s -> String in
                var campos = [
                    #""assignment_id":"\#(s.id)""#, #""slot":"\#(s.slot)""#,
                    #""title":"\#(s.titulo)""#, #""status":"\#(s.estado)""#,
                ]
                if let m = s.modalidad { campos.append(#""modality":"\#(m)""#) }
                if let o = s.origen { campos.append(#""origin":"\#(o)""#) }
                if let f = s.formato { campos.append(#""format":"\#(f)""#) }
                return "{\(campos.joined(separator: ","))}"
            }.joined(separator: ",")
            return #"{"day_of_week":1,"iso_date":"\#(d.iso)","is_rest":\#(d.sesiones.isEmpty),"sessions":[\#(ss)]}"#
        }.joined(separator: ",")
        let json = """
        {"week":{"week_start":"2026-09-28","week_end":"2026-10-04","today_iso":"\(hoy)",
        "has_next_week":\(haySiguiente),"paused":\(pausado),"plan_starts_on":\(empiezaEl.map { "\"\($0)\"" } ?? "null"),
        "days":[\(diasJSON)]},
        "macro_summary":{"block":null,"week_label":null,"a_event_days":null},
        "target_race":\(objetivo ?? "null"),"next_race":null,"coach_name":"Mar Puig"}
        """
        return decodifica(json)
    }

    private func fuentes(
        conCoach: Bool = true,
        plan: AthletePlanWeekResponse? = nil,
        planCargado: Bool = true,
        planFallo: Bool = false,
        macro: String? = nil,
        checkinPendiente: Bool = false
    ) -> FuentesHoy {
        FuentesHoy(
            ahora: ahora,
            conCoach: conCoach,
            identidad: decodifica(#"{"id":"a1","full_name":"Nora Ruiz Vidal"}"#, AthleteIdentity.self),
            plan: plan,
            planCargado: planCargado,
            planFallo: planFallo,
            macro: macro.map {
                decodifica(#"{"macro":{"block":null,"week_label":"\#($0)","a_event_days":null},"macro_progress":null}"#,
                           AthleteMacroProgressResponse.self)
            },
            disposicion: nil,
            disposicionCargada: true,
            analisisDeCarrera: nil,
            analisisCargado: true,
            checkinPendiente: checkinPendiente,
            saludConectada: false
        )
    }

    private func sesion(_ id: String, _ slot: String = "am", _ titulo: String = "Series", estado: String = "scheduled",
                        modalidad: String? = "run", origen: String? = nil, formato: String? = nil)
        -> (id: String, slot: String, titulo: String, estado: String, modalidad: String?, origen: String?, formato: String?) {
        // Las marcas locales optimistas se unen al estado del servidor: se limpian para que un test anterior
        // no las arrastre.
        CompletedAssignmentsStore.unmark(id)
        return (id, slot, titulo, estado, modalidad, origen, formato)
    }

    // MARK: - Quién y cuándo

    func testElNombreYElCoachSonLaPrimeraPalabra() {
        let l = LecturaHoy.desde(fuentes(plan: plan(dias: [])))
        XCTAssertEqual(l.nombre, "Nora")
        XCTAssertEqual(l.coach, "Mar")
    }

    func testSinNombreElSaludoCaeAlDeLaHora() {
        XCTAssertNil(LeerHoy.primerNombre(nil))
        XCTAssertNil(LeerHoy.primerNombre("   "))
        XCTAssertEqual(SaludoDeLaHora.texto(hora: "7:40", nombre: LeerHoy.primerNombre("")), "Buenos días")
    }

    func testLaFechaYLaHoraSalenDelAhora() {
        let l = LecturaHoy.desde(fuentes(plan: plan(dias: [])))
        XCTAssertEqual(l.hora, "7:40")
        XCTAssertTrue(l.fecha.hasPrefix("Martes 29"), l.fecha)
    }

    func testSinCoachNoHayCoachNiGlobitos() {
        var f = fuentes(conCoach: false, plan: plan(dias: []))
        f.noLeidosChat = 4
        f.comunicadosPendientes = 2
        let l = LecturaHoy.desde(f)
        XCTAssertNil(l.coach)
        XCTAssertEqual(l.noLeidosChat, 0)
        XCTAssertEqual(l.comunicados, 0)
        XCTAssertNil(l.hoy)
        XCTAssertNil(l.camino)
        XCTAssertNil(l.simulacion)
        XCTAssertEqual(l.momento.tipo, .libre)
    }

    // MARK: - Cargando y error

    func testSinPlanNiFalloEsArranqueEnFrio() {
        let l = LecturaHoy.desde(fuentes(plan: nil, planCargado: false))
        XCTAssertTrue(l.cargando)
        XCTAssertEqual(l.momento.tipo, .cargando)
    }

    func testUnPlanQueFalloSinCacheEsUnErrorConSalida() {
        let l = LecturaHoy.desde(fuentes(plan: nil, planCargado: false, planFallo: true))
        XCTAssertFalse(l.cargando)
        XCTAssertEqual(l.hoy, .errorCarga)
        XCTAssertEqual(l.momento.tipo, .error)
        XCTAssertNil(l.camino)
    }

    func testUnFalloConCacheNoEsUnError() {
        // El plan cargó alguna vez (`planCargado`): se sirve la caché, no se anuncia un error.
        let l = LecturaHoy.desde(fuentes(plan: plan(dias: []), planCargado: true, planFallo: true))
        XCTAssertNotEqual(l.hoy, .errorCarga)
    }

    // MARK: - Las sesiones de hoy

    func testDosSesionesTraenSuFranjaYUnaSolaNo() {
        let dos = plan(dias: [DiaJSON(iso: "2026-09-29", sesiones: [sesion("s-pm", "pm", "Fuerza"), sesion("s-am", "am", "Remo")])])
        guard case .sesiones(let doble)? = LecturaHoy.desde(fuentes(plan: dos)).hoy else { return XCTFail() }
        XCTAssertEqual(doble.map(\.titulo), ["Remo", "Fuerza"], "AM antes que PM aunque lleguen al revés")
        XCTAssertEqual(doble.map(\.franja), [.am, .pm])

        let una = plan(dias: [DiaJSON(iso: "2026-09-29", sesiones: [sesion("s-1", "pm", "Rodaje")])])
        guard case .sesiones(let sola)? = LecturaHoy.desde(fuentes(plan: una)).hoy else { return XCTFail() }
        XCTAssertNil(sola[0].franja, "la franja solo existe cuando el día trae dos sesiones")
    }

    func testLosEstadosSalenDelServidorYLaLibreDelOrigen() {
        let p = plan(dias: [DiaJSON(iso: "2026-09-29", sesiones: [
            sesion("e-1", "am", "A", estado: "completed"),
            sesion("e-2", "am", "B", estado: "partial"),
            sesion("e-3", "pm", "C", estado: "missed"),
            sesion("e-4", "pm", "D", estado: "scheduled", modalidad: "strength", origen: "self"),
        ])])
        guard case .sesiones(let s)? = LecturaHoy.desde(fuentes(plan: p)).hoy else { return XCTFail() }
        XCTAssertEqual(s.map(\.estado), [.hecha, .parcial, .saltada, .pendiente])
        XCTAssertEqual(s.map(\.libre), [false, false, false, true])
        XCTAssertEqual(s.map(\.modalidad), [.run, .run, .run, .strength])
    }

    func testUnaSesionSinAsignacionNoCuenta() {
        let p = plan(dias: [DiaJSON(iso: "2026-09-29", sesiones: [sesion("", "am", "Vacía")])])
        guard case .descanso? = LecturaHoy.desde(fuentes(plan: p)).hoy else {
            return XCTFail("una fila sin asignación no es una sesión")
        }
    }

    func testUnaSesionRecienMarcadaHechaEnLocalSeLeeCerradaAntesDelRefresco() {
        let s = sesion("marca-local", "am", "Rodaje", estado: "scheduled")
        CompletedAssignmentsStore.markCompleted("marca-local")
        defer { CompletedAssignmentsStore.unmark("marca-local") }
        let p = plan(dias: [DiaJSON(iso: "2026-09-29", sesiones: [s])])
        guard case .sesiones(let leidas)? = LecturaHoy.desde(fuentes(plan: p)).hoy else { return XCTFail() }
        XCTAssertEqual(leidas.first?.estado, .hecha)
    }

    func testLaPausaTapaLasSesiones() {
        let p = plan(pausado: true, dias: [DiaJSON(iso: "2026-09-29", sesiones: [sesion("p-1")])])
        XCTAssertEqual(LecturaHoy.desde(fuentes(plan: p)).hoy, .pausado)
    }

    // MARK: - El descanso y lo que sigue

    func testElDescansoDiceQueTocaManana() {
        let p = plan(dias: [
            DiaJSON(iso: "2026-09-29"),
            DiaJSON(iso: "2026-09-30", sesiones: [sesion("m-1", "am", "Series 8×400")]),
        ])
        XCTAssertEqual(
            LecturaHoy.desde(fuentes(plan: p)).hoy,
            .descanso(manana: Manana(titulo: "Series 8×400", modalidad: .run, dia: "mañana"), hayMasPublicado: false)
        )
    }

    func testMasAlejadoSeNombraElDiaDeLaSemana() {
        let p = plan(dias: [
            DiaJSON(iso: "2026-09-29"),
            DiaJSON(iso: "2026-10-01", sesiones: [sesion("j-1", "am", "Fuerza", modalidad: "strength")]),
        ])
        guard case .descanso(let manana, _)? = LecturaHoy.desde(fuentes(plan: p)).hoy else { return XCTFail() }
        XCTAssertEqual(manana?.dia, "el jueves")
        XCTAssertEqual(manana?.modalidad, .strength)
    }

    func testLoSiguienteNoEsUnaSesionYaHechaDeAyer() {
        // Solo cuentan los días POSTERIORES a hoy: una sesión de un día pasado no es «lo que toca».
        let p = plan(dias: [
            DiaJSON(iso: "2026-09-28", sesiones: [sesion("ayer", "am", "Ayer", estado: "completed")]),
            DiaJSON(iso: "2026-09-29"),
        ])
        guard case .descanso(let manana, _)? = LecturaHoy.desde(fuentes(plan: p)).hoy else { return XCTFail() }
        XCTAssertNil(manana)
    }

    func testUnDomingoConLaSemanaQueVieneYaPublicadaNoDiceNadaPublicado() {
        let conSiguiente = plan(haySiguiente: true, dias: [DiaJSON(iso: "2026-09-29")])
        XCTAssertEqual(LecturaHoy.desde(fuentes(plan: conSiguiente)).hoy, .descanso(manana: nil, hayMasPublicado: true))

        let empiezaDespues = plan(empiezaEl: "2026-10-05", dias: [DiaJSON(iso: "2026-09-29")])
        XCTAssertEqual(LecturaHoy.desde(fuentes(plan: empiezaDespues)).hoy, .descanso(manana: nil, hayMasPublicado: true))

        let nada = plan(dias: [DiaJSON(iso: "2026-09-29")])
        XCTAssertEqual(LecturaHoy.desde(fuentes(plan: nada)).hoy, .descanso(manana: nil, hayMasPublicado: false))
    }

    // MARK: - El camino a la carrera

    private let objetivo = #"{"name":"HYROX Barcelona","days_until":39,"goal_time_seconds":3900,"race_date":"2026-11-07"}"#

    func testLaCarreraFijadaTrae_DiasMetaYLaFaseQueEscribioElCoach() {
        let p = plan(objetivo: objetivo, dias: [])
        let l = LecturaHoy.desde(fuentes(plan: p, macro: "Construcción · semana 4 de 12"))
        guard case .fijada(let c)? = l.camino else { return XCTFail() }
        XCTAssertEqual(c.nombre, "HYROX Barcelona")
        XCTAssertEqual(c.dias, 39)
        XCTAssertEqual(c.meta, "sub 65 min")
        XCTAssertEqual(c.fase, "Construcción · semana 4 de 12")
        XCTAssertEqual(c.semana, PosicionEnPlan(n: 4, m: 12))
        XCTAssertEqual(c.foto, BrandImagery.raceCardBackground(nombre: "HYROX Barcelona", fecha: "2026-11-07", entre: []),
                       "la foto sale del selector único de carrera, el mismo que usa Carreras")
    }

    func testUnObjetivoDeTiempoQueNoEsDeMinutosEnterosSeDiceExacto() {
        let p = plan(objetivo: #"{"name":"X","days_until":5,"goal_time_seconds":3870}"#, dias: [])
        guard case .fijada(let c)? = LecturaHoy.desde(fuentes(plan: p)).camino else { return XCTFail() }
        XCTAssertEqual(c.meta, "1:04:30")
    }

    func testSinObjetivoDeTiempoNoHayMetaNiSemanaSinFase() {
        let p = plan(objetivo: #"{"name":"X","days_until":5}"#, dias: [])
        guard case .fijada(let c)? = LecturaHoy.desde(fuentes(plan: p)).camino else { return XCTFail() }
        XCTAssertNil(c.meta)
        XCTAssertNil(c.fase)
        XCTAssertNil(c.semana)
    }

    func testElDiaDeLaCarreraLaCuentaNoSeVaANegativo() {
        let p = plan(objetivo: #"{"name":"X","days_until":-2}"#, dias: [])
        guard case .fijada(let c)? = LecturaHoy.desde(fuentes(plan: p)).camino else { return XCTFail() }
        XCTAssertEqual(c.dias, 0)
    }

    func testSinCarreraFijadaSeInvitaAElegirlaYSinPlanNoSePinta() {
        XCTAssertEqual(LecturaHoy.desde(fuentes(plan: plan(dias: []))).camino, .sinObjetivo)
        XCTAssertNil(LecturaHoy.desde(fuentes(plan: nil, planCargado: false, planFallo: true)).camino)
    }

    func testLaPosicionEnLaFaseSeLeeDelTextoQueComponeElServidor() {
        XCTAssertEqual(LeerHoy.posicion(enFase: "Construcción · semana 4 de 12"), PosicionEnPlan(n: 4, m: 12))
        XCTAssertEqual(LeerHoy.posicion(enFase: "Base aeróbica · Semana 1 de 6"), PosicionEnPlan(n: 1, m: 6))
        XCTAssertNil(LeerHoy.posicion(enFase: "Base aeróbica"), "sin «semana N de M» no hay regleta")
        XCTAssertNil(LeerHoy.posicion(enFase: "semana 3 de 0"))
        XCTAssertEqual(LeerHoy.posicion(enFase: "Puesta a punto · semana 15 de 12"), PosicionEnPlan(n: 12, m: 12), "acotada a M")
    }

    // MARK: - La simulación

    func testLaSimulacionProgramadaNombraElDiaYSoloSiEstaPorHacer() {
        let programada = plan(dias: [
            DiaJSON(iso: "2026-09-29"),
            DiaJSON(iso: "2026-10-03", sesiones: [sesion("sim-1", "am", "Simulación", formato: "hyrox_sim")]),
        ])
        XCTAssertEqual(LecturaHoy.desde(fuentes(plan: programada)).simulacion, .programada(dia: "el sábado", hoy: false))

        let hoyMismo = plan(dias: [DiaJSON(iso: "2026-09-29", sesiones: [sesion("sim-2", "am", "Simulación", formato: "hyrox_sim")])])
        XCTAssertEqual(LecturaHoy.desde(fuentes(plan: hoyMismo)).simulacion, .programada(dia: "el martes", hoy: true))

        let hecha = plan(dias: [DiaJSON(iso: "2026-09-29", sesiones: [
            sesion("sim-3", "am", "Simulación", estado: "completed", formato: "hyrox_sim"),
        ])])
        XCTAssertEqual(LecturaHoy.desde(fuentes(plan: hecha)).simulacion, .abierta, "una hecha ya pasó: no se lee «programada»")
    }

    // MARK: - Cómo llegas hoy

    private func payload(_ score: Int? , delta: Int? = 6, breakdown: String? = nil) -> DailyReadinessPayload {
        decodifica("""
        {"score":\(score ?? 0),"recorded_for":"2026-09-29","delta_7d":\(delta.map(String.init) ?? "null"),
        "breakdown":\(breakdown ?? "null"),"trend":null}
        """)
    }

    func testLaCifraTraeSusCuatroSenalesConSusValoresReales() {
        var f = fuentes(plan: plan(dias: []))
        f.disposicion = payload(84, breakdown: """
        {"sub_score":80,"hrv_component":70,"hrv_ms":68.2,"sleep_hours":7.4,"rhr_component":60,"rhr_bpm":48.0}
        """)
        guard case .medida(let score, let delta, let senales) = LecturaHoy.desde(f).disposicion else { return XCTFail() }
        XCTAssertEqual(score, 84)
        XCTAssertEqual(delta, 6)
        XCTAssertEqual(senales.map(\.etiqueta), ["Check-in", "HRV", "Sueño", "FC reposo"])
        XCTAssertEqual(senales.map(\.activa), [true, true, true, true])
        XCTAssertEqual(senales.map(\.valor), [nil, "68 ms", "7,4 h", "48 ppm"])
    }

    func testUnaSenalQueNoLlegoNoLlevaValorNiEstaEncendida() {
        var f = fuentes(plan: plan(dias: []))
        f.disposicion = payload(60, breakdown: #"{"sub_score":55}"#)
        guard case .medida(_, _, let senales) = LecturaHoy.desde(f).disposicion else { return XCTFail() }
        XCTAssertEqual(senales.map(\.activa), [true, false, false, false])
        XCTAssertEqual(senales.map(\.valor), [nil, nil, nil, nil])
    }

    func testSinDesgloseNoSeInventanSenales() {
        var f = fuentes(plan: plan(dias: []))
        f.disposicion = payload(60)
        guard case .medida(_, _, let senales) = LecturaHoy.desde(f).disposicion else { return XCTFail() }
        XCTAssertTrue(senales.isEmpty)
    }

    func testSinCifraLaSalidaDependeDeSiHayCheckinOSalud() {
        var f = fuentes(plan: plan(dias: []), checkinPendiente: true)
        XCTAssertEqual(LecturaHoy.desde(f).disposicion, .sinDatos(.checkinPendiente))
        f.checkinPendiente = false
        f.saludConectada = true
        XCTAssertEqual(LecturaHoy.desde(f).disposicion, .sinDatos(.saludConectada))
        f.saludConectada = false
        XCTAssertEqual(LecturaHoy.desde(f).disposicion, .sinDatos(.saludSinConectar))
    }

    func testMientrasLaDisposicionNoHaContestadoEsUnEsqueletoNoUnVacio() {
        var f = fuentes(plan: plan(dias: []))
        f.disposicionCargada = false
        XCTAssertEqual(LecturaHoy.desde(f).disposicion, .cargando)
    }

    // MARK: - Una marca y los pasos

    private func analisis(_ serie: [(String, Int, String)]) -> RunningAnalysis {
        let puntos = serie.map { #"{"date":"\#($0.0)","seconds":\#($0.1),"time":"\#($0.2)"}"# }.joined(separator: ",")
        return decodifica(#"{"five_k_trend":[\#(puntos)],"splits":[],"pace_zones":[],"progression":[],"training":[]}"#)
    }

    func testLaMarcaEsElCincoKmConSuTendenciaContraLaPrimera() {
        let mejora = LeerHoy.marca(analisis([("2026-08-01", 1260, "21:00"), ("2026-09-01", 1198, "19:58")]), cargado: true)
        XCTAssertEqual(mejora, .reciente(MarcaReciente(
            titulo: "5 km · prueba", valor: "19:58", tendencia: .mejora("\u{2212}1:02 desde la primera"))))

        let empeora = LeerHoy.marca(analisis([("2026-08-01", 1198, "19:58"), ("2026-09-01", 1234, "20:34")]), cargado: true)
        XCTAssertEqual(empeora, .reciente(MarcaReciente(
            titulo: "5 km · prueba", valor: "20:34", tendencia: .empeora("+0:36 desde la primera"))))

        let igual = LeerHoy.marca(analisis([("2026-08-01", 1198, "19:58"), ("2026-09-01", 1198, "19:58")]), cargado: true)
        XCTAssertEqual(igual, .reciente(MarcaReciente(titulo: "5 km · prueba", valor: "19:58", tendencia: .igual)))
    }

    func testConUnaSolaPruebaNoHayTendenciaQueAfirmar() {
        XCTAssertEqual(
            LeerHoy.marca(analisis([("2026-08-01", 1198, "19:58")]), cargado: true),
            .reciente(MarcaReciente(titulo: "5 km · prueba", valor: "19:58", tendencia: .primeraPrueba))
        )
    }

    func testSinMarcaEsUnHuecoQueSeDeclaraYAntesDeSaberloUnEsqueleto() {
        XCTAssertEqual(LeerHoy.marca(analisis([]), cargado: true), .ninguna)
        XCTAssertEqual(LeerHoy.marca(nil, cargado: true), .ninguna)
        XCTAssertEqual(LeerHoy.marca(nil, cargado: false), .cargando)
    }

    func testLosPasosDistinguenCifraSinDatosSinConectarYLeyendo() {
        XCTAssertEqual(LeerHoy.pasos(nil, saludConectada: true), .leyendo)
        XCTAssertEqual(LeerHoy.pasos(.unavailable, saludConectada: true), .conectar)
        XCTAssertEqual(LeerHoy.pasos(.noData, saludConectada: false), .conectar)
        XCTAssertEqual(LeerHoy.pasos(.noData, saludConectada: true), .sinDatos, "sin muestras no es un cero medido")
        guard case .cifra(let texto) = LeerHoy.pasos(.steps(11480), saludConectada: true) else { return XCTFail() }
        XCTAssertTrue(texto.contains("11") && texto.contains("480"), texto)
    }

    // MARK: - Lo que reclama

    func testLaBateriaSinPublicarPintaElContadorEnCeroSinDenominadorInventado() {
        var f = fuentes(plan: plan(dias: []))
        f.bateria = .empty
        XCTAssertEqual(LecturaHoy.desde(f).reclamos, [.tests(hechos: 0, total: nil)])
        f.bateria = BatteryStatus(total: 4, completed: 1, tests: [], athleteWeightKg: nil)
        XCTAssertEqual(LecturaHoy.desde(f).reclamos, [.tests(hechos: 1, total: 4)])
    }

    func testLaRevisionPropuestaYLaReservadaSonExcluyentesYLaReservaGana() {
        let propuesta: AthleteReviewState = decodifica(#"{"cadence":"monthly","last_review_at":null,"next_review":null,"proposal_pending":true,"due":false}"#)
        var f = fuentes(plan: plan(dias: []))
        f.revision = propuesta
        XCTAssertEqual(LecturaHoy.desde(f).reclamos, [.revision(.propuesta, cuando: nil, minutos: nil, enlace: nil)])

        let cita: AthleteReviewAppointment = decodifica(#"{"id":"r1","requested_start":"2026-10-05T16:00:00Z","duration_minutes":30,"status":"aceptada","meet_link":"https://meet.example.com/x"}"#)
        f.revisionReservada = cita
        guard case .revision(.reservada, let cuando, let minutos, let enlace)? = LecturaHoy.desde(f).reclamos.first else {
            return XCTFail("una cita reservada gana a la propuesta")
        }
        XCTAssertNotNil(cuando)
        XCTAssertEqual(minutos, 30)
        XCTAssertEqual(enlace?.absoluteString, "https://meet.example.com/x")
    }

    func testUnEnlaceDeVideollamadaVacioNoEsUnEnlace() {
        let cita: AthleteReviewAppointment = decodifica(#"{"id":"r1","requested_start":"2026-10-05T16:00:00Z","duration_minutes":30,"status":"aceptada","meet_link":""}"#)
        var f = fuentes(plan: plan(dias: []))
        f.revisionReservada = cita
        guard case .revision(_, _, _, let enlace)? = LecturaHoy.desde(f).reclamos.first else { return XCTFail() }
        XCTAssertNil(enlace)
    }

    func testLaParejaSoloEntrenaAhoraConUnLatidoFresco() {
        func pareja(edad: Int) -> PartnerLiveStatus {
            decodifica(#"{"name":"Biel","phase":"active","workout_title":"Metcon 20'","progress_text":"RONDA 3/5","elapsed_s":300,"age_s":\#(edad)}"#)
        }
        var f = fuentes(plan: plan(dias: []))
        f.parejaEnVivo = pareja(edad: 30)
        XCTAssertEqual(LecturaHoy.desde(f).reclamos, [.parejaEnVivo(nombre: "Biel", detalle: "Metcon 20' · RONDA 3/5")])
        f.parejaEnVivo = pareja(edad: 600)
        XCTAssertEqual(LecturaHoy.desde(f).reclamos, [], "un latido viejo no es «entrenando ahora»")
    }

    func testElEntrenoGuardadoDiceDesdeQueHoraSeGuardo() {
        var f = fuentes(plan: plan(dias: []))
        f.guardado = (titulo: "Series 6×800", guardadoEn: ahora)
        XCTAssertEqual(LecturaHoy.desde(f).reclamos, [.aMedias(titulo: "Series 6×800", desde: "7:40")])
    }

    // MARK: - La fila de «Contigo» y sus textos

    private func fila(_ item: ItemContigo, coach: String? = "Mar", puedeUnirse: Bool = false) -> FilaContigo {
        var l = HoyCasos.base
        l.coach = coach
        l.hoy = .sesiones([HoyCasos.sesion("Hoy", .run, puedeUnirse ? .pendiente : .hecha)])
        return FilaContigo.desde(item, lectura: l)
    }

    func testLasFilasDeContigoDicenLoQueHayYNadaMas() {
        let tests = fila(.reclamo(.tests(hechos: 1, total: 4)))
        XCTAssertEqual(tests.detalle, "1 de 4 hechos")
        XCTAssertEqual(tests.extra, .regleta(n: 1, de: 4))

        let sinBateria = fila(.reclamo(.tests(hechos: 0, total: nil)))
        XCTAssertEqual(sinBateria.detalle, "Aún no has calibrado nada")
        XCTAssertEqual(sinBateria.extra, .ninguno, "sin batería no hay regleta que dibujar")

        let comunicados = fila(.comunicados(2))
        XCTAssertEqual(comunicados.titulo, "Del coach")
        XCTAssertEqual(comunicados.detalle, "2 sin resolver")

        let medias = fila(.reclamo(.aMedias(titulo: "Series 6×800", desde: "8:12")))
        XCTAssertEqual(medias.detalle, "Series 6×800 · desde las 8:12")
        XCTAssertTrue(medias.sinChevron)
    }

    func testLaRevisionPropuestaHablaEnNombreDelCoach() {
        let f = fila(.reclamo(.revision(.propuesta, cuando: nil, minutos: nil, enlace: nil)))
        XCTAssertEqual(f.titulo, "Mar te propone una revisión")
        XCTAssertEqual(f.detalle, "Elige tu hueco · videollamada de 30 min")
        XCTAssertEqual(fila(.reclamo(.revision(.propuesta, cuando: nil, minutos: nil, enlace: nil)), coach: nil).titulo,
                       "Tu coach te propone una revisión")
    }

    func testLaRevisionReservadaOfreceUnirseSoloConEnlace() {
        let enlace = URL(string: "https://meet.example.com/x")
        let con = fila(.reclamo(.revision(.reservada, cuando: "Lunes 5 oct · 18:00", minutos: 30, enlace: enlace)))
        XCTAssertEqual(con.extra, .pastilla("Unirse"))
        XCTAssertFalse(con.informativa)
        XCTAssertEqual(con.detalle, "Lunes 5 oct · 18:00 · 30 min")

        let sin = fila(.reclamo(.revision(.reservada, cuando: "Lunes 5 oct · 18:00", minutos: 30, enlace: nil)))
        XCTAssertEqual(sin.extra, .ninguno)
        XCTAssertTrue(sin.informativa, "sin enlace no hay nada que tocar")
        XCTAssertTrue(sin.detalle.contains("te enviaremos el enlace"))
    }

    func testTuParejaSoloOfreceUnirteSiTienesTuSesionPendiente() {
        let item = ItemContigo.reclamo(.parejaEnVivo(nombre: "Biel", detalle: "Metcon"))
        let puede = fila(item, puedeUnirse: true)
        XCTAssertEqual(puede.extra, .pastilla("Únete"))
        XCTAssertFalse(puede.informativa)
        let noPuede = fila(item, puedeUnirse: false)
        XCTAssertEqual(noPuede.extra, .ninguno)
        XCTAssertTrue(noPuede.informativa, "no hay un gesto que ofrecer: la fila no aparenta ser un botón")
    }
}

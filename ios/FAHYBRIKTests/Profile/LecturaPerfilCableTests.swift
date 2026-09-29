import XCTest
@testable import FAHYBRIK

// DEL CABLE A LA LECTURA, PROBADO — cada decisión de traducción de `LecturaPerfil+Cable`.
//
// Se construye con los modelos REALES del servidor (decodificados de JSON con el decodificador de la
// app, no a mano), para que la prueba pase por el cable de verdad: si un campo cambia de nombre o de
// forma, salta aquí y no en el teléfono de un atleta. Y una prueba de punta a punta: lo que la app lee
// de «Nora» produce EXACTAMENTE la lectura del caso ① del doble.

final class LecturaPerfilCableTests: XCTestCase {

    // MARK: Decodificar por el cable

    private func decodifica<T: Decodable>(_ json: String) -> T {
        // swiftlint:disable:next force_try
        try! APIClient.makeJSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private let zonasJSON = #"{"lthr_bpm":163,"estimated":false,"source":"lthr_measured","source_label":"Medido en tu test de umbral","confidence":"measured","zones":[{"zone":1,"code":"Z1","label":"Recuperación","max_bpm":132,"range_label":"< 132 ppm"}]}"#

    private func identidad(
        nombre: String = "Nora Ramos",
        dob: String? = "1992-01-01",
        experiencia: Double? = 6,
        alto: Double? = 172,
        peso: Double? = 64.5,
        objetivo: String? = "improve_hyrox_mark",
        fcMax: Int? = 188,
        zonas: Bool = true,
        avatar: String? = nil
    ) -> AthleteIdentity {
        func campo(_ k: String, _ v: String?) -> String? { v.map { "\"\(k)\":\($0)" } }
        let campos = [
            #""id":"a1""#,
            #""full_name":"\#(nombre)""#,
            campo("dob", dob.map { "\"\($0)\"" }),
            campo("training_experience_years", experiencia.map { String($0) }),
            campo("height_cm", alto.map { String($0) }),
            campo("weight_kg", peso.map { String($0) }),
            campo("goal_type", objetivo.map { "\"\($0)\"" }),
            campo("max_hr_bpm", fcMax.map { String($0) }),
            zonas ? "\"hr_zones\":\(zonasJSON)" : nil,
            campo("avatar_url", avatar.map { "\"\($0)\"" }),
        ].compactMap { $0 }
        return decodifica("{\(campos.joined(separator: ","))}")
    }

    private func porcion<T: Codable>(_ valor: T?, cargada: Bool = true, fallida: Bool = false) -> Slice<T> {
        var s = Slice<T>()
        if let valor { s.setLoaded(valor) } else if cargada { s.setLoaded(nil) }
        s.loadFailed = fallida
        return s
    }

    private func bateria(total: Int, completados: Int, aMedias: Int = 0) -> BatteryStatus {
        let tests = (0..<total).map { i -> String in
            let hecho = i < completados
            let pendiente = !hecho && i < completados + aMedias
            return #"{"calibration_slug":"t\#(i)","label":"Test \#(i + 1)","assignment_id":"\#(i)","scheduled_for":"2026-09-0\#(i + 1)","session_status":"\#(hecho || pendiente ? "completed" : "scheduled")","result_captured":\#(hecho),"result_pending":\#(pendiente)}"#
        }
        return decodifica(#"{"total":\#(total),"completed":\#(completados),"tests":[\#(tests.joined(separator: ","))]}"#)
    }

    /// El catálogo de 12 pruebas; las `conRecord` primeras traen su mejor marca.
    private func catalogo(conRecord: Int) -> [MarkView] {
        (0..<12).map { i in
            var campos = [
                #""slug":"p\#(i)""#, #""label":"Prueba \#(i)""#, #""group":"run""#, #""measured_by":"run""#,
                #""unit":"seconds""#, #""lower_is_better":true"#, #""approx_label":"~4:00""#, #""history":[]"#,
            ]
            if i < conRecord {
                campos.append(#""best":{"id":"b\#(i)","value":232,"recorded_at":"2026-07-12T09:00:00Z","source":"athlete_test"}"#)
            }
            return decodifica("{\(campos.joined(separator: ","))}")
        }
    }

    private func vo2(_ valor: Double?, fuente: String = "watch") -> AthleteVo2Max {
        let titular = valor.map { #"{"value":\#($0),"source":"\#(fuente)","measured_on":"2026-09-20"}"# } ?? "null"
        return decodifica(#"{"headline":\#(titular),"series":[],"baseline":null,"vdot":null}"#)
    }

    private func fuerza(_ lista: [(String, Double)]) -> [StrengthMaxProfile] {
        lista.enumerated().map { i, l in
            decodifica(#"{"exercise_slug":"e\#(i)","exercise_label":"\#(l.0)","one_rm_kg":\#(l.1),"unit":"kg","source":"athlete_test","history":[]}"#)
        }
    }

    private func wearables(_ json: String) -> WearablesResponse { decodifica(json) }

    /// «Hoy» de las pruebas: martes 29 de septiembre de 2026, a mediodía.
    private let ahora: Date = {
        var c = DateComponents()
        c.year = 2026; c.month = 9; c.day = 29; c.hour = 12
        return Calendar.current.date(from: c) ?? Date()
    }()

    // MARK: - El arranque y la identidad

    func testEnFrioNadaHaContestadoYNoEsUnError() {
        let l = LecturaPerfil.desde(LoLeidoPerfil(), ahora: ahora)
        XCTAssertTrue(l.cargando)
        XCTAssertFalse(l.errorCarga)
        XCTAssertEqual(l.identidad, .vacia)
        XCTAssertEqual(DecidePerfil.modoIdentidad(l), .cargando)
    }

    func testUnaIdentidadQueFalloSinNadaGuardadoEsUnErrorNoUnFrio() {
        var leido = LoLeidoPerfil()
        leido.identidad = porcion(nil as AthleteIdentity?, cargada: false, fallida: true)
        let l = LecturaPerfil.desde(leido, ahora: ahora)
        XCTAssertTrue(l.errorCarga)
        XCTAssertFalse(l.cargando)
    }

    func testConIdentidadGuardadaUnFalloAlRefrescarNoLaTira() {
        var leido = LoLeidoPerfil()
        leido.identidad = porcion(identidad(), fallida: true)
        let l = LecturaPerfil.desde(leido, ahora: ahora)
        XCTAssertFalse(l.errorCarga, "hay un valor que enseñar: SWR, en silencio")
        XCTAssertFalse(l.cargando)
        XCTAssertEqual(l.identidad.nombre, "Nora Ramos")
    }

    func testLaIdentidadSeTraduceCampoACampoSinAdivinar() {
        let id = IdentidadPerfil(identidad(), division: "Open", ahora: ahora)
        XCTAssertEqual(id.nombre, "Nora Ramos")
        XCTAssertEqual(id.division, "Open")
        XCTAssertEqual(id.edad, 34)
        XCTAssertEqual(id.anosEntrenando, 6)
        XCTAssertEqual(id.alturaCm, 172)
        XCTAssertEqual(id.pesoKg, 64.5)
        XCTAssertEqual(id.fcMax, 188)
        XCTAssertEqual(id.objetivo, .improveHyroxMark)
        XCTAssertNil(id.fotoURL)

        let sinNada = IdentidadPerfil(
            identidad(dob: nil, experiencia: nil, alto: nil, peso: nil, objetivo: nil, fcMax: nil, zonas: false),
            division: nil, ahora: ahora
        )
        XCTAssertNil(sinNada.edad)
        XCTAssertNil(sinNada.anosEntrenando)
        XCTAssertNil(sinNada.objetivo)
        XCTAssertNil(sinNada.fcMax)
    }

    func testMedioAnoDeExperienciaNoEsUnAnoEnteroNiSeEscribeCeroAnos() {
        XCTAssertNil(IdentidadPerfil(identidad(experiencia: 0.5), division: nil, ahora: ahora).anosEntrenando)
        XCTAssertNil(IdentidadPerfil(identidad(experiencia: 0), division: nil, ahora: ahora).anosEntrenando)
        XCTAssertEqual(IdentidadPerfil(identidad(experiencia: 2.9), division: nil, ahora: ahora).anosEntrenando, 2)
    }

    func testUnObjetivoQueLaAppNoConoceNoSeInventa() {
        XCTAssertNil(IdentidadPerfil(identidad(objetivo: "ganar_el_mundial"), division: nil, ahora: ahora).objetivo)
    }

    func testLaEdadSeCuentaAnosCumplidos() {
        XCTAssertEqual(AthleteIdentity.edad(dob: "1992-10-01", ahora: ahora), 33, "aún no ha cumplido en octubre")
        XCTAssertEqual(AthleteIdentity.edad(dob: "1992-09-29", ahora: ahora), 34, "hoy los cumple")
        XCTAssertNil(AthleteIdentity.edad(dob: "no es una fecha", ahora: ahora))
        XCTAssertNil(AthleteIdentity.edad(dob: nil, ahora: ahora))
    }

    func testLaFotoLlegaComoURLYSinFotoNoHayNinguna() {
        XCTAssertNotNil(IdentidadPerfil(identidad(avatar: "https://ejemplo.es/a.jpg"), division: nil, ahora: ahora).fotoURL)
        XCTAssertNil(IdentidadPerfil(identidad(avatar: nil), division: nil, ahora: ahora).fotoURL)
    }

    // MARK: - Las fuentes de Rendimiento

    func testLasZonasViajanConLaIdentidadSinAnclaEsUnaRespuestaNoUnHueco() {
        var leido = LoLeidoPerfil()
        XCTAssertEqual(LecturaPerfil.desde(leido, ahora: ahora).rendimiento.zonas, .cargando)
        leido.identidad = porcion(identidad(zonas: true))
        XCTAssertEqual(
            LecturaPerfil.desde(leido, ahora: ahora).rendimiento.zonas,
            .contesto(ZonasPerfil(umbralPpm: 163, origen: "Medido en tu test de umbral"))
        )
        leido.identidad = porcion(identidad(zonas: false))
        XCTAssertEqual(LecturaPerfil.desde(leido, ahora: ahora).rendimiento.zonas, .contesto(nil))
    }

    func testLaFuerzaSaleDeLaPorcionDelStoreEnSusCuatroEstados() {
        var leido = LoLeidoPerfil()
        XCTAssertEqual(LecturaPerfil.desde(leido, ahora: ahora).rendimiento.fuerza, .cargando)
        leido.fuerza = porcion(nil as [StrengthMaxProfile]?, cargada: false, fallida: true)
        XCTAssertEqual(LecturaPerfil.desde(leido, ahora: ahora).rendimiento.fuerza, .sinRespuesta)
        leido.fuerza = porcion(nil as [StrengthMaxProfile]?, cargada: true)
        XCTAssertEqual(LecturaPerfil.desde(leido, ahora: ahora).rendimiento.fuerza, .contesto([]), "cargó y no hay nada: es un vacío")
        leido.fuerza = porcion(fuerza([("Sentadilla", 140), ("Peso muerto", 165)]))
        XCTAssertEqual(
            LecturaPerfil.desde(leido, ahora: ahora).rendimiento.fuerza,
            .contesto([LevantamientoPerfil(etiqueta: "Sentadilla", kg: 140), LevantamientoPerfil(etiqueta: "Peso muerto", kg: 165)])
        )
    }

    func testLaBateriaSinProgramarNoTieneContadorYCuentaLosTestsAMedias() {
        XCTAssertNil(BateriaPerfil(bateria(total: 0, completados: 0)))
        XCTAssertNil(BateriaPerfil(nil))
        XCTAssertEqual(
            BateriaPerfil(bateria(total: 4, completados: 2, aMedias: 1)),
            BateriaPerfil(total: 4, completados: 2, aMedias: 1)
        )
    }

    func testSinCoachLaBateriaNiSePideNiSePinta() {
        var leido = LoLeidoPerfil()
        leido.conCoach = false
        leido.bateria = .contesto(bateria(total: 4, completados: 4))
        XCTAssertEqual(LecturaPerfil.desde(leido, ahora: ahora).rendimiento.bateria, .contesto(nil))
    }

    func testMarcasContestaElCatalogoYLosRecords() {
        XCTAssertEqual(MarcasPerfil(catalogo(conRecord: 9)), MarcasPerfil(conRecord: 9, catalogo: 12))
        XCTAssertEqual(MarcasPerfil([]), MarcasPerfil(conRecord: 0, catalogo: 0))
    }

    func testElVo2NadieLoHaMedidoEsNilYLaFuenteSeDistingue() {
        XCTAssertNil(Vo2Perfil(vo2(nil)))
        XCTAssertNil(Vo2Perfil(nil))
        XCTAssertEqual(Vo2Perfil(vo2(52.8)), Vo2Perfil(valor: 52.8, fuente: .reloj))
        XCTAssertEqual(Vo2Perfil(vo2(46.5, fuente: "cooper")), Vo2Perfil(valor: 46.5, fuente: .cooper))
    }

    func testUnaFuenteQueFalloAlRefrescarNoPisaLaCifraBuenaPeroSinNadaSeDeclara() {
        let buena: FuenteDelDato<Int> = .contesto(9)
        XCTAssertEqual(buena.trasPedir(.sinRespuesta), .contesto(9))
        XCTAssertEqual(buena.trasPedir(.contesto(10)), .contesto(10))
        XCTAssertEqual(FuenteDelDato<Int>.cargando.trasPedir(.sinRespuesta), .sinRespuesta)
        XCTAssertEqual(FuenteDelDato<Int>.sinRespuesta.trasPedir(.contesto(3)), .contesto(3))
    }

    func testAlReintentarLaFuenteQueFalloVuelveAEsqueletoYLaBuenaSeQueda() {
        XCTAssertEqual(FuenteDelDato<Int>.sinRespuesta.alReintentar, .cargando)
        XCTAssertEqual(FuenteDelDato<Int>.contesto(9).alReintentar, .contesto(9))
        XCTAssertEqual(FuenteDelDato<Int>.cargando.alReintentar, .cargando)
    }

    // MARK: - Suscripción

    private func suscripcion(_ status: String?, cancela: Bool = false, fin: String? = nil, tier: String? = "coached") -> SubscriptionInfo {
        SubscriptionInfo(subscribed: status != nil, status: status, tier: tier, currentPeriodEnd: fin, cancelAtPeriodEnd: cancela)
    }

    func testLaSuscripcionSeTraduceDeStripeALoQueLaPuertaCuenta() {
        let hoy = "2026-09-29"
        let fin = "2026-10-12T12:00:00Z"
        XCTAssertEqual(SuscripcionPerfil(suscripcion("active", fin: fin), hoy: hoy), .activa)
        XCTAssertEqual(SuscripcionPerfil(suscripcion("active", cancela: true, fin: fin), hoy: hoy), .termina(el: "12 oct"))
        XCTAssertEqual(SuscripcionPerfil(suscripcion("trialing", fin: fin), hoy: hoy), .prueba(hasta: "12 oct"))
        XCTAssertEqual(SuscripcionPerfil(suscripcion("trialing"), hoy: hoy), .prueba(hasta: nil))
        for s in ["past_due", "unpaid", "incomplete"] {
            XCTAssertEqual(SuscripcionPerfil(suscripcion(s), hoy: hoy), .pagoPendiente, s)
        }
        for s in ["canceled", "incomplete_expired"] {
            XCTAssertEqual(SuscripcionPerfil(suscripcion(s), hoy: hoy), .cancelada, s)
        }
        XCTAssertEqual(SuscripcionPerfil(suscripcion("paused"), hoy: hoy), .pausada)
    }

    func testUnaSuscripcionQueTerminaSinFechaSeQuedaActivaComoHastaAhora() {
        XCTAssertEqual(SuscripcionPerfil(suscripcion("active", cancela: true), hoy: "2026-09-29"), .activa)
    }

    func testUnaFechaDeOtroAnoLlevaElAno() {
        XCTAssertEqual(
            SuscripcionPerfil(suscripcion("active", cancela: true, fin: "2027-03-06T12:00:00Z"), hoy: "2026-09-29"),
            .termina(el: "6 mar 2027")
        )
    }

    func testElTierLibreYUnEstadoDesconocidoNoTienenSuscripcionQueContar() {
        XCTAssertNil(SuscripcionPerfil(suscripcion(nil, tier: "free"), hoy: "2026-09-29"))
        XCTAssertNil(SuscripcionPerfil(suscripcion("active", tier: "free"), hoy: "2026-09-29"))
        XCTAssertNil(SuscripcionPerfil(suscripcion(nil), hoy: "2026-09-29"), "sin suscripción no se inventa un estado")
        XCTAssertNil(SuscripcionPerfil(suscripcion("algo_nuevo_de_stripe"), hoy: "2026-09-29"))
    }

    func testSinCoachNoHaySuscripcionAunqueElStoreLaTenga() {
        var leido = LoLeidoPerfil()
        leido.conCoach = false
        leido.suscripcion = porcion(suscripcion("past_due"))
        XCTAssertNil(LecturaPerfil.desde(leido, ahora: ahora).suscripcion)
    }

    // MARK: - Pareja de Dobles

    private func sobre(
        pareja: String? = nil,
        modalidad: String? = nil,
        invitacion: (String, String)? = nil,
        caduca: Date? = nil
    ) -> PartnerEnvelope {
        let partner = pareja.map { PartnerInfo(userId: "u2", athleteId: nil, fullName: $0, email: nil, modality: nil, onboardedAt: nil) }
        let inv = invitacion.map { estado, email in
            SentInvitation(status: estado, inviteeEmail: email, expiresAt: ISO8601DateFormatter().string(from: caduca ?? ahora))
        }
        return PartnerEnvelope(source: pareja == nil ? nil : "doubles_pair", partner: partner, athleteModality: modalidad, sentInvitation: inv)
    }

    func testConParejaSeDiceElNombreDePila() {
        XCTAssertEqual(ParejaPerfil(sobre(pareja: "Biel Ferrer"), suscripcion: nil, ahora: ahora), .conPareja(nombre: "Biel"))
    }

    func testIndividualNoTieneParejaNiHueco() {
        XCTAssertNil(ParejaPerfil(sobre(), suscripcion: suscripcion("active"), ahora: ahora))
    }

    func testDoblesSeReconocePorElPlanOPorLaModalidadYSinInvitacionEsSinPareja() {
        let plan = SubscriptionInfo(subscribed: true, status: "active", planType: "dobles", currentPeriodEnd: nil, cancelAtPeriodEnd: false)
        XCTAssertEqual(ParejaPerfil(sobre(), suscripcion: plan, ahora: ahora), .sinPareja)
        XCTAssertEqual(ParejaPerfil(sobre(modalidad: "Dobles"), suscripcion: nil, ahora: ahora), .sinPareja)
    }

    func testLaInvitacionEnviadaCuentaSegunSuEstado() {
        let dentroDeDoce = Calendar.current.date(byAdding: .day, value: 12, to: ahora)
        XCTAssertEqual(
            ParejaPerfil(sobre(modalidad: "dobles", invitacion: ("pending", "oriol@ejemplo.es"), caduca: dentroDeDoce), suscripcion: nil, ahora: ahora),
            .invitacion(.pendiente, email: "oriol@ejemplo.es", caduca: "en 12 días")
        )
        XCTAssertEqual(
            ParejaPerfil(sobre(modalidad: "dobles", invitacion: ("expired", "a@b.es")), suscripcion: nil, ahora: ahora),
            .invitacion(.caducada, email: "a@b.es", caduca: nil)
        )
        XCTAssertEqual(
            ParejaPerfil(sobre(modalidad: "dobles", invitacion: ("declined", "a@b.es")), suscripcion: nil, ahora: ahora),
            .invitacion(.rechazada, email: "a@b.es", caduca: nil)
        )
        XCTAssertEqual(
            ParejaPerfil(sobre(modalidad: "dobles", invitacion: ("cancelled", "a@b.es")), suscripcion: nil, ahora: ahora),
            .sinPareja,
            "una invitación cancelada es como no haber invitado"
        )
    }

    func testLaCaducidadSeDiceParaIrTrasCaduca() {
        func inv(_ dias: Int) -> String? {
            let fecha = Calendar.current.date(byAdding: .day, value: dias, to: ahora) ?? ahora
            return SentInvitation(status: "pending", inviteeEmail: "a@b.es", expiresAt: ISO8601DateFormatter().string(from: fecha)).caducaEn(ahora: ahora)
        }
        XCTAssertEqual(inv(0), "hoy")
        XCTAssertEqual(inv(1), "mañana")
        XCTAssertEqual(inv(12), "en 12 días")
        XCTAssertEqual(SentInvitation(status: "pending", inviteeEmail: "a@b.es", expiresAt: "ayer").caducaEn(ahora: ahora), nil)
    }

    // MARK: - Dispositivos y el permiso del reloj

    func testLosDispositivosSalenEnSuOrdenDeSiempreSeaCualSeaElDeLaLectura() {
        var leido = LoLeidoPerfil()
        leido.corosConectado = true
        leido.saludConectado = true
        leido.relojActivo = true
        XCTAssertEqual(LecturaPerfil.desde(leido, ahora: ahora).dispositivos, [.salud, .watch, .coros])
        leido.polarConectado = true
        XCTAssertEqual(LecturaPerfil.desde(leido, ahora: ahora).dispositivos, [.salud, .watch, .polar, .coros])
        XCTAssertEqual(LecturaPerfil.desde(LoLeidoPerfil(), ahora: ahora).dispositivos, [])
    }

    func testElPermisoDelMovimientoDelRelojDistingueNoPreguntadoDeRetirado() {
        let v = SensorCaptureConsent.currentVersion
        var estado = SensorConsentState()
        XCTAssertEqual(MovimientoReloj(estado, version: v), .sinPreguntar)
        estado.markAsked()
        XCTAssertEqual(MovimientoReloj(estado, version: v), .retirado, "«Ahora no»: preguntado y sin sí")
        estado.grant(version: v)
        XCTAssertEqual(MovimientoReloj(estado, version: v), .permitido)
        estado.withdraw()
        XCTAssertEqual(MovimientoReloj(estado, version: v), .retirado, "apagar el interruptor también es una decisión")
    }

    func testUnSiATextoAnteriorNoCuentaYNoEsUnaDecisionSobreEsteTexto() {
        var estado = SensorConsentState()
        estado.grant(version: "2026-01-01.v0")
        XCTAssertEqual(MovimientoReloj(estado, version: SensorCaptureConsent.currentVersion), .sinPreguntar)
    }

    // MARK: - La pregunta de COROS

    func testLaHoraDeLaActividadSeDiceEnLaHoraDelAtleta() {
        let madrid = TimeZone(identifier: "Europe/Madrid") ?? .current
        let utc = TimeZone(identifier: "UTC") ?? .current
        XCTAssertEqual(HoraDeInicio.texto(iso: "2026-09-29T05:12:00Z", zona: madrid), "7:12", "verano: UTC+2")
        XCTAssertEqual(HoraDeInicio.texto(iso: "2026-09-29T17:05:00.250Z", zona: madrid), "19:05")
        XCTAssertEqual(HoraDeInicio.texto(iso: "2026-09-29T05:12:00Z", zona: utc), "5:12")
    }

    func testSinHoraLaPreguntaSeHaceIgualSinDecirla() {
        XCTAssertNil(HoraDeInicio.texto(iso: nil))
        XCTAssertNil(HoraDeInicio.texto(iso: ""))
        XCTAssertNil(HoraDeInicio.texto(iso: "ayer por la mañana"))
    }

    func testLaPreguntaPendienteEntraEnLaLectura() {
        var leido = LoLeidoPerfil()
        leido.corosPendiente = wearables(#"{"providers":[],"pending_links":[{"confirmation_id":"c1","provider":"coros","source_workout_ref":"w1","started_at":"2026-09-29T17:05:00Z"}]}"#).pendingLinks.first
        let utc = TimeZone(identifier: "UTC") ?? .current
        XCTAssertEqual(LecturaPerfil.desde(leido, ahora: ahora, zona: utc).corosPendiente, PreguntaCoros(inicio: "17:05"))
    }

    // MARK: - Qué se hace con lo que contesta COROS

    func testConUnaPreguntaPendienteNoSeAvisaDeNadaMas() {
        let r = wearables(#"{"providers":[{"provider":"coros","connected":true}],"pending_links":[{"confirmation_id":"c1","provider":"coros","source_workout_ref":"w1"}],"imported":2}"#)
        guard case let .pregunta(enlace) = DecidePerfil.resultado(sincronizacion: r) else { return XCTFail("debía preguntar") }
        XCTAssertEqual(enlace.confirmationId, "c1")
    }

    func testUnEnlaceDeOtroProveedorNoEsLaPreguntaDeCoros() {
        let r = wearables(#"{"providers":[],"pending_links":[{"confirmation_id":"p1","provider":"polar","source_workout_ref":"w1"}]}"#)
        XCTAssertNil(DecidePerfil.preguntaPendiente(r))
        XCTAssertEqual(DecidePerfil.resultado(sincronizacion: r), .nada)
    }

    func testImportarEntrenosEsUnaBuenaNoticiaQueSeVaSola() {
        XCTAssertEqual(
            DecidePerfil.resultado(sincronizacion: wearables(#"{"providers":[],"pending_links":[],"imported":2}"#)),
            .aviso(AvisoCoros(tono: .ok, texto: "Importados 2 entrenos de COROS."))
        )
        XCTAssertEqual(
            DecidePerfil.resultado(sincronizacion: wearables(#"{"providers":[],"pending_links":[],"imported":1}"#)),
            .aviso(AvisoCoros(tono: .ok, texto: "Importado 1 entreno de COROS."))
        )
    }

    func testLoQueNoSalioSeQuedaHastaLeerlo() {
        XCTAssertEqual(
            DecidePerfil.resultado(sincronizacion: wearables(#"{"providers":[],"pending_links":[],"skip_reason":"coros_not_connected"}"#)),
            .aviso(AvisoCoros(tono: .fallo, texto: "COROS no está conectada. Conéctala en Dispositivos e inténtalo de nuevo."))
        )
        // Con un fallo suelto y nada importado, el aviso es de los que se quedan.
        guard case let .aviso(aviso) = DecidePerfil.resultado(sincronizacion: wearables(#"{"providers":[],"pending_links":[],"imported":0,"errored":1}"#)) else {
            return XCTFail("un error suelto avisa")
        }
        XCTAssertEqual(aviso.tono, .fallo)
        // Un motivo de salto gana aunque hubiera importado algo: el atleta tiene que leerlo.
        guard case let .aviso(mixto) = DecidePerfil.resultado(sincronizacion: wearables(#"{"providers":[],"pending_links":[],"imported":3,"skip_reason":"coros_sync_failed"}"#)) else {
            return XCTFail("un motivo de salto avisa")
        }
        XCTAssertEqual(mixto.tono, .fallo)
    }

    func testSinNadaQueContarNoSeAvisa() {
        XCTAssertEqual(DecidePerfil.resultado(sincronizacion: wearables(#"{"providers":[],"pending_links":[],"imported":0}"#)), .nada)
        XCTAssertEqual(DecidePerfil.resultado(sincronizacion: wearables(#"{"providers":[],"pending_links":[]}"#)), .nada)
    }

    func testUnFalloDeRedAvisaConElTextoDeLaApp() {
        let aviso = DecidePerfil.aviso(falloDeSincronizacion: APIError.offline)
        XCTAssertEqual(aviso, AvisoCoros(tono: .fallo, texto: "Sin conexión. Vuelve a intentarlo cuando tengas red."))
    }

    // MARK: - De punta a punta

    func testLoQueLaAppLeeDeNoraProduceExactamenteElCasoUnoDelDoble() {
        var leido = LoLeidoPerfil()
        leido.identidad = porcion(identidad())
        leido.division = "Open"
        leido.conCoach = true
        leido.coach = "Mar"
        leido.bateria = .contesto(bateria(total: 4, completados: 4))
        leido.marcas = .contesto(catalogo(conRecord: 9))
        leido.vo2 = .contesto(vo2(52.8))
        leido.fuerza = porcion(fuerza([("Sentadilla", 140), ("Peso muerto", 165), ("Press banca", 82.5)]))
        leido.suscripcion = porcion(suscripcion("active", fin: "2026-10-12T12:00:00Z"))
        leido.pareja = porcion(sobre())
        leido.saludConectado = true
        leido.relojActivo = true
        leido.corosConectado = true
        var consentimiento = SensorConsentState()
        consentimiento.grant(version: SensorCaptureConsent.currentVersion)
        leido.consentimiento = consentimiento
        leido.version = CasosPerfil.version

        var esperada = CasosPerfil.caso("veterano").lectura
        // La única diferencia a propósito: el ejemplo lleva una foto de marcador y este atleta no la sube.
        esperada.identidad.fotoURL = nil
        XCTAssertEqual(LecturaPerfil.desde(leido, ahora: ahora), esperada)
    }
}

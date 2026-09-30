import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA GALERÍA DE LAS CIFRAS, LA SUSCRIPCIÓN, LAS MOLESTIAS, LOS DISPOSITIVOS Y LAS HOJAS DE CUENTA — cada estado de
// cada pantalla (datos, cargando, vacío, error), en claro, oscuro y con el acento de un club azul, más un tamaño de
// texto de accesibilidad para los casos que más se estiran. La herramienta de REVISIÓN de esas pantallas: falla si
// una pieza revienta al pintarse y deja los PNG en `FAHYBRIK_CAPTURAS`.
final class GaleriaSecPerfilCifrasRenderTests: GaleriaSecPerfilBase {

    // MARK: Mi fuerza

    @MainActor
    func testMiFuerza() {
        let datos: [StrengthMaxProfile] = [
            .ejemplo("dl", "Peso muerto", kg: 165, pesoTest: 150, reps: 3),
            .ejemplo("sq", "Sentadilla", kg: 140, origen: "declared"),
            .ejemplo("bp", "Press banca", kg: 92.5, pesoTest: 85, reps: 5),
        ]
        captura(empujada(MyStrengthCuerpo(carga: .datos(datos))), nombre: "10-fuerza-datos")
        captura(empujada(MyStrengthCuerpo(carga: .cargando)), nombre: "10-fuerza-cargando", todas: false)
        captura(empujada(MyStrengthCuerpo(carga: .datos([]))), nombre: "10-fuerza-vacio")
        captura(empujada(MyStrengthCuerpo(carga: .error)), nombre: "10-fuerza-error", todas: false)
        captura(RegisterStrengthTestView(bearer: "t", hasCoach: true, onSaved: {}), nombre: "10-fuerza-registrar")
    }

    // MARK: Mis zonas

    private var zonasDeEjemplo: ZonasDelAtleta {
        let carrera: ZoneModalityProfile = decodifica(
            #"{"modality":"run","modality_label":"Carrera","pace_unit":"per_km","pace_unit_label":"/km","threshold_s":235,"recorded_at":"2026-06-20T08:00:00Z","zones":["#
            + ##"{"code":"Z1","label":"Recuperación","color":"#6FB7E9","sort_order":1,"fast_s":330,"slow_s":null,"range_label":"> 5:30/km"},"##
            + ##"{"code":"Z2","label":"Base","color":"#3FC773","sort_order":2,"fast_s":300,"slow_s":330,"range_label":"5:00–5:30/km"},"##
            + ##"{"code":"Z3","label":"Tempo","color":"#F2A52E","sort_order":3,"fast_s":270,"slow_s":300,"range_label":"4:30–5:00/km"},"##
            + ##"{"code":"Z4","label":"Umbral","color":"#F2702E","sort_order":4,"fast_s":235,"slow_s":270,"range_label":"3:55–4:30/km"}]}"##
        )
        let remo: ZoneModalityProfile = decodifica(
            #"{"modality":"row","modality_label":"Remo","pace_unit":"per_500m","pace_unit_label":"/500 m","threshold_s":112,"zones":["#
            + #"{"code":"Z1","label":"Recuperación","color":null,"sort_order":1,"fast_s":130,"slow_s":null,"range_label":"> 2:10/500 m"},"#
            + #"{"code":"Z2","label":"Base","color":null,"sort_order":2,"fast_s":120,"slow_s":130,"range_label":"2:00–2:10/500 m"}]}"#
        )
        let hr: HRZoneProfile = decodifica(
            #"{"lthr_bpm":163,"estimated":true,"source":"lthr_declared","source_label":"Estimada con tu FC máxima","confidence":"declared","zones":["#
            + #"{"zone":1,"code":"Z1","label":"Recuperación","max_bpm":132,"range_label":"< 132 ppm"},"#
            + #"{"zone":2,"code":"Z2","label":"Base","max_bpm":147,"range_label":"132–147 ppm"},"#
            + #"{"zone":3,"code":"Z3","label":"Tempo","max_bpm":158,"range_label":"148–158 ppm"}]}"#
        )
        return ZonasDelAtleta(modalities: [carrera, remo], hr: hr)
    }

    @MainActor
    func testMisZonas() {
        captura(empujada(MyZonesCuerpo(carga: .datos(zonasDeEjemplo))), nombre: "11-zonas-datos")
        captura(empujada(MyZonesCuerpo(carga: .datos(ZonasDelAtleta(modalities: [], hr: nil)))), nombre: "11-zonas-vacio", todas: false)
        captura(empujada(MyZonesCuerpo(carga: .cargando)), nombre: "11-zonas-cargando", todas: false)
        captura(empujada(MyZonesCuerpo(carga: .error)), nombre: "11-zonas-error", todas: false)
        captura(RegisterTestView(bearer: "t", onSaved: {}), nombre: "11-zonas-registrar", todas: false)
    }

    // MARK: VO₂ máx

    private func vo2(conCurva: Bool, vdot: Bool, fuente: Vo2MaxSource = .watch) -> AthleteVo2Max {
        let hoy = Date()
        let dia = ISO8601DateFormatter()
        dia.formatOptions = [.withFullDate]
        let serie = (0..<8).map { i in
            Vo2MaxPoint(isoDate: dia.string(from: hoy.addingTimeInterval(TimeInterval(i - 8) * 10 * 86_400)), value: 52.0 + Double(i) * 0.4)
        }
        return AthleteVo2Max(
            headline: Vo2MaxHeadline(value: 55.2, source: fuente, measuredOn: dia.string(from: hoy)),
            series: conCurva ? serie : [],
            baseline: 53.6,
            vdot: vdot ? Vo2MaxVdot(value: 51.8, markLabel: "10 km en 41:30", recordedOn: dia.string(from: hoy)) : nil
        )
    }

    @MainActor
    func testVo2() {
        captura(empujada(Vo2MaxCuerpo(carga: .datos(vo2(conCurva: true, vdot: true)))), nombre: "12-vo2-datos")
        captura(empujada(Vo2MaxCuerpo(carga: .datos(vo2(conCurva: false, vdot: false, fuente: .cooper)))), nombre: "12-vo2-sin-curva", todas: false)
        captura(empujada(Vo2MaxCuerpo(carga: .datos(nil))), nombre: "12-vo2-vacio")
        captura(empujada(Vo2MaxCuerpo(carga: .cargando)), nombre: "12-vo2-cargando", todas: false)
        captura(empujada(Vo2MaxCuerpo(carga: .error)), nombre: "12-vo2-error", todas: false)
    }

    // MARK: Mis días de entreno

    @MainActor
    func testDiasDeEntreno() {
        let semana = AvailabilityMap(days: [.program, .rest, .program, .otherActivity, .program, .rest, .rest])
        captura(empujada(TrainingDaysCuerpo(carga: .datos(()), working: .constant(semana), puedeGuardar: true)), nombre: "13-dias-datos")
        captura(empujada(TrainingDaysCuerpo(carga: .datos(()), working: .constant(semana), falloAlGuardar: true)), nombre: "13-dias-fallo", todas: false)
        captura(empujada(TrainingDaysCuerpo(carga: .cargando, working: .constant(.restAll))), nombre: "13-dias-cargando", todas: false)
        captura(empujada(TrainingDaysCuerpo(carga: .error, working: .constant(.restAll))), nombre: "13-dias-error", todas: false)
    }

    // MARK: Suscripción

    private func sub(_ estado: String, cancelaAlFinal: Bool = false) -> SubscriptionInfo {
        SubscriptionInfo(subscribed: true, status: estado, planType: "individual", tier: "coached", currentPeriodEnd: "2026-11-12T00:00:00Z", cancelAtPeriodEnd: cancelaAlFinal)
    }

    private func ciclo(_ estado: String, baja: String? = nil, vuelve: String? = nil, disponibles: Int = 42) -> LifecycleState {
        LifecycleState(
            status: estado,
            pause: .init(budgetDays: 60, consumedDays: 60 - disponibles, availableDays: disponibles, renewsOn: "2027-02-01", returnsOn: vuelve, since: nil),
            baja: .init(scheduledFor: baja, daysLeft: nil),
            billing: .init(currentPeriodEnd: "2026-11-12", cancelAtPeriodEnd: baja != nil, collectionPaused: estado == "pausado")
        )
    }

    @MainActor
    func testSuscripcion() {
        captura(empujada(SubscriptionCuerpo(info: sub("active"), lifecycle: ciclo("activo"))), nombre: "14-suscripcion-en-marcha")
        captura(empujada(SubscriptionCuerpo(info: sub("active"), lifecycle: ciclo("pausado", vuelve: "2026-10-28"))), nombre: "14-suscripcion-pausa")
        captura(empujada(SubscriptionCuerpo(info: sub("active", cancelaAlFinal: true), lifecycle: ciclo("baja", baja: "2026-11-12"))), nombre: "14-suscripcion-baja")
        captura(empujada(SubscriptionCuerpo(info: sub("past_due"), lifecycle: nil)), nombre: "14-suscripcion-pago-pendiente", todas: false)
        captura(empujada(SubscriptionCuerpo(info: sub("canceled"), lifecycle: nil)), nombre: "14-suscripcion-inactiva", todas: false)
        captura(empujada(SubscriptionCuerpo(info: nil, lifecycle: nil, cargando: true)), nombre: "14-suscripcion-cargando", todas: false)
        captura(empujada(SubscriptionCuerpo(info: nil, lifecycle: nil)), nombre: "14-suscripcion-error", todas: false)
        captura(PauseSheet(state: ciclo("activo"), bearer: nil, onDone: {}, onSwitchToBaja: {}), nombre: "14-pausa-hoja")
        captura(PauseSheet(state: ciclo("activo", disponibles: 0), bearer: nil, onDone: {}, onSwitchToBaja: {}), nombre: "14-pausa-agotada", todas: false)
        captura(BajaSheet(state: ciclo("activo"), bearer: nil, onDone: {}, onSwitchToPause: {}), nombre: "14-baja-hoja")
    }

    // MARK: Molestias

    private func molestia(_ id: String, zona: String, estado: String, gravedad: String, nota: String? = nil, vuelta: String? = nil) -> AthleteInjury {
        var json: [String: Any] = [
            "id": id, "zone": zona, "severity": gravedad, "status": estado, "onset_date": "2026-09-18",
            "registered_by": "athlete", "updated_at": "2026-09-28T10:00:00Z",
            "updates": [
                ["id": "u1", "status": "en_recuperacion", "note": "Voy mejor con hielo", "recorded_by": "athlete", "recorded_at": "2026-09-22T10:00:00Z"],
                ["id": "u2", "status": NSNull(), "note": "Descansa un par de días", "recorded_by": "coach", "recorded_at": "2026-09-23T10:00:00Z"],
            ],
        ]
        if let nota { json["note"] = nota }
        if let vuelta { json["expected_return"] = vuelta }
        if estado == "resuelta" { json["resolved_date"] = "2026-09-27" }
        // swiftlint:disable:next force_try
        return try! APIClient.makeJSONDecoder().decode(AthleteInjury.self, from: JSONSerialization.data(withJSONObject: json))
    }

    @MainActor
    func testMolestias() {
        let lista = [
            molestia("a", zona: "rodilla", estado: "activa", gravedad: "moderada", nota: "Al bajar escaleras", vuelta: "2026-10-10"),
            molestia("b", zona: "tobillo_pie", estado: "en_recuperacion", gravedad: "leve"),
            molestia("c", zona: "lumbar", estado: "resuelta", gravedad: "severa"),
        ]
        captura(empujada(InjuriesCuerpo(carga: .datos(lista), coachName: "Marta", destino: { _ in EmptyView() })), nombre: "15-molestias-lista")
        captura(empujada(InjuriesCuerpo(carga: .datos([]), coachName: nil, hasCoach: false, destino: { _ in EmptyView() })), nombre: "15-molestias-vacio")
        captura(empujada(InjuriesCuerpo(carga: .cargando, coachName: nil, destino: { _ in EmptyView() })), nombre: "15-molestias-cargando", todas: false)
        captura(empujada(InjuriesCuerpo(carga: .error, coachName: nil, destino: { _ in EmptyView() })), nombre: "15-molestias-error", todas: false)
        captura(empujada(InjuryDetailView(injury: lista[0], bearer: nil, coachName: "Marta", onChanged: {})), nombre: "15-molestia-detalle")
        captura(empujada(InjuryDetailView(injury: lista[2], bearer: nil, coachName: nil, hasCoach: false, onChanged: {})), nombre: "15-molestia-resuelta", todas: false)
        captura(ReportInjurySheet(bearer: "t", coachName: "Marta", onSaved: {}), nombre: "15-molestia-reportar")
    }

    // MARK: Dispositivos

    @MainActor
    func testDispositivos() {
        captura(empujada(DeviceConnectionsView(bearer: nil).environment(store())), nombre: "16-dispositivos")
        captura(empujada(GarminSetupView(bearer: nil)), nombre: "16-garmin", todas: false)
        captura(empujada(CorosConnectionDetailView(bearer: "t", corosSyncing: .constant(false), onSync: {}, onDisconnectRequest: {})), nombre: "16-coros", todas: false)
        captura(empujada(PM5SettingsView(store: PM5ConnectionStore.shared)), nombre: "16-pm5", todas: false)
        captura(SensorConsentSheet(bearer: nil), nombre: "16-sensores", todas: false, entera: false)
        captura(DiagnosticoRelojView(bearer: nil), nombre: "16-diagnostico", todas: false, entera: false)
    }

    // MARK: Hojas de cuenta

    @MainActor
    func testHojasDeCuenta() {
        captura(FotoPerfilSheet(bearer: nil, iniciales: "NR", fotoActual: nil, onGuardada: { _ in }), nombre: "17-foto")
        captura(FotoPerfilSheet(bearer: nil, iniciales: "", fotoActual: "https://ejemplo.invalid/foto.jpg", onGuardada: { _ in }), nombre: "17-foto-con-foto", todas: false)
        captura(PartnerInviteSheet(bearer: "t", onInvited: { _ in }), nombre: "17-invitar")
        captura(PartnerRedeemView(token: "t", auth: AuthState(), onCompleted: {}), nombre: "17-canjear")
        captura(DeleteAccountConfirmView(bearer: "t", partnerName: "Biel", onCompleted: {}), nombre: "17-eliminar")
        captura(AppFeedbackSheet(bearer: "t"), nombre: "17-sugerencia")
    }

    // MARK: A tamaño de texto de accesibilidad

    @MainActor
    func testATamanoDeTextoDeAccesibilidad() {
        let ax = DynamicTypeSize.accessibility3
        captura(empujada(MyStrengthCuerpo(carga: .datos([.ejemplo("dl", "Peso muerto", kg: 165, pesoTest: 150, reps: 3)]))), nombre: "ax3-fuerza", todas: false, tamano: ax, entera: false)
        captura(empujada(MyZonesCuerpo(carga: .datos(zonasDeEjemplo))), nombre: "ax3-zonas", todas: false, tamano: ax, entera: false)
        captura(empujada(Vo2MaxCuerpo(carga: .datos(vo2(conCurva: true, vdot: true)))), nombre: "ax3-vo2", todas: false, tamano: ax, entera: false)
        captura(empujada(SubscriptionCuerpo(info: sub("active"), lifecycle: ciclo("pausado", vuelve: "2026-10-28"))), nombre: "ax3-suscripcion", todas: false, tamano: ax, entera: false)
        captura(empujada(DeviceConnectionsView(bearer: nil).environment(store())), nombre: "ax3-dispositivos", todas: false, tamano: ax, entera: false)
    }

    // MARK: Lo que la captura no dice

    /// Las frases de cada fila de «Dispositivos y apps»: la decisión es una función pura y aquí se prueba.
    func testLasFrasesDeLosDispositivos() {
        XCTAssertEqual(
            TextosDeDispositivos.salud(disponible: true, conectado: true, pidiendo: false, denegado: false, pistaDeRevocar: false),
            DichoDeDispositivo(texto: "Sincroniza en segundo plano", marca: .ok)
        )
        XCTAssertEqual(
            TextosDeDispositivos.salud(disponible: false, conectado: true, pidiendo: false, denegado: false, pistaDeRevocar: false).marca,
            nil, "sin HealthKit no hay nada que marcar, aunque el ajuste diga «conectado»"
        )
        XCTAssertEqual(
            TextosDeDispositivos.salud(disponible: true, conectado: false, pidiendo: false, denegado: true, pistaDeRevocar: false).marca,
            .peligro
        )
        XCTAssertEqual(
            TextosDeDispositivos.reloj(soportado: true, denegado: false, activado: true, programadas: 2).texto,
            "2 carreras listas en la app Entrenamiento del reloj"
        )
        XCTAssertEqual(
            TextosDeDispositivos.reloj(soportado: true, denegado: false, activado: true, programadas: 1).texto,
            "1 carrera lista en la app Entrenamiento del reloj"
        )
        XCTAssertNil(TextosDeDispositivos.reloj(soportado: true, denegado: false, activado: false, programadas: nil).marca)
        XCTAssertEqual(TextosDeDispositivos.coros(sincronizando: true, conectado: true), "Sincronizando tus entrenos…")
        XCTAssertEqual(TextosDeDispositivos.polar(conectado: true), "Sincroniza tus entrenos automáticamente")
    }

    /// El ciclo de vida manda sobre el estado crudo de Stripe: una pausa sigue «activa» en Stripe y no puede leerse «Activa».
    func testElCicloDeVidaMandaSobreElEstadoDeStripe() {
        let activa = sub("active")
        XCTAssertEqual(EstadoDeSuscripcion.resumen(info: activa, lifecycle: ciclo("pausado", vuelve: "2026-10-28")).texto, "En pausa")
        XCTAssertEqual(EstadoDeSuscripcion.resumen(info: activa, lifecycle: ciclo("baja", baja: "2026-11-12")).texto, "Baja programada")
        XCTAssertEqual(EstadoDeSuscripcion.resumen(info: activa, lifecycle: ciclo("activo")).texto, "Activa")
        XCTAssertEqual(EstadoDeSuscripcion.resumen(info: sub("past_due"), lifecycle: nil).texto, "Pago pendiente")
    }

    /// La regla del VO₂: «no se inventa una flecha» y el signo de menos es el matemático.
    func testElCambioDelVo2NoInventaUnaFlecha() {
        XCTAssertNil(Vo2Texto.cambio(ultimo: 55, baseline: nil))
        XCTAssertEqual(Vo2Texto.cambio(ultimo: 55.05, baseline: 55)?.texto, "En tu media de 3 meses")
        XCTAssertEqual(Vo2Texto.cambio(ultimo: 55.7, baseline: 55)?.mejora, true)
        XCTAssertTrue(Vo2Texto.cambio(ultimo: 54.0, baseline: 55)?.texto.hasPrefix("\u{2212}") == true)
    }
}

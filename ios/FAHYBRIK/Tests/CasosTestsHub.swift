#if DEBUG
import SwiftUI

// LOS CASOS DEL HUB DE TESTS — fixtures de las `#Preview` y de la galería de capturas. NO son datos de
// producción: son la batería de un atleta inventado, montada para que cada estado de la pantalla se pueda
// MIRAR sin red (CONTRATO-UI §8: una pantalla se mira, no se supone).
//
// Cubren lo que el §6.3 llama el caso de diseño (el atleta recién dado de alta, sin nada) y el que lleva
// tiempo, más los estados intermedios que más castigan la pantalla: un test que corrió y no tiene número,
// una batería de tres marcas, un salto que toca hoy, las zonas sin llegar.

enum CasosTestsHub {

    /// El día de los casos: fijo, para que «Hoy» y las fechas salgan igual en cada captura.
    static let hoy = "2026-08-13"

    static func entrada(
        estado: BatteryStatus? = nil,
        zonas: [ZoneModalityProfile] = [],
        zonasCargadas: Bool = true,
        historiales: [String: [BenchmarkSeries]] = [:],
        cargando: Bool = false,
        fallo: Bool = false,
        preparando: String? = nil,
        falloAlPreparar: String? = nil
    ) -> EntradaTestsHub {
        EntradaTestsHub(
            cargando: cargando, fallo: fallo, estado: estado, zonas: zonas, zonasCargadas: zonasCargadas,
            historiales: historiales, preparando: preparando, falloAlPreparar: falloAlPreparar,
            haySesion: true, hoy: hoy
        )
    }

    // MARK: Los tests

    private static func test(
        _ slug: String, _ nombre: String, id: String, dia: String,
        estado: String = "scheduled", capturado: Bool = false, pendiente: Bool = false,
        resultado: String? = nil, salto: Bool = false, informe: CmjReportDTO? = nil
    ) -> CalibrationTestStatus {
        CalibrationTestStatus(
            calibrationSlug: slug, label: nombre, assignmentId: id, scheduledFor: dia, sessionStatus: estado,
            resultCaptured: capturado, resultPending: pendiente, resultLabel: resultado,
            capture: salto ? "jump_video" : nil, brief: salto ? briefing : nil,
            jumpProfile: nil, jumpReport: informe
        )
    }

    static let cincoK = test("tt_5k", "5K control", id: "501", dia: "2026-08-04", estado: "completed", capturado: true, resultado: "22:14")
    static let bateria1RM = test("one_rm_battery", "Batería 1RM", id: "502", dia: "2026-08-11", estado: "completed", pendiente: true)
    static let remo2K = test("tt_2k_row", "Remo 2K", id: "503", dia: "2026-08-20")
    static let remo2KHoy = test("tt_2k_row", "Remo 2K", id: "503", dia: hoy)
    static let salto = test("cmj", "Test de salto", id: "504", dia: hoy, salto: true)
    static let saltoHecho = test("cmj", "Test de salto", id: "504", dia: "2026-08-06", estado: "completed", capturado: true, salto: true, informe: informeCompleto)
    static let halfSim = test("hyrox_half_sim", "HYROX half-sim", id: "505", dia: "2026-08-22")

    static let briefing = JumpBriefDTO(
        title: "Test de salto",
        what: "Tres saltos verticales sin carga y, si traes la barra, tres con ella. Se graba de perfil y la app mide la altura.",
        durationLabel: "8 min",
        needs: [
            JumpNeedDTO(id: "phone", title: "Un trípode o un apoyo", detail: "El teléfono tiene que quedar quieto."),
            JumpNeedDTO(id: "load", title: "Una barra de 15 kg", detail: "Para la serie con carga."),
        ],
        sequence: [
            JumpBriefStepDTO(n: 1, title: "Calienta", detail: "Cinco minutos suaves y dos saltos al 70 %."),
            JumpBriefStepDTO(n: 2, title: "Tres saltos sin carga", detail: "Con 45 segundos de descanso entre cada uno."),
            JumpBriefStepDTO(n: 3, title: "Tres saltos con carga", detail: "Con la barra sobre los hombros."),
        ],
        jumpCues: ["Manos en la cadera.", "Baja rápido y sube con toda la intención."],
        phone: ["De perfil, a un metro y medio.", "Te tiene que verse de cuerpo entero."],
        dayCard: "Trae un apoyo para el teléfono y una barra de 15 kg."
    )

    // MARK: Las baterías

    static func bateria(_ tests: [CalibrationTestStatus], hechos: Int, peso: Double? = 76) -> BatteryStatus {
        BatteryStatus(total: tests.count, completed: hechos, tests: tests, athleteWeightKg: peso)
    }

    /// Recién dado de alta: el coach aún no ha publicado nada.
    static let sinBateria = BatteryStatus.empty
    /// El que lleva tiempo: uno hecho, uno sin número, un salto que toca hoy y uno futuro.
    static let aMedias = bateria([cincoK, bateria1RM, salto, halfSim], hechos: 1)
    /// Cuatro de cuatro.
    static let completa = bateria([cincoK, saltoHecho, remo2K.hecho(resultado: "7:02"), halfSim.hecho(resultado: "34:12")], hechos: 4)
    /// Solo lo programado, sin nada corrido.
    static let soloProgramada = bateria([remo2K, halfSim], hechos: 0)
    /// Toca hoy uno normal.
    static let tocaHoy = bateria([cincoK, remo2KHoy, halfSim], hechos: 1)

    // MARK: Zonas y marcas

    static let zonasConUmbral = [
        zona("run", "Correr", "/km", umbral: 235, fecha: "2026-08-04T09:00:00Z"),
        zona("row", "Remo", "/500m", umbral: 108, fecha: "2026-06-21T09:00:00Z"),
    ]

    private static func zona(_ id: String, _ nombre: String, _ unidad: String, umbral: Double?, fecha: String?) -> ZoneModalityProfile {
        ZoneModalityProfile(
            modality: id, modalityLabel: nombre, paceUnit: unidad == "/km" ? "per_km" : "per_500m", paceUnitLabel: unidad,
            thresholdS: umbral, sourceTestSlug: nil, version: 1, recordedAt: fecha, zones: []
        )
    }

    static func serie(_ slug: String, _ etiqueta: String, _ unidad: String, _ valores: [Double]) -> BenchmarkSeries {
        BenchmarkSeries(
            exerciseSlug: slug, label: etiqueta, unit: unidad,
            results: valores.enumerated().map { BenchmarkPoint(value: $1, recordedAt: "2026-0\($0 + 3)-10T09:00:00Z") }
        )
    }

    static let historiales: [String: [BenchmarkSeries]] = [
        "tt_5k": [serie("run_5k", "5K", "seconds", [1402, 1372, 1346, 1334])],
        "one_rm_battery": [
            serie("back_squat_1rm", "Sentadilla", "kg", [172.5, 180, 186.5]),
            serie("deadlift_1rm", "Peso muerto", "kg", [225, 240, 245]),
        ],
    ]

    // MARK: El informe de salto

    static let informeCompleto = CmjReportDTO(
        title: "Perfil de salto", dateLabel: "2026-08-06", unloadedCm: 47.33, loadedCm: 39.38, heightLevel: 5,
        heightLabel: "Muy alta", loadedHeightLevel: 3, lri: 0.85, lriLabel: "Correcta", lriLevel: 3,
        dropAbsCm: 7.95, dropRel: 0.168, loadRel: 0.197, loadKg: 15, bodyMassKg: 76,
        lectura: "Capacidad explosiva muy alta. La altura cae un 17 % con 15 kg: respuesta a la carga correcta.",
        heightScale: bandasDeAltura(activa: 5), lriScale: bandasDeLri(activa: 3),
        attempts: [
            CmjAttemptDTO(kind: "cmj", heightCm: 46.1, kept: false, quality: "ok"),
            CmjAttemptDTO(kind: "cmj", heightCm: 47.33, kept: true, quality: "ok"),
            CmjAttemptDTO(kind: "loaded_cmj", heightCm: 39.38, kept: true, quality: "ok"),
        ]
    )

    static let informeSoloCmj = CmjReportDTO(
        title: "Perfil de salto", dateLabel: "2026-07-02", unloadedCm: 34.2, loadedCm: nil, heightLevel: 2,
        heightLabel: "Baja", loadedHeightLevel: nil, lri: nil, lriLabel: nil, lriLevel: nil, dropAbsCm: nil,
        dropRel: nil, loadRel: nil, loadKg: nil, bodyMassKg: nil,
        lectura: "Capacidad explosiva baja. Sin serie con carga no hay respuesta a la carga que leer.",
        heightScale: bandasDeAltura(activa: 2), lriScale: [], attempts: []
    )

    /// El informe corto que se arma al guardar, antes de que el servidor mande el completo.
    static let informeCorto = CmjReportDTO.thin(
        title: "Perfil de salto", dateLabel: "Hoy",
        profile: JumpProfileDTO(unloadedCm: 41, loadedCm: 35, lri: 0.9, lriLabel: "Correcta", heightLevel: 4, lriLevel: 3),
        bodyMassKg: 76
    )

    private static func bandasDeAltura(activa: Int) -> [CmjScaleBandDTO] {
        [(1, "< 30 cm", "Muy baja"), (2, "30 – 35 cm", "Baja"), (3, "35 – 40 cm", "Media"), (4, "40 – 45 cm", "Alta"), (5, "> 45 cm", "Muy alta")]
            .map { CmjScaleBandDTO(level: $0.0, rangeLabel: $0.1, label: $0.2, active: $0.0 == activa) }
    }

    private static func bandasDeLri(activa: Int) -> [CmjScaleBandDTO] {
        [(5, "≤ 0,45", "Excelente"), (4, "0,45 – 0,70", "Muy buena"), (3, "0,70 – 0,90", "Correcta"), (2, "0,90 – 1,20", "Baja"), (1, "> 1,20", "Muy baja")]
            .map { CmjScaleBandDTO(level: $0.0, rangeLabel: $0.1, label: $0.2, active: $0.0 == activa) }
    }
}

private extension CalibrationTestStatus {
    /// El mismo test, ya con su número.
    func hecho(resultado: String) -> CalibrationTestStatus {
        CalibrationTestStatus(
            calibrationSlug: calibrationSlug, label: label, assignmentId: assignmentId, scheduledFor: scheduledFor,
            sessionStatus: "completed", resultCaptured: true, resultPending: false, resultLabel: resultado,
            capture: capture, brief: brief, jumpProfile: jumpProfile, jumpReport: jumpReport
        )
    }
}

extension AccionesTestsHub {
    /// Las acciones de una vista que solo se mira: no hacen nada.
    static let sinAcciones = AccionesTestsHub(alReintentar: {}, alRefrescar: {}, alProbarPorMiCuenta: {}, alEjecutar: { _, _ in })
}

private func hubDeEjemplo(_ entrada: EntradaTestsHub, club: ClubTheme? = nil) -> some View {
    let _ = ClubThemeStore.update(club)
    return TestsHubPantalla(lectura: .desde(entrada), acciones: .sinAcciones, alCerrar: {})
}

#Preview("Hub · a medias · fábrica") {
    hubDeEjemplo(CasosTestsHub.entrada(estado: CasosTestsHub.aMedias, zonas: CasosTestsHub.zonasConUmbral, historiales: CasosTestsHub.historiales))
}
#Preview("Hub · a medias · club azul") {
    hubDeEjemplo(CasosTestsHub.entrada(estado: CasosTestsHub.aMedias, zonas: CasosTestsHub.zonasConUmbral, historiales: CasosTestsHub.historiales), club: .pruebaAzul)
}
#Preview("Hub · vacío") { hubDeEjemplo(CasosTestsHub.entrada(estado: CasosTestsHub.sinBateria)) }
#Preview("Hub · cargando") { hubDeEjemplo(CasosTestsHub.entrada(cargando: true)) }
#Preview("Hub · error") { hubDeEjemplo(CasosTestsHub.entrada(fallo: true)) }
#Preview("Informe de salto") { JumpReportView(report: CasosTestsHub.informeCompleto, onClose: {}) }
#Preview("Briefing de salto") { JumpBriefView(brief: CasosTestsHub.briefing, onReady: {}, onClose: {}) }
#endif

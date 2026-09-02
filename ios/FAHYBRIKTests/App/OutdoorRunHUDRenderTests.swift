import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA VISTA DE CORRER EN VIVO, RENDERIZADA DE VERDAD — sus dos estados de diseño.
//
// No es una prueba de píxeles: es la prueba de que la pantalla se SOSTIENE en los
// dos estados que el §6.3 llama «el caso de diseño», y de paso el sitio de donde
// salen las capturas.
//
//   con pulso        — hay ancla de FC y hay lectura: el lienzo se tiñe de tu zona
//                      y el sujeto es el pulso en el color de esa zona (§10.1).
//   sin ancla de FC  — el servidor no mandó zonas y no hay reloj: NO hay tinte, no
//                      hay zona, y el sujeto degrada a la siguiente verdad que sí
//                      existe. Ni un guion ni una barra vacía (§7).
//
// El segundo NO es la versión rota del primero: es la misma pantalla diciendo la
// verdad, y por eso conserva banda, numeral y acción intactos. Que renderice sin
// caerse es justo lo que hay que fijar — el 60 % de los problemas de la app viven
// en el estado sin datos, que es lo que ve un atleta nuevo.
//
// El lienzo es el del iPhone 17 Pro dentro del área segura (402 × 781), que es el
// que usa la aritmética del ancla del §10.3.

final class OutdoorRunHUDRenderTests: XCTestCase {

    /// El alto útil del iPhone 17 Pro: 874 pt de pantalla menos 59/34 de área
    /// segura. Es el lienzo sobre el que está cuadrada la banda del sujeto.
    private static let lienzo = CGSize(width: 402, height: 781)

    /// Dónde dejar las capturas. Se pide por entorno para que la suite normal no
    /// escriba nada en disco; sin la variable, esto sigue siendo una prueba de que
    /// la vista renderiza en sus dos estados.
    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    // MARK: - Los dos estados

    @MainActor
    func testConPulsoElLienzoSeTineDeTuZona() {
        let sesion = sesionDeRodaje()
        sesion.liveHRBpm = 145        // Z2 con el umbral de 170 → estás donde toca
        let imagen = render(OutdoorRunHUDView(session: sesion, hrZones: Self.zonas(), alSalir: {}),
                            nombre: "correr-vivo-con-pulso")
        XCTAssertNotNil(imagen, "La vista de correr en vivo tiene que renderizar con pulso")
    }

    @MainActor
    func testSinAnclaDeFCNoHayTinteYLaPantallaSigueEnPie() {
        // Sin perfil de zonas del servidor NO hay ancla, y sin ancla no hay zona ni
        // tinte: el color es un dato y no se inventa (§10.1 + §7). Es el caso del
        // atleta recién dado de alta, que es el caso de diseño (§6.3).
        let sesion = sesionDeRodaje()
        sesion.liveHRBpm = nil
        let imagen = render(OutdoorRunHUDView(session: sesion, hrZones: nil, alSalir: {}),
                            nombre: "correr-vivo-sin-ancla-fc")
        XCTAssertNotNil(imagen, "Sin ancla de FC la pantalla no se rompe: dice la verdad")
    }

    // MARK: - Fixtures

    /// Un rodaje continuo de 40:00 con objetivo de zona — el mismo caso que el
    /// doble usa para dirigir esta pantalla.
    private func sesionDeRodaje() -> WorkoutSession {
        let tramo = WorkoutSegment(order: 1,
                                   title: "Rodaje 40:00",
                                   kind: .running,
                                   targetDurationSeconds: 2400,
                                   targetZone: .z2,
                                   blockTitle: "Carrera",
                                   blockPosition: 1)
        let plan = WorkoutPlan(id: UUID(), name: "Rodaje", format: .steady,
                               estimatedDurationSeconds: 2400, blockContext: "Carrera",
                               zoneTargets: [], equipment: [], segments: [tramo],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        return WorkoutSession(plan: plan)
    }

    /// Las bandas tal y como las manda el servidor, sobre un umbral de 170 ppm.
    /// `estimated: true` a propósito: es lo que tiene casi todo el mundo, y la
    /// pantalla debe declararlo en vez de dejarlo pasar por medido.
    private static func zonas() -> HRZoneProfile {
        HRZoneProfile(
            lthrBpm: 170,
            estimated: true,
            source: "from_age",
            sourceLabel: "Zonas estimadas por tu edad",
            confidence: "estimated",
            zones: [
                HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
                HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
                HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
                HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
                HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
            ]
        )
    }

    // MARK: - Render

    @MainActor
    private func render(_ vista: some View, nombre: String) -> UIImage? {
        let renderer = ImageRenderer(
            content: vista
                .frame(width: Self.lienzo.width, height: Self.lienzo.height)
                .environment(\.colorScheme, .dark)
        )
        renderer.scale = 3
        guard let imagen = renderer.uiImage else { return nil }

        // Siempre al informe de la ejecución; a disco solo si te lo piden.
        if let png = imagen.pngData() {
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = nombre
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
            }
        }
        return imagen
    }
}

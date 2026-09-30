import Foundation
import Observation

// LO QUE EL HUB DE TESTS CARGA — la bateria, las zonas y las curvas de marcas de cada test.
//
// Sale de la vista para que ésta solo pinte: aquí viven las tres peticiones y cómo se agrupan, y la
// decisión de qué se enseña con ello vive en `LecturaTestsHub`. Tolerante a propósito: un historial
// caído solo esconde las curvas, jamás el hub.

@Observable
@MainActor
final class CargaTestsHub {
    private(set) var estado: BatteryStatus?
    private(set) var zonas: [ZoneModalityProfile] = []
    private(set) var zonasCargadas = false
    /// calibrationSlug → series de marcas de ESE test. Se agrupan desde UNA sola petición de todo el
    /// historial, a través del contrato de resultados de cada test (`store_results[].slug` = el slug
    /// del BENCHMARK que indexa el historial; el slug de calibración no devolvería nada). Una clave que
    /// falta simplemente esconde la curva de ese test.
    private(set) var historiales: [String: [BenchmarkSeries]] = [:]
    private(set) var cargando = true
    private(set) var fallo = false

    func cargar(bearer: String?) async {
        guard let bearer else {
            cargando = false
            fallo = true
            return
        }
        async let zonasPeticion = ZonesService.fetch(bearer: bearer)
        async let historialPeticion = TestBatteryService.fetchBenchmarkHistory(bearer: bearer)
        do {
            let bateria = try await TestBatteryService.fetchStatus(bearer: bearer)
            estado = bateria
            fallo = false
            historiales = await Self.agrupa(bateria, historial: (try? await historialPeticion) ?? [], bearer: bearer)
        } catch {
            if estado == nil { fallo = true }
        }
        zonas = (try? await zonasPeticion)?.modalities ?? zonas
        zonasCargadas = true
        cargando = false
    }

    /// Cada test con las series de marcas que promete su contrato, en el orden del propio contrato
    /// (la marca principal primero).
    private static func agrupa(_ bateria: BatteryStatus, historial: [BenchmarkSeries], bearer: String) async -> [String: [BenchmarkSeries]] {
        var slugsPorTest: [String: [String]] = [:]
        await withTaskGroup(of: (String, [String]).self) { grupo in
            for test in bateria.tests {
                grupo.addTask { (test.calibrationSlug, await slugsDeMarcas(de: test, bearer: bearer)) }
            }
            for await (calibracion, slugs) in grupo {
                // Se suman: varias ocurrencias del mismo test comparten contrato.
                slugsPorTest[calibracion, default: []].append(contentsOf: slugs)
            }
        }
        let seriePorSlug = Dictionary(historial.map { ($0.exerciseSlug, $0) }, uniquingKeysWith: { _, ultima in ultima })
        return slugsPorTest.mapValues { slugs in
            var vistos = Set<String>()
            return slugs.compactMap { slug in
                guard vistos.insert(slug).inserted else { return nil }
                return seriePorSlug[slug]
            }
        }
    }

    /// Los slugs de marca que promete un test (su contrato `store_results`), del detalle de la
    /// asignación: primero la caché y luego la red; vacío (sin curva) si no hay ninguna. Nunca inventados.
    private nonisolated static func slugsDeMarcas(de test: CalibrationTestStatus, bearer: String) async -> [String] {
        if let enCache = AssignmentDetailCache.load(test.assignmentId) {
            return enCache.storeResults.map(\.slug)
        }
        guard let detalle = try? await PlanService.fetchAssignmentDetail(test.assignmentId, bearer: bearer) else {
            return []
        }
        AssignmentDetailCache.save(detalle)
        return detalle.storeResults.map(\.slug)
    }
}

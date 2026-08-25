import Foundation

/// Cómo se LEE la tanda en vivo. Espejo de `shared/domain/tanda-strip.ts`.
enum TandaStrip {
    static let todasHasta = 4
    static let ventana = 3

    enum Estado: String, Equatable {
        case hecha
        case actual
        case futura
        case saltada
    }

    struct Paso: Equatable {
        let n: Int
        let estado: Estado
    }

    struct Strip: Equatable {
        let pasos: [Paso]
        let total: Int

        var seLee: String { pasos.map { String($0.n) }.joined(separator: " / ") }
        var esVentana: Bool { pasos.count < total }
    }

    static func indices(total: Int, actual: Int) -> [Int] {
        guard total > 0 else { return [] }
        let cursor = min(max(0, actual), max(0, total - 1))
        if total <= todasHasta { return Array(0..<total) }
        let ancho = min(ventana, total)
        let inicio = min(max(0, cursor - 1), max(0, total - ancho))
        return Array(inicio..<(inicio + ancho))
    }

    static func strip(total: Int, actual: Int, hechas: Set<Int>, saltadas: Set<Int> = []) -> Strip {
        let pasos = indices(total: total, actual: actual).map { i -> Paso in
            let estado: Estado
            if saltadas.contains(i) { estado = .saltada }
            else if hechas.contains(i) { estado = .hecha }
            else if i == actual { estado = .actual }
            else { estado = .futura }
            return Paso(n: i + 1, estado: estado)
        }
        return Strip(pasos: pasos, total: total)
    }

    static func seLee(from series: [SetRecord], actual: Int) -> String {
        strip(from: series, actual: actual).seLee
    }

    static func strip(from series: [SetRecord], actual: Int) -> Strip {
        var hechas = Set<Int>()
        var saltadas = Set<Int>()
        for (i, rec) in series.enumerated() {
            if rec.status == "skipped" { saltadas.insert(i) }
            else if rec.confirmed { hechas.insert(i) }
        }
        return strip(total: series.count, actual: actual, hechas: hechas, saltadas: saltadas)
    }
}

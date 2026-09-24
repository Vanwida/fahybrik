import Foundation

// Un guardado contra nuestra API, contado igual en todos los sitios: 2xx, código
// HTTP (dominio `http`), sin red (`offline`) o el error de Apple con su código. La
// ruta sin query: dice QUÉ se guardaba sin decir nada de lo guardado.

extension DiagnosticsLog {
    func recordSave(_ name: DiagName, path: String, error: Error?, detail: String? = nil) {
        let route = path.split(separator: "?").first.map(String.init) ?? path
        let note = detail.map { "path=\(route) \($0)" } ?? "path=\(route)"
        guard let error else {
            record(.save, name, outcome: .ok, detail: note)
            return
        }
        if case APIError.http(let status, _) = error {
            record(.save, name, outcome: .failed, code: status, domain: "http", detail: note)
        } else if case APIError.offline = error {
            record(.save, name, outcome: .failed, domain: "offline", detail: note)
        } else {
            let ns = error as NSError
            record(.save, name, outcome: .failed, code: ns.code, domain: ns.domain, detail: note)
        }
    }
}

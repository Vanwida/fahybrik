import Foundation

// EL BUZÓN EN DISCO DE LA TRAZA DE LA MUÑECA — la mitad que no habla con nadie.
//
// El caso que da valor a todo esto: el atleta sale a correr con el reloj y deja el
// teléfono en casa. Al terminar no hay nadie a tiro, así que el fichero tiene que
// esperar —horas si hace falta— y salir solo cuando los dos aparatos se reencuentran.
//
// POR QUÉ UN BUZÓN Y NO LLAMAR A `transferFile` Y YA. `WCSession.transferFile` sí
// encola en segundo plano y sigue con la app suspendida, pero SÓLO acepta el encargo
// si la sesión ya está activada. El camino que ya existía para el archivo de sensores
// (`transferSensorCapture`) se traga el envío con un `guard` cuando todavía no lo
// está, sin dejar rastro de que se debía un fichero: eso es exactamente cómo se
// pierde una carrera. Aquí el fichero se escribe en disco ANTES de intentar nada y
// sólo se borra cuando la entrega está confirmada.
//
// DÓNDE SE ESCRIBE. En Application Support, no en el temporal: el sistema puede
// vaciar el temporal cuando le apetezca, y un fichero que espera dos días a que
// vuelva el teléfono no puede vivir ahí. (El camino de sensores sí escribe en el
// temporal — no es mío, pero queda dicho.)
//
// Sin CoreBluetooth ni WatchConnectivity dentro: es disco y nada más, igual que
// `RunAltitudeAnchor` es matemática y nada más. La cola de verdad la mueve
// `WatchTraceOutbox` en el target del reloj; así la garantía que importa —el fichero
// aguanta— se comprueba con pruebas en vez de a ojo en una muñeca.

struct WatchTraceSpool {

    /// Extensión propia: por ella se reconoce lo que hay que reintentar, y no se
    /// confunde con el archivo inercial de sensores que cruza el mismo cable.
    static let fileExtension = "fhtrace"

    let directory: URL

    init(directoryName: String = "pending-traces") {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        directory = base.appendingPathComponent(directoryName, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func url(for localId: String) -> URL {
        directory.appendingPathComponent("\(localId).\(Self.fileExtension)")
    }

    /// Deja la traza en disco y devuelve el cupón con el que el sobre de la ejecución
    /// la reclamará. Nil cuando no hay nada que mandar: una sesión sin sensores no
    /// manda un fichero vacío, ni un fichero que no se pudo escribir se da por bueno.
    ///
    /// Escribir NO es enviar. El envío lo dispara «Listo», igual que el sobre de la
    /// ejecución, para que no pueda quedarse un archivo colgando de una sesión que el
    /// atleta nunca confirmó.
    func stage(traces: [WorkoutTraceDTO], localId: String = UUID().uuidString) -> String? {
        guard !traces.isEmpty else { return nil }
        guard let data = try? WatchWire.encoder.encode(
            WatchTraceFile(localId: localId, traces: traces)
        ) else { return nil }
        guard (try? data.write(to: url(for: localId), options: .atomic)) != nil else { return nil }
        return localId
    }

    /// Los cupones que siguen debiéndose, para reintentarlos.
    func pendingLocalIds() -> [String] {
        let contents = (try? FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        )) ?? []
        return contents
            .filter { $0.pathExtension == Self.fileExtension }
            .map { $0.deletingPathExtension().lastPathComponent }
    }

    func exists(_ localId: String) -> Bool {
        FileManager.default.fileExists(atPath: url(for: localId).path)
    }

    /// El teléfono lo tiene: aquí ya no hace falta. Sólo se llama tras una entrega
    /// confirmada — un fallo deja el fichero donde está para el siguiente reintento.
    func remove(_ localId: String) {
        try? FileManager.default.removeItem(at: url(for: localId))
    }
}

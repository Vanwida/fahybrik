import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// EL ARNÉS DE LAS CAPTURAS DEL VIVO — uno para las cinco familias y la gramática.
// Monta `VivoIphoneView` sobre un motor REAL, deja correr el tiempo (y el guion de
// gestos, por el MISMO camino que el dedo) y vuelca la pantalla entera del iPhone
// en uno o varios instantes. Cada imagen va como adjunto del test (se queda en el
// .xcresult que sube el CI) y, si `FAHYBRIK_CAPTURAS` está en el entorno, a esa
// carpeta. Corre en CI (GitHub Actions), nunca en el Mac de Alex.
//
// Antes eran cuatro copias del mismo volcado (gramática+ergo+correr, WOD, fuerza,
// circuito), cada una con su opción; aquí están todas en `VivoMontaje`.

/// Cómo se monta el vivo para una captura: lo enlazado, la página y lo que el
/// vivo ya sabía al montarse a mitad de sesión. Por defecto, nada enlazado.
struct VivoMontaje {
    var test = false
    var horizontal = false
    var hrLink: DeviceLink = .idle
    var treadmillLink: DeviceLink = .idle
    var gpsActive = false
    var pagina: VivoIdPagina = .vivo
    /// Lo que dirían el GPS y la cinta, sin CoreLocation ni Bluetooth.
    var lectura: VivoLecturaDePrueba? = nil
    /// Lo marcado en el WOD al montar.
    var wod = Vivo.EstadoWod()
    /// Gestos guionizados (segundos desde el montaje).
    var guion: [VivoGestoGuion] = []
    /// Lo declarado en la anotación de fuerza, el foco, el aviso de deshacer.
    var arranque = VivoArranque()
    /// La máquina enlazada: el store del monitor en `.streaming` con esta muestra.
    var monitor: PM5LiveSample? = nil
    /// Las salidas del host en la hoja de terminar y el chevrón de minimizar.
    var salidas = VivoSalidas()
    var minimizar = false
    /// Dobles: la presencia de la pareja.
    var pareja: DoblesLiveStripState = .hidden
    /// La Estructura con las filas que saltan (el host confirma; aquí no hace nada).
    var saltar = false
}

/// Una foto a los `en` segundos de `trasMontar`.
struct VivoFoto {
    let nombre: String
    let en: TimeInterval
}

extension XCTestCase {

    /// Monta el vivo, espera `antesDeEsperar`, llama a `trasMontar` (el motor al
    /// punto del escenario) y toma cada foto a su hora. `asentar`: lo que se deja
    /// pintar tras el último layout antes de volcar.
    @MainActor
    func fotografiarVivo(_ s: WorkoutSession, _ m: VivoMontaje, fotos: [VivoFoto], antesDeEsperar: TimeInterval = 0.4,
                         asentar: TimeInterval = 0.2, trasMontar: (WorkoutSession) -> Void = { _ in }) {
        let pm5 = PM5ConnectionStore.shared
        let antes = (pm5.connectionState, pm5.live)
        if let monitor = m.monitor {
            pm5.connectionState = .streaming
            pm5.live = monitor
        }
        let vista = VivoIphoneView(session: s, hrZones: s.hrZones, pm5: pm5,
                                   hrLink: m.hrLink, treadmillLink: m.treadmillLink, gpsActive: m.gpsActive, isBenchmark: m.test,
                                   alAccionDelHost: {}, alConectividad: {}, alTerminarYGuardar: {},
                                   alMinimizar: m.minimizar ? {} : nil, salidas: m.salidas,
                                   alSaltarTramo: m.saltar ? { _ in } : nil, pareja: m.pareja,
                                   paginaInicial: m.pagina, wodInicial: m.wod, guion: m.guion, arranque: m.arranque,
                                   lecturaDePrueba: m.lectura)
            .environment(\.colorScheme, .dark)
        let host = UIHostingController(rootView: vista)
        // La escena del simulador sigue en vertical: sus zonas seguras (62 arriba)
        // no son las de un iPhone tumbado. En horizontal, sin ellas (como el contrato).
        if m.horizontal { host.safeAreaRegions = [] }
        let base = UIScreen.main.bounds
        let bounds = m.horizontal ? CGRect(x: 0, y: 0, width: base.height, height: base.width) : base
        let escena = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = escena.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: bounds)
        window.frame = bounds
        window.overrideUserInterfaceStyle = .dark
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer {
            s.stop(); window.isHidden = true; window.rootViewController = nil
            pm5.connectionState = antes.0; pm5.live = antes.1
        }
        host.view.frame = bounds
        host.view.layoutIfNeeded()
        if antesDeEsperar > 0 { RunLoop.current.run(until: Date().addingTimeInterval(antesDeEsperar)) }
        trasMontar(s)
        let destino = ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
        let inicio = Date()
        for f in fotos {
            RunLoop.current.run(until: inicio.addingTimeInterval(f.en))
            host.view.layoutIfNeeded()
            RunLoop.current.run(until: Date().addingTimeInterval(asentar))
            let fmt = UIGraphicsImageRendererFormat(); fmt.scale = 3
            let img = UIGraphicsImageRenderer(bounds: bounds, format: fmt).image { _ in
                if !host.view.drawHierarchy(in: bounds, afterScreenUpdates: true) {
                    host.view.layer.render(in: UIGraphicsGetCurrentContext()!)
                }
            }
            guard let png = img.pngData() else { XCTFail("sin png \(f.nombre)"); continue }
            let a = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            a.name = f.nombre; a.lifetime = .keepAlways; add(a)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(f.nombre).png"))
            }
        }
    }
}

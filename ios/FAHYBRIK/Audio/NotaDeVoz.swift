import SwiftUI
import AVFoundation

// LA NOTA DE VOZ, REPRODUCIDA — el motor, sin la burbuja que lo estrenó.
//
// Nació dentro del chat y vive aquí porque no es del chat: es de la VOZ del
// coach, y esa voz llega ya por dos sitios (una burbuja del hilo y un comunicado
// publicado). Tenerlo en dos ficheros sería tenerlo en dos versiones a los dos
// meses, y la que se quedara atrás sería justo la que menos se mira.
//
// Lo que NO está aquí: cómo se ve. La burbuja del chat y la fila de un
// comunicado se dibujan distinto a propósito (una es un mensaje, la otra es una
// pieza de un briefing); lo que comparten es esto — cargar los bytes, sonar,
// llevar la cuenta y apagar a quien estuviera sonando antes.
//
// Los bytes remotos se piden por la caché autenticada de media
// (`ChatMediaLoader`): todo lo que sirve el servidor detrás del bearer pasa por
// ahí, y montar una segunda caché sólo para esto duplicaría descargas del mismo
// fichero.

// MARK: - De dónde salen los bytes

/// Un audio que se puede reproducir: el que ya está en el disco (lo acabas de
/// grabar) o el que hay que ir a buscar autenticado.
struct FuenteDeVoz: Equatable {
    var local: URL?
    var remota: String?

    init(local: URL? = nil, remota: String? = nil) {
        self.local = local
        self.remota = remota
    }

    var tieneAlgo: Bool { local != nil || remota != nil }

    /// Dónde se va a pedir de verdad. `remota` puede llegar como RUTA del
    /// servidor (el audio de un comunicado) o ya absoluta (un adjunto del chat):
    /// aquí se resuelve una vez, y ninguna pantalla tiene que saber cuál le tocó.
    var remotaAbsoluta: String? { APIBase.absoluta(remota) }

    /// Clave estable de este audio. Es lo que siembra su onda: la misma nota
    /// dibuja siempre las mismas barras, sin rebarajarse en cada repintado.
    ///
    /// Se siembra con lo que llegó y NO con la absoluta: cambiar de entorno
    /// mueve la base, y la onda de la misma nota no puede cambiar por eso.
    var semilla: String { remota ?? local?.absoluteString ?? "voz" }
}

// MARK: - Quién suena

/// Sólo una nota suena a la vez: arrancar una pausa a la que estuviera sonando.
/// Dos voces a la vez no es un caso de uso, es un fallo que se oye.
@MainActor
final class VozEnCurso {
    static let shared = VozEnCurso()
    private weak var activo: ReproductorDeVoz?

    func tomaLaVoz(_ reproductor: ReproductorDeVoz) {
        if activo !== reproductor { activo?.pausar() }
        activo = reproductor
    }

    func sueltaLaVoz(_ reproductor: ReproductorDeVoz) {
        if activo === reproductor { activo = nil }
    }
}

// MARK: - El reproductor

/// Carga, suena y lleva la cuenta. Uno por pieza pintada.
@MainActor
final class ReproductorDeVoz: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published var sonando = false
    @Published var avance: Double = 0
    /// La duración REAL del fichero, en cuanto se conoce. Manda sobre la que
    /// venía en los metadatos: si difieren, la que suena es ésta.
    @Published var duracionReal: Double?
    @Published var cargando = false
    @Published var fallo = false

    private var player: AVAudioPlayer?
    private var reloj: Timer?

    func alternar(fuente: FuenteDeVoz, bearer: String?) {
        if sonando { pausar(); return }
        if let player {
            reanudar(player)
            return
        }
        Task { await cargarYSonar(fuente: fuente, bearer: bearer) }
    }

    private func cargarYSonar(fuente: FuenteDeVoz, bearer: String?) async {
        cargando = true
        fallo = false
        do {
            let local: URL
            if let enDisco = fuente.local {
                local = enDisco
            } else if let remota = fuente.remotaAbsoluta, let bearer {
                local = try await ChatMediaLoader.shared.localFile(remoteURL: remota, bearer: bearer)
            } else {
                throw ChatMediaError.noBearer
            }
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(contentsOf: local)
            p.delegate = self
            p.prepareToPlay()
            player = p
            duracionReal = p.duration
            cargando = false
            reanudar(p)
        } catch {
            cargando = false
            fallo = true
        }
    }

    private func reanudar(_ p: AVAudioPlayer) {
        VozEnCurso.shared.tomaLaVoz(self)
        p.play()
        sonando = true
        arrancarReloj()
        Haptics.light()
    }

    func pausar() {
        player?.pause()
        sonando = false
        reloj?.invalidate()
        reloj = nil
    }

    private func arrancarReloj() {
        reloj?.invalidate()
        let t = Timer(timeInterval: 0.03, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let p = self.player else { return }
                self.avance = p.duration > 0 ? p.currentTime / p.duration : 0
            }
        }
        RunLoop.main.add(t, forMode: .common)
        reloj = t
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.sonando = false
            self.avance = 0
            self.reloj?.invalidate()
            self.reloj = nil
            VozEnCurso.shared.sueltaLaVoz(self)
        }
    }
}

// MARK: - La onda

/// Las barras de una nota. No hay onda real en el servidor, así que se derivan de
/// la IDENTIDAD del audio: la misma nota dibuja siempre lo mismo, y dos notas
/// distintas no se dibujan iguales.
enum OndaDeVoz {
    static func barras(semilla: String, cuantas: Int = 30) -> [CGFloat] {
        var rng = SemillaEstable(texto: semilla)
        return (0..<cuantas).map { _ in CGFloat.random(in: 0.30...1.0, using: &rng) }
    }
}

/// SplitMix64 minúsculo, para que la onda sea la misma en cada repintado.
struct SemillaEstable: RandomNumberGenerator {
    private var estado: UInt64

    init(texto: String) {
        var h: UInt64 = 1469598103934665603
        for b in texto.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        estado = h == 0 ? 0x9E3779B97F4A7C15 : h
    }

    mutating func next() -> UInt64 {
        estado &+= 0x9E3779B97F4A7C15
        var z = estado
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}

/// La onda que se rellena conforme suena.
///
/// Las barras se REPARTEN el ancho que les den en vez de llevar un hueco fijo:
/// así la misma onda llena una burbuja estrecha del chat y la fila ancha de un
/// comunicado, en vez de desbordar una y quedarse corta en la otra.
struct OndaConProgreso: View {
    let barras: [CGFloat]
    let avance: Double
    let sonada: Color
    let porSonar: Color

    var body: some View {
        GeometryReader { geo in
            HStack(alignment: .center, spacing: 0) {
                ForEach(Array(barras.enumerated()), id: \.offset) { idx, h in
                    let frac = barras.isEmpty ? 0 : Double(idx) / Double(barras.count)
                    Capsule()
                        .fill(frac <= avance ? sonada : porSonar)
                        .frame(width: 2)
                        .frame(height: max(2, h * geo.size.height))
                    if idx < barras.count - 1 {
                        Spacer(minLength: 1)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }
}

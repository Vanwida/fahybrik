import AVFoundation
import Foundation

// LA VOZ DEL RELOJ (P5): las frases del director (`Vivo.Emision.voz`: inicio de paso, fin de serie, km, sesión
// completada) dichas en español desde la propia muñeca, a los auriculares. Los avisos de ritmo no llevan voz:
// son solo vibración.
//
// SOLO CON SALIDA EXTERNA. Si el audio del reloj va a su altavoz (`AVAudioSession.currentRoute` sin auriculares
// ni nada enlazado), no se habla: un reloj que grita en el metro no ayuda a nadie. Se mira al empezar la sesión
// y en cada cambio de ruta (`routeChangeNotification`), nunca por temporizador.
//
// UNA VOZ, NO DOS. Mientras la muñeca puede hablar se lo dice al móvil (`CommandKind.vozMuneca`, con el enlace
// puesto) y el móvil calla su entrenador de voz. Si el enlace se va, el móvil recupera la suya: la muñeca no
// sabe en qué paso está sin las tramas. Respeta el ajuste «Avisos de voz» del atleta: en espejo lo trae el
// cursor (`MirrorCursor.vozActiva`); en solitario no hay móvil que lo diga y la voz va encendida, que es su
// valor de fábrica.
//
// La sesión de audio es la de siempre (`WorkoutAudio`, el único dueño de la categoría): `.playback`,
// `.voicePrompt` y `.duckOthers` mientras se habla, y se suelta al acabar.

@MainActor
final class WatchVoz: NSObject, AVSpeechSynthesizerDelegate {

    static let shared = WatchVoz()

    /// ¿La muñeca habla ahora? Salida externa y el atleta lo quiere. Lo que se anuncia al móvil.
    private(set) var habla = false
    /// El ajuste de voz del atleta (lo trae el cursor del móvil; en solitario, encendido).
    var atletaQuiereVoz = true {
        didSet { if oldValue != atletaQuiereVoz { actualizarHabla() } }
    }
    /// Quien se entera de que la muñeca empieza o deja de hablar (el dueño de la sesión, que se lo dice al móvil).
    var alCambiarHabla: ((Bool) -> Void)?

    /// Lo que corta lo que se esté diciendo: el GO, la recuperación y el final no esperan a una frase vieja.
    private static let interrumpen: Set<Vivo.EventoVivo> = [.go, .recupera, .sesion]

    private let sintetizador = AVSpeechSynthesizer()
    private let voz = AVSpeechSynthesisVoice(language: CoachVoice.languageCode) ?? AVSpeechSynthesisVoice(language: "es")
    /// ¿Va el audio a una salida externa? `nil` = aún no se ha mirado desde el último cambio de ruta.
    private var salidaExterna: Bool?
    /// Frases entregadas al sintetizador y aún sin acabar (ni cancelar): con cero, se suelta la sesión de audio.
    private var enCurso = 0
    private var observadorDeRuta: NSObjectProtocol?

    private override init() {
        super.init()
        sintetizador.delegate = self
        observadorDeRuta = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
        ) { [weak self] nota in
            // Solo llegan o se van auriculares: los cambios de categoría los provoca el propio `sondear` y no dicen nada.
            let motivo = (nota.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt).flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
            guard motivo == .newDeviceAvailable || motivo == .oldDeviceUnavailable else { return }
            Task { @MainActor in self?.sondear() }
        }
    }

    // MARK: - Hablar

    /// Dice la frase de una emisión del director, si la muñeca puede hablar. Sin frase o sin auriculares, calla.
    func decir(_ emision: Vivo.Emision) {
        guard let texto = emision.voz, !texto.isEmpty, atletaQuiereVoz else { return }
        if salidaExterna == nil { sondear() }
        guard salidaExterna == true else { return }
        if emision.eventos.contains(where: { Self.interrumpen.contains($0) }) { sintetizador.stopSpeaking(at: .immediate) }
        WorkoutAudio.shared.setVoiceActive(true)
        enCurso += 1
        let frase = AVSpeechUtterance(string: texto)
        frase.voice = voz
        frase.rate = CoachVoice.rate
        frase.pitchMultiplier = CoachVoice.pitchMultiplier
        frase.postUtteranceDelay = CoachVoice.postUtteranceDelay
        sintetizador.speak(frase)
    }

    // MARK: - Salida

    /// Mira a dónde va el audio AHORA. Activa la sesión un instante (sin ella la ruta que se lee puede no ser la de
    /// los auriculares) salvo que ya se esté hablando, y ahí no la suelta.
    func sondear() {
        let hablando = enCurso > 0
        if !hablando { WorkoutAudio.shared.setVoiceActive(true) }
        let salidas = AVAudioSession.sharedInstance().currentRoute.outputs.map(\.portType)
        salidaExterna = Self.esExterna(salidas)
        if !hablando { WorkoutAudio.shared.setVoiceActive(false) }
        DiagnosticsLog.shared.record(.link, .wristVoice, outcome: salidaExterna == true ? .ok : .failed,
                                     detail: "external=\(salidaExterna == true) outputs=\(salidas.map(\.rawValue).joined(separator: ","))")
        actualizarHabla()
    }

    /// Salida externa = hay salida y ninguna es el altavoz (ni el auricular) del propio reloj.
    static func esExterna(_ puertos: [AVAudioSession.Port]) -> Bool {
        !puertos.isEmpty && puertos.allSatisfy { $0 != .builtInSpeaker && $0 != .builtInReceiver }
    }

    /// El enlace con el móvil (re)aparece: se le dice de nuevo si la muñeca habla, que es lo que le hace callar.
    func reanunciar() {
        if habla { alCambiarHabla?(true) }
    }

    private func actualizarHabla() {
        let ahora = atletaQuiereVoz && salidaExterna == true
        guard ahora != habla else { return }
        habla = ahora
        alCambiarHabla?(ahora)
    }

    // MARK: - AVSpeechSynthesizerDelegate

    // Acabar y cancelar avanzan igual: si una frase cancelada no restara, la sesión de audio se quedaría cogida.
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.frasePasada() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.frasePasada() }
    }

    private func frasePasada() {
        enCurso = Swift.max(0, enCurso - 1)
        if enCurso == 0 { WorkoutAudio.shared.setVoiceActive(false) }
    }
}

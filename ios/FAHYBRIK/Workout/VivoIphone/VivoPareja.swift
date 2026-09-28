import SwiftUI

// LA TIRA DE LA PAREJA (dobles) — cómo va tu pareja AHORA, en una línea, en el
// lenguaje del vivo nuevo (sustituye a `DoblesLiveStrip` del shell viejo).
// Viene de la presencia que el host sondea (`DoblesLiveClient`, ~5 s); aquí no se
// pide nada. Va sobre «Luego», como apoyo: tu entreno es el sujeto, lo de tu
// pareja es contexto. Sin pareja (o sin fila de presencia) no ocupa sitio.

extension DoblesLiveStripState {
    /// Lo que dice la tira: el titular (quién y cómo está) y el detalle, o nil = no se pinta.
    var lineaVivo: (titular: String, detalle: String?, enVivo: Bool)? {
        switch self {
        case .hidden:
            return nil
        case let .live(name, paused, block, progress, elapsedS, hrBpm, _):
            var d = [block, progress].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            d.append(Vivo.fmtReloj(Double(elapsedS)))
            if let hrBpm { d.append("\(hrBpm) ppm") }
            return ("\(name) · \(paused ? "en pausa" : "en vivo")", d.joined(separator: " · "), !paused)
        case let .stale(name, ageS):
            return ("\(name) · sin señal", "última \(DoblesLiveFormat.ago(ageS))", false)
        case let .finished(name, finalTimeS, finalRpe):
            let d = [finalTimeS.map { Vivo.fmtReloj(Double($0)) }, DoblesLiveFormat.rpe(finalRpe).map { "RPE \($0)" }].compactMap { $0 }
            return ("\(name) ha terminado", d.isEmpty ? nil : d.joined(separator: " · "), false)
        case let .left(name):
            return ("\(name) ha salido", "tu sesión sigue igual", false)
        }
    }
}

struct VivoTiraPareja: View {
    let estado: DoblesLiveStripState

    var body: some View {
        if let l = estado.lineaVivo {
            HStack(spacing: 10) {
                Circle()
                    .fill(l.enVivo ? VivoColor.tinta : VivoColor.tinta2)
                    .frame(width: 8, height: 8)
                VivoCuerpo(texto: Text(l.titular).fontWeight(.semibold)
                           + (l.detalle.map { Text(" · \($0)").foregroundStyle(VivoColor.tinta2) } ?? Text("")))
                    .lineLimit(2)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: VivoTokens.Alto.luego, alignment: .leading)
            .background(VivoColor.superficie, in: RoundedRectangle(cornerRadius: VivoTokens.Radio.superficie, style: .continuous))
            .padding(.horizontal, VivoTokens.margen)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Tu pareja: \(l.titular)\(l.detalle.map { ", \($0)" } ?? "")")
        }
    }
}

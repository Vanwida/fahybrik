import SwiftUI

// LA MINIATURA DE UN MOVIMIENTO — 84 × 47 en una tarjeta, 64 × 36 en una fila, siempre 16:9.
//
// Con vídeo de técnica: su póster, con la marca de que se puede reproducir. Sin vídeo (o mientras llega, o si no
// llega): una loseta del color de su modalidad con el gesto de su familia. Sin vídeo NO se dibuja un gesto de ese
// ejercicio: un dibujo inventado para un movimiento sin clip sería una instrucción que nadie ha dado.
//
// Es decorativa para VoiceOver: el nombre del movimiento ya lo dice la fila, y la fila dice si se puede abrir.

struct FichaMiniatura: View {
    enum Tamano {
        case tarjeta, fila

        var ancho: CGFloat {
            self == .tarjeta ? FichaMedidas.anchoDeMiniaturaEnTarjeta : FichaMedidas.anchoDeMiniaturaEnFila
        }

        /// 16:9, como el vídeo.
        var alto: CGFloat { (ancho * 9 / 16).rounded() }
    }

    let movimiento: MovimientoFicha
    var tamano: Tamano = .fila

    private var video: VideoDeTecnica? { VideoDeTecnica(movimiento.item.exerciseVideoUrl) }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
        Color.clear
            .frame(width: tamano.ancho, height: tamano.alto)
            .background { loseta }
            .overlay { poster }
            .clipShape(forma)
            .overlay(forma.strokeBorder(Theme.Color.hairline, lineWidth: 1))
            .overlay(alignment: .bottomLeading) { marcaDeVideo }
            .opacity(movimiento.esDeLaPareja ? Self.opacidadSiNoEsTuyo : 1)
            .accessibilityHidden(true)
    }

    /// El póster, encima de la loseta: hasta que llega (y si no llega) se ve la loseta, sin un estado de error aparte.
    @ViewBuilder
    private var poster: some View {
        if let url = video?.urlDelPoster {
            AsyncImage(url: url) { fase in
                if let imagen = fase.image {
                    imagen.resizable().scaledToFill()
                } else {
                    Color.clear
                }
            }
        }
    }

    private var loseta: some View {
        let color = Theme.Modality.color(movimiento.modalidad.rawValue)
        return ZStack {
            LinearGradient(
                stops: [
                    .init(color: Theme.Color.tinte(color, Self.tinteDeLaLoseta, sobre: Theme.Color.surfaceSunken), location: 0),
                    .init(color: Theme.Color.surfaceSunken, location: Self.finDelDegradado),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            IconoDia(movimiento.modalidad.glifoDeLoseta, tam: (tamano.alto * 0.5).rounded(), peso: .semibold)
                .foregroundStyle(Theme.Color.foreground.opacity(0.7))
        }
    }

    /// El triángulo de «aquí hay un vídeo»: sobre la foto, el fondo del tema al 62 % (como el panel sobre foto del kit).
    @ViewBuilder
    private var marcaDeVideo: some View {
        if video != nil {
            let lado = (tamano.alto * Self.proporcionDeLaMarca).rounded()
            IconoDia(.play, tam: (lado * Self.proporcionDelTriangulo).rounded(), peso: .bold)
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: lado, height: lado)
                .background(Theme.Color.background.opacity(Self.opacidadDelFondoDeLaMarca), in: Circle())
                .padding(Theme.Spacing.xs)
        }
    }

    /// La marca de vídeo: su lado respecto al alto de la miniatura, el triángulo respecto a la marca y la opacidad del fondo.
    private static let proporcionDeLaMarca = 0.4
    private static let proporcionDelTriangulo = 0.5
    private static let opacidadDelFondoDeLaMarca = 0.62
    /// Una estación que hace tu pareja se enseña apagada: decorativa, así que aquí sí vale bajar la opacidad.
    private static let opacidadSiNoEsTuyo = 0.5
    /// Cuánto tiñe la modalidad el arranque de la loseta, y dónde acaba el degradado.
    private static let tinteDeLaLoseta = 0.26
    private static let finDelDegradado = 0.8
}

private extension PrescriptionModality {
    /// El gesto de la familia de entreno en la loseta de un ejercicio sin vídeo.
    var glifoDeLoseta: GlifoDia {
        switch self {
        case .strength:         return .mancuerna
        case .run:              return .correr
        case .row, .ski, .bike: return .ergo
        case .functional:       return .funcional
        case .core, .mobility:  return .movilidad
        case .other:            return .ergo
        }
    }
}

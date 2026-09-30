import SwiftUI

// EL SUBTÍTULO — el título de un bloque dentro de una sección, o el de una pregunta de una hoja.
//
// Un escalón por debajo del título de sección (24 pt): 20 pt, cursiva de marca, en la tinta del tema, y
// cabecera para VoiceOver (`.papel(.subtitulo)` es solo la tipografía; el rasgo y el color van aquí). Es
// el `<h3>` del doble: «Estaciones», «Ritmo por km», «¿A qué vas?», «Elige tu objetivo».

struct SubtituloDia: View {
    let texto: String

    init(_ texto: String) { self.texto = texto }

    var body: some View {
        Text(texto)
            .papel(.subtitulo)
            .foregroundStyle(Theme.Color.foreground)
            .accessibilityAddTraits(.isHeader)
    }
}

#if DEBUG
#Preview("Subtítulo · fábrica") { EnAmbasDia { GaleriaDia.Tipos() } }
#endif

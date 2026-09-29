import SwiftUI

// EL TÍTULO DE SECCIÓN — 24 pt fuerte, cursiva de marca.
//
// La voz con que una pantalla del día abre cada bloque debajo del sujeto («Contigo», «Rendimiento»).
// No es un `SectionLabel`/`SectionHeader` (esas son etiquetas en mayúsculas de 10-11 pt de la
// escala antigua): esto es un TÍTULO, y por eso pesa 24 (CONTRATO-UI §4.1). `aparte` lleva a la
// derecha el estado de la sección («3 cosas», «3 de 5 con dato»).

struct TituloSeccionDia<Aparte: View>: View {
    let titulo: String
    let aparte: Aparte

    init(_ titulo: String, @ViewBuilder aparte: () -> Aparte) {
        self.titulo = titulo
        self.aparte = aparte()
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            Text(titulo)
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: Theme.Spacing.m)
            aparte
        }
    }
}

extension TituloSeccionDia where Aparte == EmptyView {
    init(_ titulo: String) {
        self.init(titulo, aparte: { EmptyView() })
    }
}

#if DEBUG
#Preview("Título de sección · fábrica") { EnAmbasDia { GaleriaDia.Disposicion() } }
#Preview("Título de sección · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Disposicion() } }
#endif

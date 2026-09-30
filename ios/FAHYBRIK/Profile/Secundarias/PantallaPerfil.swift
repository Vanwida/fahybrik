import SwiftUI

// EL CASCARÓN DE LAS PANTALLAS QUE CUELGAN DE PERFIL — las seis puertas, las cifras y las hojas.
//
// La pestaña ya habla el lenguaje de «El día»; lo que cuelga de ella tiene que hablar el mismo: el
// título es un papel de la escala (`.saludo`, 30 pt), los bloques van debajo con un título de sección
// (`TituloSeccionDia`) y el margen es el de las pantallas del día. Una pantalla de aquí NO lleva un
// sujeto de 244 pt: no es un momento, es un sitio al que se viene a mirar o a arreglar algo, y el
// único grande de la pestaña ya lo enseñó la raíz.
//
// LA BARRA de navegación del sistema se queda, sin título: el «‹ Perfil» y el gesto de borde son de
// UIKit y funcionan solos, y el título de verdad va en el cuerpo, con el papel del día y la marca de
// encabezado para VoiceOver. En una hoja el mismo cascarón añade su «Cerrar» o «Cancelar».
//
//     PantallaPerfil(titulo: "Entreno") { … secciones … }
//     PantallaPerfil(titulo: "Editar perfil", cierre: .cancelar) { … }
//
// ALTURA (§6.1). `.llena` mete el contenido en un `FillingScreen`, para que el estado vacío o el
// error, que son UN sujeto, absorban el sobrante entre su título y su acción. Las pantallas de lista
// y de formulario (`.natural`) se quedan en su alto y scrollean.

/// Cómo se cierra una hoja: `cerrar` para las de solo lectura, `cancelar` para las que piden algo y se
/// pueden abandonar sin guardar.
enum CierreDeHojaPerfil {
    case cerrar
    case cancelar

    var titulo: String {
        switch self {
        case .cerrar: return "Cerrar"
        case .cancelar: return "Cancelar"
        }
    }
}

struct PantallaPerfil<Contenido: View, Pie: View>: View {
    /// Cómo reparte la pantalla el alto que su contenido no usa.
    enum Alto {
        /// Scrollea con su contenido: una lista o un formulario.
        case natural
        /// El contenido llena la pantalla y el sobrante entra en su sujeto (§6.1 `llena`).
        case llena
    }

    let titulo: String
    /// La línea que abre la pantalla, en el acento del club: dice DE QUIÉN o DE QUÉ es lo que sigue.
    var sobretitulo: String?
    var alto: Alto
    /// Con valor la pantalla es una hoja y se cierra con este botón; sin él se empuja y se sale con «‹».
    var cierre: CierreDeHojaPerfil?
    /// Con algo en marcha (una subida, un guardado) la hoja no se cierra: ni el botón ni, si la hoja lo pide con
    /// `.interactiveDismissDisabled`, el gesto.
    var cierreActivo: Bool
    var alRefrescar: (() async -> Void)?
    @ViewBuilder let contenido: () -> Contenido
    /// Lo que va anclado abajo, siempre a la vista (la acción de un formulario).
    @ViewBuilder let pie: () -> Pie

    init(
        titulo: String,
        sobretitulo: String? = nil,
        alto: Alto = .natural,
        cierre: CierreDeHojaPerfil? = nil,
        cierreActivo: Bool = true,
        alRefrescar: (() async -> Void)? = nil,
        @ViewBuilder contenido: @escaping () -> Contenido,
        @ViewBuilder pie: @escaping () -> Pie
    ) {
        self.titulo = titulo
        self.sobretitulo = sobretitulo
        self.alto = alto
        self.cierre = cierre
        self.cierreActivo = cierreActivo
        self.alRefrescar = alRefrescar
        self.contenido = contenido
        self.pie = pie
    }

    @Environment(\.dismiss) private var dismiss

    /// Aire vertical entre bloques: el de la pestaña.
    static var entreBloques: CGFloat { 22 }

    var body: some View {
        if cierre != nil {
            NavigationStack { cuerpo }
        } else {
            cuerpo
        }
    }

    private var cuerpo: some View {
        scroll
            .background(Theme.Color.background.ignoresSafeArea())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let cierre {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(cierre.titulo) {
                            Haptics.light()
                            dismiss()
                        }
                        .foregroundStyle(Theme.Color.accentText)
                        .disabled(!cierreActivo)
                    }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if Pie.self != EmptyView.self {
                    pie()
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.top, Theme.Spacing.m)
                        .padding(.bottom, Theme.Spacing.s)
                        .frame(maxWidth: .infinity)
                        .background { Theme.Color.background.ignoresSafeArea(edges: .bottom) }
                        .overlay(alignment: .top) { Hairline() }
                }
            }
    }

    @ViewBuilder
    private var scroll: some View {
        switch alto {
        case .llena:
            FillingScreen { pila }
                .refreshableSi(alRefrescar)
        case .natural:
            ScrollView { pila }
                .scrollBounceBehavior(.always)
                .refreshableSi(alRefrescar)
        }
    }

    private var pila: some View {
        VStack(alignment: .leading, spacing: Self.entreBloques) {
            CabeceraPerfil(titulo: titulo, sobretitulo: sobretitulo)
            contenido()
        }
        .padding(EdgeInsets(
            top: Theme.Spacing.xs,
            leading: Theme.Spacing.pantalla,
            bottom: Theme.Spacing.xxl,
            trailing: Theme.Spacing.pantalla
        ))
        .frame(maxWidth: .infinity, alignment: .leading)
        // El scroll mide su ancho por el descendiente más ancho: fijar el contenido al del contenedor,
        // por FUERA del margen, evita que un texto sin cortes ensanche el contenido y lo deje bailar.
        .clampedToContainerWidth()
    }
}

extension PantallaPerfil where Pie == EmptyView {
    init(
        titulo: String,
        sobretitulo: String? = nil,
        alto: Alto = .natural,
        cierre: CierreDeHojaPerfil? = nil,
        cierreActivo: Bool = true,
        alRefrescar: (() async -> Void)? = nil,
        @ViewBuilder contenido: @escaping () -> Contenido
    ) {
        self.init(
            titulo: titulo, sobretitulo: sobretitulo, alto: alto, cierre: cierre, cierreActivo: cierreActivo,
            alRefrescar: alRefrescar,
            contenido: contenido, pie: { EmptyView() }
        )
    }
}

private extension View {
    /// `refreshable` solo si la pantalla lo pide: una hoja de solo lectura no tiene nada que recargar.
    @ViewBuilder
    func refreshableSi(_ accion: (() async -> Void)?) -> some View {
        if let accion { refreshable { await accion() } } else { self }
    }
}

// MARK: - La cabecera

/// El título de la pantalla: `.saludo` en cursiva de marca y, encima, si lo hay, su sobretítulo.
struct CabeceraPerfil: View {
    let titulo: String
    var sobretitulo: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if let sobretitulo, !sobretitulo.isEmpty {
                Text(sobretitulo).papel(.etiqueta).foregroundStyle(Theme.Color.accentText)
            }
            Text(titulo)
                .papel(.saludo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

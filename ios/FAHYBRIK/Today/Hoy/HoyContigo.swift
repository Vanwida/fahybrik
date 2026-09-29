import SwiftUI

// «CONTIGO» — lo que te reclama, agrupado en UNA superficie y plegado.
//
// Es la vuelta a lo que la app tenía repartido en cinco tarjetas sueltas que se cargaban solas
// (retomar, pareja en vivo, batería de tests, revisión con el coach, comunicados): ahora son filas de
// una sola tarjeta, en el orden en que CADUCAN (`LecturaHoy.itemsContigo`), con las mismas fuentes y la
// misma lógica de carga (`HoyModelo`). Se pinta lo que hay y nada más: sin reclamos no hay sección (no
// hay ruido gris). Un CONTADOR se pinta también en cero (§6.2 bis). Con más de tres filas se pliega a
// dos y un «Ver N más» de 48 pt.
//
// Sin coach no llega ninguna fila de coach: lo garantiza `itemsContigo`, no esta vista.

/// El contenido de una fila, sin presentación ni acciones: pura, para poder fijar sus textos con pruebas.
struct FilaContigo: Equatable, Identifiable {
    enum Ficha: Equatable {
        case glifo(GlifoDia)
        /// Lo que caduca en minutos o ya está empezado: la ficha lleva el acento.
        case realce(GlifoDia)
        case inicial(String)
    }

    enum Extra: Equatable {
        case ninguno
        case pastilla(String)
        case regleta(n: Int, de: Int)
    }

    let clave: ClaveContigo
    let ficha: Ficha
    let titulo: String
    let detalle: String
    let extra: Extra
    /// Lo que caduca en minutos o ya está empezado: la fila lleva el tinte del acento.
    let realce: Bool
    /// La pastilla de la derecha ya es el gesto: sin chevron.
    let sinChevron: Bool
    /// Informativa: no hay nada que tocar (la pareja entrena y no puedes unirte).
    let informativa: Bool
    let etiqueta: String

    var id: ClaveContigo { clave }

    static func desde(_ item: ItemContigo, lectura l: LecturaHoy) -> FilaContigo {
        let quien = l.coach ?? "Tu coach"
        switch item {
        case .reclamo(.parejaEnVivo(let nombre, let detalle)):
            let unirse = l.puedeUnirse
            return FilaContigo(
                clave: .parejaEnVivo, ficha: .inicial(String(nombre.prefix(1)).uppercased()),
                titulo: "\(nombre) está entrenando ahora",
                detalle: unirse ? "\(detalle) · desde el Plan" : detalle,
                extra: unirse ? .pastilla("Únete") : .ninguno,
                realce: true, sinChevron: unirse, informativa: !unirse,
                etiqueta: "\(nombre) está entrenando ahora. \(detalle). \(unirse ? "Únete en vivo" : "En vivo")"
            )
        case .reclamo(.aMedias(let titulo, let desde)):
            return FilaContigo(
                clave: .aMedias, ficha: .realce(.pausa),
                titulo: "Tienes un entreno a medias",
                detalle: "\(titulo) · desde las \(desde)",
                extra: .pastilla("Retomar"),
                realce: true, sinChevron: true, informativa: false,
                etiqueta: "Tienes un entreno a medias: \(titulo), desde las \(desde). Retomar"
            )
        case .reclamo(.revision(let estado, let cuando, let minutos, let enlace)):
            switch estado {
            case .propuesta:
                let detalle = "\(cuando ?? "Elige tu hueco") · videollamada de \(minutos ?? DuracionDeLaRevision.porDefecto) min"
                return FilaContigo(
                    clave: .revision, ficha: .glifo(.video),
                    titulo: "\(quien) te propone una revisión", detalle: detalle,
                    extra: .ninguno, realce: false, sinChevron: false, informativa: false,
                    etiqueta: "\(quien) te propone una revisión. \(detalle)"
                )
            case .reservada:
                let titulo = "Próxima sesión con \(l.coach ?? "tu coach")"
                let cita = cuando ?? "Revisión reservada"
                let detalle = enlace == nil
                    ? "\(cita) · te enviaremos el enlace"
                    : "\(cita)\(minutos.map { " · \($0) min" } ?? "")"
                return FilaContigo(
                    clave: .revision, ficha: .glifo(.video), titulo: titulo, detalle: detalle,
                    extra: enlace == nil ? .ninguno : .pastilla("Unirse"),
                    realce: false, sinChevron: enlace != nil, informativa: enlace == nil,
                    etiqueta: "\(titulo). \(detalle)\(enlace == nil ? "" : ". Unirse a la videollamada")"
                )
            }
        case .reclamo(.tests(let hechos, let total)):
            let detalle = total.map { "\(hechos) de \($0) hechos" } ?? "Aún no has calibrado nada"
            return FilaContigo(
                clave: .tests, ficha: .glifo(.cronometro), titulo: "Tus tests", detalle: detalle,
                extra: total.map { .regleta(n: hechos, de: $0) } ?? .ninguno,
                realce: false, sinChevron: false, informativa: false,
                etiqueta: "Tus tests: \(detalle)"
            )
        case .comunicados(let n):
            return FilaContigo(
                clave: .comunicados, ficha: .glifo(.bandeja), titulo: "Del coach", detalle: "\(n) sin resolver",
                extra: .ninguno, realce: false, sinChevron: false, informativa: false,
                etiqueta: "Del coach, \(n) sin resolver"
            )
        }
    }
}

/// La revisión con el coach dura 30 minutos en la v1: el servidor lo manda en la cita reservada, y en la
/// propuesta (aún sin cita) es lo que dice el texto de siempre.
private enum DuracionDeLaRevision {
    static let porDefecto = 30
}

struct HoyContigo: View {
    let lectura: LecturaHoy
    let items: [ItemContigo]
    let acciones: HoyAcciones

    @State private var abierto = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    /// Desde cuántas filas se pliega, y cuántas quedan a la vista al plegar.
    private static let plegarDesde = 3
    private static let visiblesAlPlegar = 2
    /// El alto mínimo de una fila: cabe la ficha de 44 pt con su aire y dos líneas de texto.
    private static let altoDeFila: CGFloat = 72
    /// El aire entre la ficha, el texto y lo que va a la derecha.
    private static let separacionDeFila: CGFloat = 14

    private var filas: [FilaContigo] { items.map { FilaContigo.desde($0, lectura: lectura) } }

    var body: some View {
        if !items.isEmpty {
            let filas = filas
            let plegable = filas.count > Self.plegarDesde
            let visibles = plegable && !abierto ? Array(filas.prefix(Self.visiblesAlPlegar)) : filas
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloSeccionDia("Contigo") {
                    InfoPill(text: items.count == 1 ? "1 cosa" : "\(items.count) cosas", estilo: .velo)
                }
                VStack(spacing: 0) {
                    ForEach(Array(visibles.enumerated()), id: \.element.id) { i, fila in
                        if i > 0 { Hairline() }
                        filaView(fila)
                    }
                    if plegable {
                        Hairline()
                        botonDePliegue(resto: filas.count - Self.visiblesAlPlegar)
                    }
                }
                .tarjetaDia()
            }
        }
    }

    // MARK: - Una fila

    @ViewBuilder
    private func filaView(_ f: FilaContigo) -> some View {
        if f.informativa {
            contenido(f).accessibilityElement(children: .ignore).accessibilityLabel(f.etiqueta)
        } else {
            Button(action: accion(de: f.clave)) { contenido(f) }
                .buttonStyle(PressScaleStyle(escala: 0.99))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(f.etiqueta)
                .accessibilityAddTraits(.isButton)
        }
    }

    private func contenido(_ f: FilaContigo) -> some View {
        Group {
            if tamanoDeTexto.isAccessibilitySize {
                // Con el texto de accesibilidad la pastilla o la regleta no caben al lado del texto sin
                // dejarlo en una columna de tres letras: pasan debajo, alineadas con él.
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    HStack(alignment: .top, spacing: Self.separacionDeFila) {
                        ficha(f.ficha)
                        textos(f)
                        chevron(f)
                    }
                    extra(f.extra)
                        .padding(.leading, FichaDia<IconoDia>.lado + Self.separacionDeFila)
                }
            } else {
                HStack(spacing: Self.separacionDeFila) {
                    ficha(f.ficha)
                    textos(f)
                    extra(f.extra)
                    chevron(f)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Self.altoDeFila)
        .background { Rectangle().fill(f.realce ? Theme.Color.accentTint : SwiftUI.Color.clear) }
        // Lo que dice la fila se lee entero: con el texto grande baja de línea y la fila crece, no se corta
        // con «…» ni se monta sobre la siguiente.
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(Rectangle())
    }

    private func textos(_ f: FilaContigo) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(f.titulo).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
            // Sobre el tinte del acento, la tinta del tema: el gris de apoyo no llega a AA con acentos claros.
            Text(f.detalle).papel(.nota).foregroundStyle(f.realce ? Theme.Color.foreground : Theme.Color.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func extra(_ e: FilaContigo.Extra) -> some View {
        switch e {
        case .ninguno: EmptyView()
        case .pastilla(let texto): InfoPill(text: texto, estilo: .solido)
        case .regleta(let n, let de): RegletaDia(n: n, de: de, anchoSegmento: 14)
        }
    }

    @ViewBuilder
    private func chevron(_ f: FilaContigo) -> some View {
        if !f.sinChevron && !f.informativa {
            IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
        }
    }

    @ViewBuilder
    private func ficha(_ f: FilaContigo.Ficha) -> some View {
        switch f {
        case .glifo(let g): FichaDia(g)
        case .realce(let g): FichaDia(g, tono: .realce)
        case .inicial(let letra):
            FichaDia(tono: .realce) { Text(letra).papel(.cuerpoFuerte) }
        }
    }

    /// Qué hace cada fila al tocarla. Ninguna empieza un entreno del coach: unirse en vivo lleva al Plan.
    private func accion(de clave: ClaveContigo) -> () -> Void {
        switch clave {
        case .parejaEnVivo: return acciones.abrirPlan
        case .aMedias: return acciones.retomarEntreno
        case .tests: return acciones.abrirTests
        case .comunicados: return acciones.abrirComunicados
        case .revision:
            for item in items {
                if case .reclamo(.revision(.reservada, _, _, let enlace?)) = item {
                    return { acciones.unirseALaRevision(enlace) }
                }
            }
            return acciones.elegirHuecoDeLaRevision
        }
    }

    // MARK: - Ver más / ver menos

    private func botonDePliegue(resto: Int) -> some View {
        Button {
            Haptics.light()
            withAnimation(reduceMotion ? nil : Theme.Motion.reveal) { abierto.toggle() }
        } label: {
            HStack {
                Text(abierto ? "Ver menos" : "Ver \(resto) más")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.accentText)
                Spacer(minLength: Theme.Spacing.m)
                IconoDia(.chevron, tam: 18)
                    .foregroundStyle(Theme.Color.accentText)
                    .rotationEffect(.degrees(abierto ? -90 : 90))
            }
            .padding(.horizontal, Theme.Spacing.l)
            .frame(minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.99))
        .accessibilityValue(abierto ? "Desplegado" : "Plegado")
    }
}

import SwiftUI

// LO QUE SE PINTA EN LA BIBLIOTECA DE MARCAS: los grupos, sus filas y el esqueleto.
//
// Son vistas planas —sin scroll, sin almacén, sin navegación propia que no sea el destino de cada fila— para
// que la pantalla, la galería y las capturas pinten EXACTAMENTE lo mismo. Quien las envuelve en un
// `FillingScreen` y les da servicio es `MarksLibraryView`.

// MARK: - Los grupos

/// Correr · Remo y SkiErg · Carreras, cada uno con su título y una tarjeta de filas.
struct MarcasBiblioteca: View {
    let grupos: [GrupoDeMarcas]
    let bearer: String?
    var hrZones: HRZoneProfile? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            ForEach(grupos) { grupo in
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    TituloSeccionDia(grupo.titulo) {
                        InfoPill(text: grupo.recuento, estilo: .velo)
                    }
                    ListaDia {
                        ForEach(grupo.filas) { fila in
                            NavigationLink {
                                MarkDetailView(slug: fila.slug, bearer: bearer, hrZones: hrZones)
                            } label: {
                                FilaDeMarcaView(fila: fila)
                            }
                            .buttonStyle(PressScaleStyle(escala: 0.985))
                        }
                    }
                }
            }
        }
        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Una fila

/// Una prueba: con marca, el tiempo manda y la antigüedad baja a apoyo; sin marca, la prueba es el sujeto de su
/// fila y el apoyo es la invitación. El sitio del número no lleva guion: un valor medido no existe hasta que se
/// mide (§6.2 bis / §7).
struct FilaDeMarcaView: View {
    let fila: FilaDeMarca

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text(fila.etiqueta)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                if let apoyo {
                    Text(apoyo)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)

            if case let .marca(cifra, ritmo) = fila.estado {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(cifra)
                        .papel(.seccion)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    if let ritmo {
                        Text(ritmo)
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(1)
                    }
                }
                .fixedSize(horizontal: true, vertical: false)
            }

            IconoDia(.chevron, tam: 18, peso: .semibold)
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .frame(minHeight: 68)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(fila.etiquetaAccesible)
        .accessibilityAddTraits(.isButton)
    }

    /// Con marca, cuándo y de dónde salió; sin ella, lo que cuesta la prueba.
    private var apoyo: String? {
        switch fila.estado {
        case .marca: return fila.detalle
        case let .sinMarca(invitacion): return invitacion
        }
    }
}

// MARK: - Cargando

/// Lo que se ve antes de que conteste el servidor: dos grupos con su título y su tarjeta, de las medidas de lo que
/// va a llegar. Nada salta al llegar el dato.
struct EsqueletoDeMarcas: View {
    private static let filasPorGrupo = [4, 3]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            ForEach(Array(Self.filasPorGrupo.enumerated()), id: \.offset) { _, filas in
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    SkeletonBar(width: 140, height: 24)
                    ListaDia {
                        ForEach(0..<filas, id: \.self) { _ in
                            HStack(spacing: Theme.Spacing.m) {
                                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                                    SkeletonBar(width: 110, height: 17)
                                    SkeletonBar(width: 170, height: 15)
                                }
                                Spacer(minLength: Theme.Spacing.m)
                                SkeletonBar(width: 64, height: 22)
                            }
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .frame(minHeight: 68)
                        }
                    }
                }
            }
        }
        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tus marcas")
    }
}

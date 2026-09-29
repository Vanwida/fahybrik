import SwiftUI

// AJUSTES — las seis puertas, al fondo. Un ajuste no es un sujeto. Espejo de `ajustes.tsx` y `pie.tsx`.
//
// Cada puerta lleva su subtítulo REAL y, cuando la app sabe algo del atleta, lo que revela de estado
// en su lugar («Apple Salud y COROS conectados», «Movimiento del reloj: retirado», «Dobles · con
// Biel»): la descripción de lo que hay dentro solo sobrevive cuando no hay nada mejor que decir
// (§6.2 bis).
//
// El COLOR de estado va en la marca (un punto), nunca en el texto. Permitir o retirar el movimiento
// del reloj es una decisión suya, no un fallo: su marca es neutra. Lo que pide al atleta (aviso o
// peligro) tiñe la fila y NUNCA se pliega. A la vista, las que se usan y las que dicen algo del
// atleta; plegadas con contador, las que no tienen nada que decir (`DecidePerfil.agruparPuertas`).

struct AjustesPerfilSeccion: View {
    let puertas: [PuertaPerfil]
    let alAbrir: (ClavePuerta) -> Void

    @State private var abierto = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let grupos = DecidePerfil.agruparPuertas(puertas)
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Ajustes")
            VStack(spacing: 0) {
                ForEach(Array(grupos.visibles.enumerated()), id: \.element.id) { i, puerta in
                    if i > 0 { Hairline() }
                    FilaDePuertaPerfil(puerta: puerta) { alAbrir(puerta.clave) }
                }
                if !grupos.plegadas.isEmpty {
                    if abierto {
                        ForEach(grupos.plegadas) { puerta in
                            Hairline()
                            FilaDePuertaPerfil(puerta: puerta) { alAbrir(puerta.clave) }
                        }
                    }
                    Hairline()
                    plegador(grupos.plegadas)
                }
            }
            .tarjetaPerfil()
        }
    }

    /// «Más ajustes» / «Ver menos»: lo que no dice nada del atleta, a un toque.
    private func plegador(_ plegadas: [PuertaPerfil]) -> some View {
        Button {
            Haptics.light()
            if reduceMotion {
                abierto.toggle()
            } else {
                withAnimation(.easeOut(duration: 0.2)) { abierto.toggle() }
            }
        } label: {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(abierto ? "Ver menos" : "Más ajustes")
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.accentText)
                    if !abierto {
                        Text(TextosPerfil.listaConY(plegadas.map(\.corto)))
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if !abierto { InfoPill(text: "\(plegadas.count)", estilo: .velo) }
                GiroPerfil(abierto: abierto).foregroundStyle(Theme.Color.accentText)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(minHeight: Theme.Size.toque + Theme.Spacing.l)
            .background(Theme.Color.foreground.opacity(Self.velo))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.985))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(abierto ? "Ver menos ajustes" : "Más ajustes: \(TextosPerfil.listaConY(plegadas.map(\.corto)))")
        .accessibilityValue(abierto ? "abiertos" : "plegados")
        .accessibilityAddTraits(.isButton)
    }

    /// El velo de la tinta del tema sobre el que descansa el plegador (un 3 %: apenas distingue la fila).
    private static let velo: Double = 0.03
}

// MARK: - Una puerta

private struct FilaDePuertaPerfil: View {
    let puerta: PuertaPerfil
    let alTocar: () -> Void

    var body: some View {
        let estado = puerta.estado
        Button {
            Haptics.light()
            alTocar()
        } label: {
            HStack(spacing: 14) {
                FichaDia(tono: estado?.tono.ficha ?? .normal) { IconoPerfil(puerta.clave.glifo) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(puerta.titulo)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                    if let estado {
                        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                            MarcaDeEstadoPerfil(tono: estado.tono)
                            Text(estado.texto)
                                .papel(.notaFuerte)
                                .foregroundStyle(Theme.Color.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    } else {
                        Text(puerta.descripcion)
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(minHeight: 76)
            .background(realce)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.985))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(puerta.titulo). \(estado?.texto ?? puerta.descripcion)")
        .accessibilityAddTraits(.isButton)
    }

    /// Lo que pide al atleta (aviso o peligro) tiñe la fila con el color de su marca.
    @ViewBuilder
    private var realce: some View {
        if puerta.atencion, let color = puerta.estado?.tono.color {
            Theme.Color.tinte(color, Self.tinteDeAtencion, sobre: Theme.Color.surface)
        } else {
            Color.clear
        }
    }

    private static let tinteDeAtencion: Double = 0.09
}

/// El punto de color que acompaña a un estado. `neutro` no lleva: una decisión suya no es ni buena ni
/// mala noticia.
private struct MarcaDeEstadoPerfil: View {
    let tono: TonoMarca

    var body: some View {
        if let color = tono.color {
            Circle()
                .fill(color)
                .frame(width: 10, height: 10)
                .accessibilityHidden(true)
        }
    }
}

// MARK: - El pie

/// Cerrar sesión y la versión. «Cerrar sesión» pesa lo mínimo: sin borde, sin fondo, solo texto (antes
/// un contorno rojo de ancho completo, que lo convertía en una acción que compite con las cifras). El
/// peligro va en el TEXTO y en nada más; sigue siendo un objetivo de 48 pt. Como siempre, cierra al
/// momento, sin «¿seguro?».
///
/// La versión lleva el gesto escondido: siete toques seguidos abren el «Diagnóstico del reloj» (no es
/// producto, no tiene espejo). No se insinúa que existe: la versión se lee como una versión.
struct PiePerfil: View {
    let version: String?
    let alCerrarSesion: () -> Void
    let alDiagnostico: () -> Void

    /// Toques seguidos que abren el diagnóstico.
    static let toquesDelDiagnostico = 7

    var body: some View {
        VStack(spacing: 2) {
            Button {
                Haptics.medium()
                alCerrarSesion()
            } label: {
                Text("Cerrar sesión")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.danger)
                    .padding(.horizontal, 28)
                    .frame(minHeight: Theme.Size.toque)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
            if let version {
                Text("Versión \(version)")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .padding(.horizontal, 24)
                    .frame(minHeight: Theme.Size.toque)
                    .contentShape(Rectangle())
                    .onTapGesture(count: Self.toquesDelDiagnostico, perform: alDiagnostico)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

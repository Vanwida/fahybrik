import SwiftUI

// LA TESELA DE DATO — una cifra con su rótulo, del mismo peso que la de al lado.
//
// Marca reciente y pasos (Hoy), los cinco números de Rendimiento (Perfil): pruebas, no
// protagonistas. Radio 22, un rótulo de 15 pt arriba, el dato a 32 pt debajo y, si hace falta,
// una línea de pie. Van de dos en dos (`LazyVGrid`, o dos `TeselaDia` en un `HStack`).
//
// CONTRATO-UI §6.2 bis y §7 hechos pieza:
//   · un CONTADOR se pinta también en cero («0 de 4»); un VALOR MEDIDO no existe hasta que se
//     mide, y entonces la tesela es una INVITACIÓN con su verbo, no un guion;
//   · la tesela que pide un acto (`realce`) se tiñe del acento del club: la cifra NO cambia de
//     color, el color de estado no va en el dato.
//
// La FORMA de la tesela la fija su sitio, no su estado: el esqueleto de una tesela es la misma
// `TeselaDia` con `SkeletonBar` dentro, y nada salta al llegar el dato.
//
//     TeselaDia(rotulo: "Marca reciente", alTocar: { … }) {
//         Text("4:12/km").papel(.dato).foregroundStyle(Theme.Color.foreground)
//         Text("−3 s").papel(.notaFuerte).foregroundStyle(Theme.Color.ok)
//     }

struct TeselaDia<Cabecera: View, Contenido: View>: View {
    /// Pide un acto (medirse, conectar): tinte del acento en el fondo y el borde.
    var realce: Bool
    var altoMinimo: CGFloat
    /// Lo que lee VoiceOver. Sin él, el texto de la tesela leído de arriba abajo.
    var etiqueta: String?
    var alTocar: (() -> Void)?
    let cabecera: Cabecera
    let contenido: Contenido
    @Environment(\.teselasEstiradas) private var estirada

    init(
        realce: Bool = false,
        altoMinimo: CGFloat = Theme.Size.tesela,
        etiqueta: String? = nil,
        alTocar: (() -> Void)? = nil,
        @ViewBuilder cabecera: () -> Cabecera,
        @ViewBuilder contenido: () -> Contenido
    ) {
        self.realce = realce
        self.altoMinimo = altoMinimo
        self.etiqueta = etiqueta
        self.alTocar = alTocar
        self.cabecera = cabecera()
        self.contenido = contenido()
    }

    @ViewBuilder
    var body: some View {
        if let alTocar {
            Button(action: alTocar) { cara }
                .buttonStyle(PressScaleStyle(escala: 0.982))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiqueta ?? "")
                .accessibilityAddTraits(.isButton)
        } else if let etiqueta {
            cara
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiqueta)
        } else {
            cara.accessibilityElement(children: .combine)
        }
    }

    private var cara: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        // La cabecera arriba, el pie abajo y el dato entre los dos, con el aire repartido a partes iguales
        // (`space-between` del doble): un dato solo queda en el medio, no pegado al borde.
        return EntreLayout(
            separacionMinima: Theme.Spacing.m - 2,
            altoMinimo: altoMinimo - 2 * Theme.Spacing.l,
            llena: estirada
        ) {
            cabecera
            contenido
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(
            realce ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surface,
            in: forma
        )
        .overlay(forma.strokeBorder(realce ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
        .contentShape(forma)
    }
}

// MARK: - La fila de teselas

private struct TeselasEstiradasKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Las teselas de esta fila se estiran hasta la más alta. Lo pone `TeselasDia`.
    var teselasEstiradas: Bool {
        get { self[TeselasEstiradasKey.self] }
        set { self[TeselasEstiradasKey.self] = newValue }
    }
}

/// Una fila de teselas, todas de la misma altura: la de la más alta (`grid` del doble, que estira las
/// celdas). La fila mide lo que mide su tesela más alta y NO se lleva el sobrante de la pantalla: las
/// teselas son pruebas, no protagonistas. Una tesela sola (la impar de Perfil) va también aquí, y ocupa el ancho.
///
/// Con el texto del sistema en tamaños de accesibilidad las teselas pasan a UNA columna: en dos, un dato
/// de 32 pt escalado no cabe en media pantalla y se parte por la mitad.
struct TeselasDia<Contenido: View>: View {
    let contenido: Contenido
    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    init(@ViewBuilder _ contenido: () -> Contenido) {
        self.contenido = contenido()
    }

    var body: some View {
        if tamanoDeTexto.isAccessibilitySize {
            VStack(spacing: Theme.Spacing.m) { contenido }
        } else {
            HStack(alignment: .top, spacing: Theme.Spacing.m) { contenido }
                .fixedSize(horizontal: false, vertical: true)
                .environment(\.teselasEstiradas, true)
        }
    }
}

/// La cabecera de una tesela: su rótulo y, a la derecha, el chevron que dice «esto abre algo».
struct CabeceraTeselaDia: View {
    let rotulo: String
    var conChevron = true
    /// La tesela está teñida del acento: el rótulo pasa a la tinta del tema. El gris de apoyo sobre un
    /// tinte de un acento CLARO (un amarillo, un verde) mide 4,1-4,4:1 en oscuro, por debajo de AA.
    var sobreTinte = false

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text(rotulo)
                .papel(.rotulo)
                .foregroundStyle(sobreTinte ? Theme.Color.foreground : Theme.Color.muted)
                // Un rótulo largo pasa a dos líneas: un rótulo cortado con «…» no dice qué dato es.
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: Theme.Spacing.xs)
            if conChevron {
                IconoDia(.chevron, tam: 18)
                    .foregroundStyle(sobreTinte ? Theme.Color.foreground : Theme.Color.muted)
            }
        }
        .frame(minHeight: 20)
    }
}

extension TeselaDia where Cabecera == CabeceraTeselaDia {
    /// La tesela normal: rótulo arriba (con chevron si abre algo) y el contenido debajo.
    init(
        rotulo: String,
        realce: Bool = false,
        altoMinimo: CGFloat = Theme.Size.tesela,
        etiqueta: String? = nil,
        alTocar: (() -> Void)? = nil,
        @ViewBuilder contenido: () -> Contenido
    ) {
        self.init(
            realce: realce,
            altoMinimo: altoMinimo,
            etiqueta: etiqueta,
            alTocar: alTocar,
            cabecera: { CabeceraTeselaDia(rotulo: rotulo, conChevron: alTocar != nil, sobreTinte: realce) },
            contenido: contenido
        )
    }
}

#if DEBUG
#Preview("Tesela · fábrica") { EnAmbasDia { GaleriaDia.Teselas() } }
#Preview("Tesela · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Teselas() } }
#endif

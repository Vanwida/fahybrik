import SwiftUI

// LA PIEL DE LO QUE PASA ANTES DE ENTRENAR — las piezas que comparten la ficha de la sesión, la puerta
// del bloque, la hoja de bloques, los dispositivos y la guía de la cinta.
//
// Son las equivalentes, para esta zona, de las que ya tienen Hoy (`tarjetaDia`) y el Plan
// (`AccionAncladaPlan`): la misma cara, el mismo alto y el mismo tratamiento del acento del club. No se
// copian de allí para no atar esta zona a otra pestaña; si el kit (`Theme/Dia`) las consolida, éstas se
// sustituyen por las suyas sin tocar las pantallas.

extension View {
    /// La cara de una tarjeta de la zona: superficie, filete y radio de tarjeta (22), sin sombra.
    func tarjetaPrevia() -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        return self
            .background(Theme.Color.surface, in: forma)
            .clipShape(forma)
            .overlay(forma.strokeBorder(Theme.Color.hairline, lineWidth: 1))
    }
}

/// La acción anclada abajo de una pantalla previa («Continuar», «Empezar», «Arrancar bloque»): la pastilla
/// de tinta invertida de `AccionDia` a todo el ancho y a 56 pt. El sujeto es lo que miras y esto lo que
/// tocas, así que no es un segundo bloque del acento (CONTRATO-UI §10.5).
struct AccionAncladaPrevia: View {
    let titulo: String
    /// El SF Symbol de la acción. El play va delante («▶ Empezar»); el resto, detrás («Continuar →»).
    var simbolo: String?
    var simboloDelante = false
    let accion: () -> Void

    static let alto: CGFloat = 56

    var body: some View {
        Button {
            Haptics.medium()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.m - 2) {
                if simboloDelante { glifo }
                Text(titulo)
                    .papel(.accion)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if !simboloDelante { glifo }
            }
            .foregroundStyle(Theme.Color.background)
            .padding(.horizontal, 22)
            .frame(maxWidth: .infinity, minHeight: Self.alto)
            .background(Theme.Color.foreground, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .accessibilityLabel(titulo)
    }

    @ViewBuilder
    private var glifo: some View {
        if let simbolo {
            Image(systemName: simbolo)
                .font(.system(size: 20, weight: .bold))
                .accessibilityHidden(true)
        }
    }
}

/// Un botón de texto de 48 pt: la salida discreta («Ya lo hice», «Correr sin conectar»). El glifo lleva el
/// acento; la palabra, la tinta del tema (el acento como texto no llega a AA con todos los clubes).
struct BotonTextoPrevia: View {
    enum Tono { case tinta, suave }

    let titulo: String
    var simbolo: String?
    var tono: Tono = .tinta
    var etiqueta: String?
    let accion: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                if let simbolo {
                    Image(systemName: simbolo)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(tono == .tinta ? Theme.Color.accentText : Theme.Color.muted)
                        .accessibilityHidden(true)
                }
                Text(titulo)
                    .papel(.notaFuerte)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(tono == .tinta ? Theme.Color.foreground : Theme.Color.muted)
            .padding(.horizontal, Theme.Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(etiqueta ?? titulo)
    }
}

/// Un botón secundario con cara de chip (48 pt, superficie elevada): «Conectar», «Gestionar», «Saltar».
struct BotonChipPrevia: View {
    let titulo: String
    var simbolo: String?
    let accion: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.xs + 2) {
                if let simbolo {
                    Image(systemName: simbolo)
                        .font(.system(size: 15, weight: .bold))
                        .accessibilityHidden(true)
                }
                Text(titulo)
                    .papel(.notaPesada)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(Theme.Color.foreground)
            .padding(.horizontal, Theme.Spacing.l)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
            .background(Theme.Color.surfaceElevated, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .accessibilityLabel(titulo)
    }
}

/// La pastilla de una zona de pulso: el punto con el color SEMÁNTICO de la zona y la zona en la tinta del
/// tema (el color de zona como texto no llega a AA sobre todas las superficies).
struct PastillaZonaPrevia: View {
    let zona: HRZone

    var body: some View {
        HStack(spacing: Theme.Spacing.xs + 2) {
            Circle().fill(zona.color).frame(width: 9, height: 9)
            Text(zona.label).papel(.notaPesada)
        }
        .foregroundStyle(Theme.Color.foreground)
        .padding(.horizontal, Theme.Spacing.m)
        .frame(minHeight: 32)
        .background(Theme.Color.surfaceSunken, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Zona \(zona.label)")
    }
}

/// Lo de la izquierda y lo de la derecha en una fila; si no caben (texto grande), uno debajo del otro. Un
/// nombre de ejercicio partido a media palabra para que quepa su dosis no se lee.
struct FilaAdaptablePrevia<Izquierda: View, Derecha: View>: View {
    var alineacion: VerticalAlignment = .firstTextBaseline
    @ViewBuilder let izquierda: () -> Izquierda
    @ViewBuilder let derecha: () -> Derecha

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: alineacion, spacing: Theme.Spacing.m) {
                izquierda()
                Spacer(minLength: Theme.Spacing.s)
                derecha()
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                izquierda()
                derecha()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// La cabecera de una pantalla previa: los botones redondos del cromo a la izquierda y, a la derecha, lo
/// que haga falta (compartir, «Bloque 2 de 3»).
struct CromoPrevia<Izquierda: View, Derecha: View>: View {
    @ViewBuilder let izquierda: () -> Izquierda
    @ViewBuilder let derecha: () -> Derecha

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            izquierda()
            Spacer(minLength: Theme.Spacing.s)
            derecha()
        }
        .padding(.horizontal, Theme.Spacing.pantalla - 4)
        .padding(.top, Theme.Spacing.s)
    }
}

/// Un botón redondo del cromo con un SF Symbol que no es un glifo del kit («chevron.left», compartir).
struct BotonCromoPrevia: View {
    let simbolo: String
    let etiqueta: String
    let accion: () -> Void

    var body: some View {
        BotonCromoDia(etiqueta: etiqueta, accion: { Haptics.light(); accion() }) {
            Image(systemName: simbolo)
                .font(.system(size: 18, weight: .semibold))
        }
    }
}

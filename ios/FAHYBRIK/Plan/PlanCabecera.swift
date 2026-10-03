import SwiftUI

// LA CABECERA DEL BLOQUE (`CabeceraDelBloque`) — el nombre del bloque que puso el coach, «Semana N de M»,
// el rango de fechas y la línea del coach para la semana. La voz del coach va marcada con su filo (el sistema
// no escribe ahí) y se corta a dos líneas; si se extiende, un toque la abre entera.
//
// Aquí vive lo que el Swift resolvía con el gesto de deslizar y no enseñaba: las flechas de semana. «›» lleva
// un candado cuando el club bloquea la semana que viene (y al tocarlo dice por qué). «‹» solo existe hojeando, y
// es también la vuelta: no hay una pastilla «Volver a esta semana» que repita lo que ya hace la flecha. Los dos
// huecos de 48 pt se reservan siempre —el título no baila al hojear— y, hojeando, las dos flechas están siempre:
// sin más semanas por delante el «›» se queda en su sitio, apagado, para que el «‹» no flote lejos del margen.

struct CabeceraPlan: View {
    /// Lo que el coach le puso al bloque. Sin él, «Tu plan».
    let nombreBloque: String?
    let titulo: String
    /// «Del 28 sep al 4 oct».
    let rango: String?
    let intencion: String?
    /// Hojeando otra semana: hay «‹», que también es la vuelta a esta semana.
    let hojeando: Bool
    /// Hay una semana más adelante que ver.
    let puedeAdelante: Bool
    /// …pero el club la bloquea: el «›» lleva candado.
    let adelanteBloqueado: Bool
    /// Mientras la semana que se mira carga: el título es real y el resto, esqueleto.
    var cargando = false
    let alAtras: () -> Void
    let alAdelante: () -> Void

    /// Lo apagado que va el «›» cuando no hay más semanas: se ve que está, y que no lleva a ningún sitio.
    private static let opacidadSinMasSemanas = 0.35

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            etiqueta
            HStack(spacing: Theme.Spacing.xs) {
                Text(titulo)
                    .papel(.saludo)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                flechas
            }
            .padding(.trailing, -Theme.Spacing.s)
            filaDelRango
            if cargando {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    SkeletonBar(height: 17, radius: 5)
                    SkeletonBar(height: 17, radius: 5).padding(.trailing, 80)
                }
                .padding(.top, Theme.Spacing.s)
            } else if let intencion {
                IntencionPlan(texto: intencion).padding(.top, Theme.Spacing.s)
            }
        }
    }

    @ViewBuilder
    private var etiqueta: some View {
        if cargando {
            SkeletonBar(width: 150, height: 15, radius: 5).frame(minHeight: 18)
        } else {
            Text(nombreBloque ?? "Tu plan")
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.accentText)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var flechas: some View {
        HStack(spacing: 0) {
            if hojeando {
                BotonCromoDia(etiqueta: "Semana anterior", accion: alAtras) { IconoDia(.atras, tam: 18, peso: .bold) }
            } else {
                Color.clear.frame(width: Theme.Size.toque, height: Theme.Size.toque)
            }
            if puedeAdelante || adelanteBloqueado {
                BotonCromoDia(
                    etiqueta: adelanteBloqueado ? "Semana siguiente, bloqueada por tu club" : "Semana siguiente",
                    accion: alAdelante
                ) { IconoDia(adelanteBloqueado ? .candado : .chevron, tam: 18, peso: .bold) }
            } else if hojeando {
                BotonCromoDia(etiqueta: "Semana siguiente: no hay más semanas", accion: {}) { IconoDia(.chevron, tam: 18, peso: .bold) }
                    .disabled(true)
                    .opacity(Self.opacidadSinMasSemanas)
            } else {
                Color.clear.frame(width: Theme.Size.toque, height: Theme.Size.toque)
            }
        }
    }

    private var filaDelRango: some View {
        Group {
            if cargando {
                SkeletonBar(width: 130, height: 15, radius: 5)
            } else if let rango {
                Text(rango)
                    .papel(.notaFuerte)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 24, alignment: .leading)
    }
}

// MARK: - La voz del coach

/// La línea del coach para ESTA semana: su filo de acento, dos líneas y, si desborda, un toque la abre entera.
/// Se mide cerrada: un texto que cabe en dos líneas no lleva gesto ni pista.
private struct IntencionPlan: View {
    let texto: String

    @State private var abierta = false
    @State private var altoCompleto: CGFloat = 0
    @State private var altoCerrado: CGFloat = 0

    private static let lineasCerrada = 2

    private var desborda: Bool { altoCompleto > altoCerrado + 1 }

    var body: some View {
        if desborda || abierta {
            Button(action: { Haptics.light(); withAnimation(Theme.Motion.reveal) { abierta.toggle() } }) {
                contenido
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .accessibilityLabel("Lo que busca tu coach esta semana: \(texto)")
            .accessibilityHint(abierta ? "Toca para cerrar" : "Toca para leerlo entero")
            .accessibilityAddTraits(.isButton)
        } else {
            contenido
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Lo que busca tu coach esta semana: \(texto)")
        }
    }

    private var contenido: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(Theme.Color.accent)
                .frame(width: 3)
            Text(texto)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(abierta ? nil : Self.lineasCerrada)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .background(alignment: .topLeading) { medidor }
            if desborda || abierta {
                GiroDia(abierto: abierta, tam: 16, peso: .bold)
                    .foregroundStyle(Theme.Color.muted)
                    .frame(maxHeight: .infinity, alignment: .bottom)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    /// Dos copias invisibles del texto —entera y cortada a dos líneas— para saber si desborda sin haber
    /// pintado el texto todavía. Miden con el ancho que recibe el texto real.
    private var medidor: some View {
        ZStack(alignment: .topLeading) {
            Text(texto).papel(.cuerpo)
                .fixedSize(horizontal: false, vertical: true)
                .background(GeometryReader { Color.clear.preference(key: AltoCompletoKey.self, value: $0.size.height) })
            Text(texto).papel(.cuerpo)
                .lineLimit(Self.lineasCerrada)
                .fixedSize(horizontal: false, vertical: true)
                .background(GeometryReader { Color.clear.preference(key: AltoCerradoKey.self, value: $0.size.height) })
        }
        .hidden()
        .onPreferenceChange(AltoCompletoKey.self) { altoCompleto = $0 }
        .onPreferenceChange(AltoCerradoKey.self) { altoCerrado = $0 }
        .accessibilityHidden(true)
    }
}

private struct AltoCompletoKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct AltoCerradoKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// La cabecera en frío: la misma silueta (etiqueta, título, rango, dos líneas de la voz del coach).
struct CabeceraPlanEsqueleto: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            SkeletonBar(width: 150, height: 15, radius: 5).frame(minHeight: 18)
            SkeletonBar(width: 220, height: 32, radius: 8).frame(minHeight: 48)
            SkeletonBar(width: 130, height: 15, radius: 5).frame(minHeight: 24)
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SkeletonBar(height: 17, radius: 5)
                SkeletonBar(height: 17, radius: 5).padding(.trailing, 80)
            }
            .padding(.top, Theme.Spacing.s)
        }
        .accessibilityHidden(true)
    }
}

#if DEBUG
#Preview("Cabecera · con voz del coach") {
    EnAmbasDia {
        CabeceraPlan(
            nombreBloque: "Bloque 2 · fuerza y ritmo", titulo: "Semana 3 de 6", rango: "Del 28 sep al 4 oct",
            intencion: "Semana fuerte: acumulamos volumen y cerramos con la simulación entera.",
            hojeando: false, puedeAdelante: true, adelanteBloqueado: false,
            alAtras: {}, alAdelante: {})
    }
}

#Preview("Cabecera · hojeando, línea larga") {
    EnAmbasDia {
        CabeceraPlan(
            nombreBloque: "Bloque 2 · fuerza, ritmo y un test en medio del bloque", titulo: "Semana que viene", rango: "Del 5 oct al 11 oct",
            intencion: "Esta semana quiero que te fíes del ritmo y no del reloj. El lunes y el martes son para asimilar la carga del bloque anterior; el jueves toca test y volumen.",
            hojeando: true, puedeAdelante: false, adelanteBloqueado: true,
            alAtras: {}, alAdelante: {})
    }
}

#Preview("Cabecera · hojeando, sin más semanas") {
    EnAmbasDia {
        CabeceraPlan(
            nombreBloque: "HYROX acumulación", titulo: "Semana 2", rango: "Del 5 oct al 11 oct",
            intencion: nil,
            hojeando: true, puedeAdelante: false, adelanteBloqueado: false,
            alAtras: {}, alAdelante: {})
    }
}

#Preview("Cabecera · cargando y en frío") {
    EnAmbasDia {
        VStack(spacing: Theme.Spacing.xl) {
            CabeceraPlan(
                nombreBloque: nil, titulo: "Semana que viene", rango: nil, intencion: nil,
                hojeando: true, puedeAdelante: false, adelanteBloqueado: false, cargando: true,
                alAtras: {}, alAdelante: {})
            CabeceraPlanEsqueleto()
        }
    }
}
#endif

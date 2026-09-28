import SwiftUI

// LA CABECERA (I5.1) — dónde estás, cuánto llevas y qué está enlazado
// (espejo de `kit-iphone-vivo/cabecera.tsx`).
//   fila 1   la POSICIÓN en palabras («Serie 3/6 · 1000 m», «A1 · Back Squat ·
//            Serie 2/4») y el crono de la sesión (o el TOTAL en un circuito).
//   fila 2   el formato en castellano de box («Series», «EMOM 12′») con la marca
//            «Test» si lo es, y los chips de enlace (reloj, GPS, máquina, pulso)
//            que se tocan para abrir Conectividad.
// Si la posición no cabe, pierde partes por el final, nunca se trunca.

enum VivoCabeceraMedida {
    /// Las partes que caben en `ancho`, quitando por el final. Siempre queda la primera.
    static func partesQueCaben(_ partes: [String], ancho: CGFloat, cuerpo: CGFloat = VivoTokens.TI.posicion, peso: Int = 700) -> [String] {
        var usadas = partes.filter { !$0.isEmpty }
        func cabe(_ x: [String]) -> Bool { Vivo.anchoTexto(x.joined(separator: " · "), cuerpo, peso: peso) <= ancho }
        while usadas.count > 1, !cabe(usadas) { usadas.removeLast() }
        return usadas
    }

    /// Lo que ocupa un chip de enlace: icono, hueco, texto y sus márgenes.
    static func anchoChip(_ texto: String, buscando: Bool) -> CGFloat {
        8 + 16 + 6 + (buscando ? 12 : 0) + Vivo.anchoTexto(texto, VivoTokens.TI.chip.cuerpo, peso: 600) + 10
    }

    static func anchoChips(_ chips: [Vivo.ChipEnlace]) -> CGFloat {
        chips.reduce(0) { $0 + anchoChip($1.texto, buscando: $1.estado == .buscando) } + 6 * CGFloat(Swift.max(0, chips.count - 1))
    }
}

struct VivoCrono: Equatable {
    var valor: String
    var etiqueta: String // «sesión» | «total»
}

struct VivoCabecera: View {
    let posicion: [String]
    /// Por partes: lo que no cabe junto a los chips se quita por el final.
    let formato: [String]
    var test = false
    let crono: VivoCrono
    let chips: [Vivo.ChipEnlace]
    var alTocarEnlace: ((Vivo.ClaveEnlace) -> Void)? = nil
    @Environment(\.vivoLienzo) private var lienzo

    var body: some View {
        let ancho = lienzo.ancho
        let anchoCrono = Vivo.anchoTexto(crono.valor, VivoTokens.TI.crono, peso: 600) + (crono.etiqueta == "total" ? 44 : 8)
        let partes = VivoCabeceraMedida.partesQueCaben(posicion, ancho: ancho - 2 * VivoTokens.margen - anchoCrono - 16)
        let formatoTexto = VivoCabeceraMedida.partesQueCaben(formato, ancho: ancho - 2 * VivoTokens.margen - VivoCabeceraMedida.anchoChips(chips) - 10,
                                                             cuerpo: VivoTokens.TI.etiqueta, peso: 600).joined(separator: " · ")
        VStack(spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(partes.joined(separator: " · "))
                    .font(.system(size: VivoTokens.TI.posicion, weight: .bold).monospacedDigit())
                    .foregroundStyle(VivoColor.tinta)
                    .lineLimit(1)
                    .layoutPriority(1)
                Spacer(minLength: 0)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if crono.etiqueta == "total" { VivoEtiqueta(texto: "total") }
                    VivoNumeral(texto: crono.valor, cuerpo: VivoTokens.TI.crono)
                }
            }
            HStack(alignment: .center, spacing: 10) {
                HStack(spacing: 8) {
                    if test {
                        Text("Test")
                            .font(.system(size: VivoTokens.TI.etiqueta, weight: .bold))
                            .foregroundStyle(VivoColor.fondo)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(VivoColor.tinta, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    } else if !formatoTexto.isEmpty {
                        VivoEtiqueta(texto: formatoTexto)
                    }
                }
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    ForEach(chips) { c in
                        VivoChip(chip: c) { alTocarEnlace?(c.clave) }
                    }
                }
            }
        }
        .padding(.horizontal, VivoTokens.margen)
        .frame(height: VivoTokens.Alto.cabecera)
    }
}

/// Los puntos de las páginas laterales (Vivo · Estructura · Mapa), bajo la cabecera.
struct VivoPuntosPaginas: View {
    let total: Int
    let activa: Int
    var body: some View {
        HStack(spacing: 6) {
            if total > 1 {
                ForEach(0..<total, id: \.self) { i in
                    Capsule().fill(i == activa ? VivoColor.tinta : VivoColor.carril)
                        .frame(width: i == activa ? 16 : 6, height: 6)
                        .animation(.easeOut(duration: 0.2), value: activa)
                }
            }
        }
        .frame(height: VivoTokens.Alto.puntos)
        .accessibilityHidden(true)
    }
}

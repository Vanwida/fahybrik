import SwiftUI

// EL SUJETO, LA BANDA Y EL TRABAJO (I5.2–I5.4) — lo que se mira (espejo de
// `kit-iphone-vivo/sujeto.tsx`).
//   VivoSujeto            el héroe a 72–176 pt, ajustado al ancho útil y al alto de
//                         SU banda, que es FIJA: el centro óptico no baila.
//   VivoBandaObjetivo     el calibre del objetivo (P3): la banda del coach, tu marca
//                         encima, ▲▼ y la palabra fuera. A zona, sobre el espectro.
//   VivoObjetivoInstruccion  el objetivo que no es un número vivo (RPE, RIR).
//   VivoTrabajo           lo que falta del paso y la dosis, a 40 pt, nunca en gris.
//   VivoCuentaAtras       LA cuenta atrás: una para todas las familias (3-2-1 y GO).
//   VivoAvisoVuelta       el km recién cerrado, unos segundos sobre el vivo.
// Qué se pinta lo deciden `Vivo.heroeDeFamilia`, `Vivo.laminaDelPaso` y
// `Vivo.trabajoDe`. Aquí solo se decide cómo.

struct VivoSujeto: View {
    let heroe: Vivo.HeroeVista
    var nota: String? = nil
    var alto: CGFloat = VivoTokens.Alto.sujeto
    var ancho: CGFloat? = nil
    @Environment(\.vivoLienzo) private var lienzo

    var body: some View {
        let util = ancho ?? VivoTokens.anchoUtil(lienzo.ancho)
        let etiqueta = heroe.etiqueta ?? heroe.zona.map { "Z\($0.n)" }
        let altoNumeral = alto - VivoTokens.TI.etiquetaSujeto.alto - (nota != nil ? 24 : 0) - 16
        let talla = Vivo.tallaHeroe(heroe.texto, unidad: heroe.unidad, ancho: util, altoMax: altoNumeral, escala: VivoTokens.TI.sujeto)
        VStack(spacing: 4) {
            ZStack {
                if let etiqueta {
                    Text(etiqueta)
                        .font(.system(size: VivoTokens.TI.etiquetaSujeto.cuerpo, weight: .semibold))
                        .foregroundStyle(heroe.zona.map(VivoColor.zona) ?? VivoColor.tinta2)
                        .lineLimit(1)
                }
            }
            .frame(height: VivoTokens.TI.etiquetaSujeto.alto)
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                VivoNumeral(texto: heroe.texto, cuerpo: talla.cuerpo)
                    .animation(.easeOut(duration: 0.24), value: talla.cuerpo)
                if let u = heroe.unidad {
                    Text(u)
                        .font(.system(size: Swift.max(VivoTokens.TI.suelo, talla.cuerpoUnidad), weight: .semibold))
                        .foregroundStyle(VivoColor.tinta2)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: util)
            .minimumScaleFactor(0.6)
            if let nota {
                VivoNota(texto: nota).frame(height: 24)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: alto)
        .padding(.horizontal, VivoTokens.margen)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - La banda del objetivo

struct VivoBandaObjetivo: View {
    let banda: Vivo.BandaVista

    var body: some View {
        let fuera = banda.veredicto != nil && banda.veredicto != .dentro
        VStack(spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                VivoEtiqueta(texto: banda.rotulo)
                Spacer(minLength: 0)
                if let p = banda.palabra {
                    Text("\(p.marca.map { "\($0) " } ?? "")\(p.texto)")
                        .font(.system(size: VivoTokens.TI.banda.palabra, weight: fuera ? .bold : .semibold))
                        .foregroundStyle(fuera ? VivoColor.tinta : VivoColor.tinta2)
                        .lineLimit(1)
                } else {
                    VivoEtiqueta(texto: "sin lectura")
                }
            }
            GeometryReader { g in
                let w = g.size.width
                let pista = VivoTokens.TI.banda.pista
                ZStack(alignment: .leading) {
                    if let z = banda.zonas {
                        HStack(spacing: 2) {
                            ForEach(Array(z.colores.enumerated()), id: \.offset) { i, c in
                                let en = i + 1 >= z.objetivo.0 && i + 1 <= z.objetivo.1
                                Rectangle().fill(VivoColor.hex(c)).opacity(en ? 1 : 0.26)
                            }
                        }
                        .frame(height: pista)
                        .clipShape(Capsule())
                    } else {
                        Capsule().fill(VivoColor.carril).frame(height: pista)
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(VivoColor.tinta2)
                            .frame(width: Swift.max(0, (banda.hasta - banda.desde) * w), height: pista)
                            .offset(x: banda.desde * w)
                    }
                    if let m = banda.marca {
                        VivoMarcaBanda(fuera: banda.veredicto == .dentro ? nil : banda.veredicto)
                            .offset(x: m * w - 9)
                            .animation(.easeOut(duration: 0.7), value: m)
                    }
                }
                .frame(height: 18)
            }
            .frame(height: 18)
        }
        .padding(.horizontal, VivoTokens.margen)
        .frame(height: VivoTokens.Alto.banda)
    }
}

private struct VivoMarcaBanda: View {
    let fuera: Vivo.Veredicto?
    var body: some View {
        Group {
            if fuera == nil {
                RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                    .fill(VivoColor.tinta)
                    .frame(width: 5, height: 18)
                    .overlay(RoundedRectangle(cornerRadius: 2.5).stroke(VivoColor.fondo, lineWidth: 2))
                    .frame(width: 18)
            } else {
                Image(systemName: fuera == .porEncima ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(VivoColor.tinta)
                    .frame(width: 18, height: 18)
            }
        }
    }
}

/// EL OBJETIVO QUE NO ES UN NÚMERO VIVO (P3): ocupa la fila de la banda con el
/// rótulo «objetivo» y la instrucción («RPE 8 · fuerte»).
struct VivoObjetivoInstruccion: View {
    let texto: String
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VivoEtiqueta(texto: "objetivo")
            Spacer(minLength: 0)
            Text(texto)
                .font(.system(size: VivoTokens.TI.posicion, weight: .bold))
                .foregroundStyle(VivoColor.tinta)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, VivoTokens.margen)
        .frame(height: VivoTokens.Alto.banda)
    }
}

// MARK: - El trabajo

/// LO QUE DE VERDAD HACES (§10.6): a 40 pt y en tinta, nunca en gris. `extra`: «+30 s» en el descanso.
struct VivoTrabajo<Extra: View>: View {
    let trabajo: Vivo.TrabajoVista
    @ViewBuilder var extra: () -> Extra

    init(trabajo: Vivo.TrabajoVista, @ViewBuilder extra: @escaping () -> Extra = { EmptyView() }) {
        self.trabajo = trabajo
        self.extra = extra
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VivoEtiqueta(texto: trabajo.etiqueta)
                if trabajo.texto {
                    // «1:52–1:56» no se parte por el guion: el rango viaja entero a la
                    // línea siguiente. Es cosa del pintor; el dato sigue limpio.
                    Text(trabajo.valor.replacingOccurrences(of: "–", with: "\u{2060}–\u{2060}"))
                        .font(.system(size: VivoTokens.TI.datoTexto + 4, weight: .bold))
                        .foregroundStyle(VivoColor.tinta)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                } else {
                    VivoNumeral(texto: trabajo.valor, cuerpo: VivoTokens.TI.trabajo)
                }
                if let u = trabajo.unidad { VivoEtiqueta(texto: u) }
            }
            Spacer(minLength: 0)
            extra()
        }
        .padding(.horizontal, VivoTokens.margen)
        .frame(minHeight: VivoTokens.Alto.trabajo)
    }
}

// MARK: - LA cuenta atrás (una para todas las familias)

/// 3-2-1 y GO a pantalla completa antes de un paso de trabajo. `n = 0` es el GO.
struct VivoCuentaAtras: View {
    let n: Int
    let paso: Vivo.Paso

    var body: some View {
        let contexto = Vivo.posicionDe(paso)
        let o = Vivo.principal(paso)
        let obj = o.map { Vivo.fmtObjetivo($0, paso.maquina) }
        let nombre: String? = (paso.nombre != nil && !contexto.contains { $0.contains(paso.nombre!) }) ? paso.nombre : nil
        let contra = [nombre, obj != nil && !contexto.contains(obj!) ? "a \(obj!)" : nil].compactMap { $0 }.joined(separator: " · ")
        VStack(spacing: 18) {
            Text(contexto.joined(separator: " · "))
                .font(.system(size: VivoTokens.TI.posicion, weight: .bold))
                .foregroundStyle(VivoColor.tinta2)
                .multilineTextAlignment(.center)
            Text(n > 0 ? String(n) : "GO")
                .font(VivoTokens.Numeral.fuente(n > 0 ? 200 : 160, peso: .bold))
                .foregroundStyle(VivoColor.tinta)
                .contentTransition(.numericText())
            if !contra.isEmpty {
                Text(contra)
                    .font(.system(size: VivoTokens.TI.posicion, weight: .semibold))
                    .foregroundStyle(VivoColor.tinta)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, VivoTokens.margen)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(VivoColor.fondo)
        .transition(.opacity)
    }
}

/// El km recién cerrado, unos segundos sobre el vivo. Sin háptico propio: ya vibró la vuelta.
struct VivoAvisoVuelta: View {
    let titulo: String
    let valor: String
    let pie: String
    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                VivoEtiqueta(texto: titulo)
                VivoEtiqueta(texto: pie, tono: VivoColor.tinta)
            }
            Spacer()
            VivoNumeral(texto: valor, cuerpo: 44)
        }
        .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 16)
        .background(VivoColor.superficie2, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(0.6), radius: 20, y: 18)
        .padding(.horizontal, VivoTokens.margen)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

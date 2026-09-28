import SwiftUI

// EL DESCANSO COMÚN (I7) — la misma fase en fuerza, circuito, ergo y entre
// tandas (espejo de `kit-iphone-vivo/descanso.tsx`): la cuenta atrás como héroe,
// «Viene: …» con su objetivo, «+30 s», «Empezar ya».
//
// En fuerza, el descanso es donde se ANOTA la serie (patrón Hevy / Strong):
// reps · kg · RIR prerrellenados con lo prescrito, se toca el dato y UN par de ±
// grandes lo mueve; un toque para confirmar. Lo prerrellenado (gris, «sin
// confirmar») no cuenta como declarado hasta confirmarlo (`Vivo.anotacionDe`).

/// «+30 s» en la fila del trabajo del descanso: superficie, 44 pt.
struct VivoMas30: View {
    let accion: () -> Void
    var body: some View {
        VivoBoton(etiqueta: "+30 s", variante: .superficie, alto: VivoTokens.TI.botonMenor.alto, ancho: 78, accion: accion)
    }
}

// MARK: - Anotar la serie

struct VivoSerieAnotable: Equatable, Identifiable {
    var paso: Vivo.Paso
    var anot: Vivo.Anotacion
    var id: String { paso.id }
}

struct VivoFoco: Equatable {
    var id: String
    var campo: Vivo.CampoAnotar
}

/// Un dato de la serie: valor + unidad en una píldora; encendido (borde naranja = control activo) si es el que mueve el ±.
private struct VivoDato: View {
    let valor: Double?
    let unidad: String
    let estado: Vivo.EstadoDato
    let activo: Bool
    let alPulsar: () -> Void

    var body: some View {
        let declarado = estado != .propuesto
        Button(action: alPulsar) {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                VivoNumeral(texto: Vivo.fmtValor(valor), cuerpo: 22, tono: declarado ? VivoColor.tinta : VivoColor.tinta2)
                VivoEtiqueta(texto: unidad, tono: declarado ? VivoColor.tinta : VivoColor.tinta2)
            }
            .padding(.horizontal, 12)
            .frame(height: VivoTokens.TI.botonMenor.alto)
            .background(VivoColor.superficie2, in: RoundedRectangle(cornerRadius: VivoTokens.Radio.boton, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: VivoTokens.Radio.boton, style: .continuous).stroke(activo ? VivoColor.accion : .clear, lineWidth: 2))
        }
        .buttonStyle(VivoPulsarStyle())
        .accessibilityAddTraits(activo ? .isSelected : [])
    }
}

/// LA SERIE RECIÉN HECHA, para anotarla en el propio descanso. Una tarjeta por
/// serie de la ronda (dos en una superserie). Gris = propuesto («sin
/// confirmar»); tinta = declarado («✓ 8 × 125 kg · RIR 3»). Confirmar es la
/// acción primaria de la franja; aquí solo se cambian datos.
struct VivoAnotarSerie: View {
    let series: [VivoSerieAnotable]
    @Binding var foco: VivoFoco?
    let alCambiar: (Vivo.Paso, Vivo.CampoAnotar, Int) -> Void

    var body: some View {
        VStack(spacing: 8) {
            ForEach(series) { s in
                let f = s.paso.fuerza
                let pendiente = Vivo.pendiente(s.anot)
                let nombre = [s.paso.posicion?.slot, s.paso.nombre].compactMap { $0 }.joined(separator: " · ")
                VivoSuperficie(padding: 12) {
                    VStack(spacing: 8) {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(nombre).font(.system(size: VivoTokens.TI.datoTexto, weight: .bold)).foregroundStyle(VivoColor.tinta).lineLimit(1)
                            Spacer(minLength: 0)
                            Text(pendiente ? "sin confirmar" : "✓ \(f.map { Vivo.textoAnotacion(s.anot, $0) } ?? "")")
                                .font(.system(size: VivoTokens.TI.etiqueta, weight: .semibold))
                                .foregroundStyle(pendiente ? VivoColor.tinta2 : VivoColor.tinta)
                                .lineLimit(1)
                        }
                        HStack(spacing: 6) {
                            VivoDato(valor: s.anot.reps.valor, unidad: "reps", estado: s.anot.reps.estado, activo: activo(s, .reps)) { foco = VivoFoco(id: s.id, campo: .reps) }
                            if let kg = s.anot.kg {
                                VivoDato(valor: kg.valor, unidad: "kg", estado: kg.estado, activo: activo(s, .kg)) { foco = VivoFoco(id: s.id, campo: .kg) }
                            }
                            if let e = s.anot.esfuerzo, let fe = f?.esfuerzo {
                                VivoDato(valor: e.valor, unidad: fe.eje == .rir ? "RIR" : "RPE", estado: e.estado, activo: activo(s, .esfuerzo)) { foco = VivoFoco(id: s.id, campo: .esfuerzo) }
                            }
                            Spacer(minLength: 0)
                            HStack(spacing: 6) {
                                VivoBotonRedondo(nombre: "menos", talla: VivoTokens.TI.botonMenor.alto, accion: { mover(s, -1) }) { VivoIcono(sistema: "minus", talla: 20, peso: .bold) }
                                VivoBotonRedondo(nombre: "más", talla: VivoTokens.TI.botonMenor.alto, accion: { mover(s, 1) }) { VivoIcono(sistema: "plus", talla: 20, peso: .bold) }
                            }
                        }
                    }
                }
            }
        }
        .onAppear {
            if foco == nil, let primera = series.first { foco = VivoFoco(id: primera.id, campo: primera.anot.kg != nil ? .kg : .reps) }
        }
    }

    private func activo(_ s: VivoSerieAnotable, _ campo: Vivo.CampoAnotar) -> Bool { foco?.id == s.id && foco?.campo == campo }

    private func mover(_ s: VivoSerieAnotable, _ dir: Int) {
        let campo: Vivo.CampoAnotar = foco?.id == s.id ? (foco?.campo ?? .reps) : (s.anot.kg != nil ? .kg : .reps)
        if foco?.id != s.id { foco = VivoFoco(id: s.id, campo: campo) }
        alCambiar(s.paso, campo, dir)
    }
}

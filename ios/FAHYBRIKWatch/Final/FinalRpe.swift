import SwiftUI

// EL RPE EN LA CORONA — «¿Cómo de dura ha sido?» (P13). De 0 a 10 con las palabras del coach (dato con defecto,
// `WristMethod.rpeWords`); también va a Salud como esfuerzo del entreno. Se puede saltar.
//
// Empieza en «—»: el número es del atleta, no una sugerencia que lo ancle. La primera muesca hacia arriba da 1 y
// hacia abajo 0; de ahí, una muesca un punto. El 0 («nada») se queda en la sesión como «sin RPE» y no va a Salud
// (su esfuerzo y el servidor van de 1 a 10): la pantalla lo dice.
//
// Solo con aparato: hacia dónde suma la corona y su sensibilidad.

struct FinalRpe: View {
    /// La palabra de cada RPE (0…10).
    let palabra: (Int) -> String
    /// El RPE elegido, o `nil` si lo salta.
    let alResponder: (Int?) -> Void

    @State private var elegido: Int?
    /// Un valor que solo sirve para contar muescas: el sentido lo da el signo de la diferencia.
    @State private var muescas: Double = 0

    private static let topeRpe = FinalForma.marcasRpe - 1

    var body: some View {
        MunecaMedidor { medidas in
            MunecaColumna {
                Text("¿Cómo de dura ha sido?")
                    .font(MunecaTipo.contexto(Vivo.TipoMuneca.contexto))
                    .foregroundStyle(MunecaPaleta.tinta2)
                    .lineLimit(1)
                    .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.contexto))
                    .frame(height: CGFloat(Vivo.Fila.contexto.alto))
                Spacer(minLength: 0)
                Text(elegido.map(String.init) ?? "—")
                    .font(MunecaTipo.fuente(Double(cifra(medidas)), 600))
                    .foregroundStyle(elegido == nil ? MunecaPaleta.tinta2 : MunecaPaleta.tinta)
                    .accessibilityLabel(elegido.map { "RPE \($0), \(palabra($0))" } ?? "Sin elegir")
                escala
                Text(elegido.map(palabra) ?? "gira la corona")
                    .font(MunecaTipo.fuente(Vivo.TipoMuneca.instruccion, 600))
                    .foregroundStyle(elegido == nil ? MunecaPaleta.tinta2 : MunecaPaleta.tinta)
                    .lineLimit(1)
                    .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.instruccion))
                    .frame(height: CGFloat(Vivo.Fila.instruccion.alto))
                FinalNota(texto: elegido == 0 ? "0 no va a Salud (1–10)" : "También a Salud · esfuerzo")
                Spacer(minLength: 0)
                botones
            }
        }
        .background(MunecaPaleta.fondo.ignoresSafeArea())
        .focusable(true)
        .digitalCrownRotation($muescas, from: -FinalForma.recorridoCorona, through: FinalForma.recorridoCorona, by: 1,
                              sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: true)
        .onChange(of: muescas) { antes, ahora in
            if ahora != antes { girar(ahora > antes ? 1 : -1) }
        }
    }

    /// La cifra ocupa lo que dejan las demás filas: 60 pt a 46 mm y menos en un reloj más bajo, sin pasar de 36.
    private func cifra(_ medidas: Vivo.MedidasMuneca) -> CGFloat {
        let filas = Vivo.Fila.contexto.alto + Vivo.Fila.instruccion.alto + Vivo.Fila.nota.alto + Vivo.Fila.boton.alto
            + Double(FinalForma.altoEscala) + Vivo.huecoFila * 5
        return Swift.max(FinalForma.cifraMinima, Swift.min(FinalForma.cifraRpe, CGFloat(medidas.altoUtil - filas)))
    }

    private func girar(_ dir: Int) {
        guard let actual = elegido else {
            elegido = dir > 0 ? 1 : 0
            return
        }
        elegido = Swift.min(Self.topeRpe, Swift.max(0, actual + dir))
    }

    /// Once marcas: llenas hasta el RPE elegido.
    private var escala: some View {
        HStack(spacing: FinalForma.huecoEscala) {
            ForEach(0..<FinalForma.marcasRpe, id: \.self) { i in
                RoundedRectangle(cornerRadius: FinalForma.radioMarca, style: .continuous)
                    .fill(elegido.map { i <= $0 } == true ? MunecaPaleta.tinta : MunecaPaleta.carril)
            }
        }
        .frame(height: FinalForma.altoEscala)
        .padding(.horizontal, FinalForma.aireEscala)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var botones: some View {
        if let elegido {
            FinalBotones(secundario: "Saltar", primario: "Hecho",
                         alSecundario: { alResponder(nil) }, alPrimario: { alResponder(elegido) })
        } else {
            MunecaBoton(titulo: "Saltar", variante: .superficie) { alResponder(nil) }
                .padding(.horizontal, 4)
                .frame(height: MunecaForma.altoBoton)
        }
    }
}

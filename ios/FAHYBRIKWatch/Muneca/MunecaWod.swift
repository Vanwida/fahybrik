import SwiftUI

// LO QUE EL WOD PINTA Y LA CARA COMÚN NO: la campana de un AMRAP y las marcas de ronda del Tabata
// (`Vivo.CaraPuntuacion`, `Vivo.MarcasRonda`). Espejo de `screens/reloj-wod/piezas.tsx` y de `kit-reloj/puntuacion.tsx`.
// Ninguna decide nada: el núcleo ya trae qué se dice, la talla del héroe y qué queda por decir.

// MARK: - Una marca por ronda

/// Las rondas del Tabata: las hechas en tinta2, la de ahora en tinta y las que faltan en contorno (como la Estructura).
struct MunecaMarcas: View {
    let marcas: Vivo.MarcasRonda

    var body: some View {
        HStack(spacing: MunecaForma.marcaRondaAire) {
            ForEach(0..<marcas.total, id: \.self) { k in
                Circle()
                    .fill(relleno(k))
                    .overlay(Circle().stroke(MunecaPaleta.tinta2, lineWidth: k > marcas.hechas || (k == marcas.hechas && !marcas.ahora) ? MunecaForma.contornoMarca : 0))
                    .frame(width: MunecaForma.marcaRonda, height: MunecaForma.marcaRonda)
            }
        }
        .frame(height: CGFloat(Vivo.Fila.pista.alto))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(marcas.hechas) de \(marcas.total) rondas hechas")
    }

    private func relleno(_ k: Int) -> Color {
        if k < marcas.hechas { return MunecaPaleta.tinta2 }
        return (k == marcas.hechas && marcas.ahora) ? MunecaPaleta.tinta : .clear
    }
}

// MARK: - La campana

/// La puntuación del AMRAP: «7 + 18» con las rondas (contadas en vivo) en tinta y el «+» y las reps en tinta2 hasta
/// que se dicen. Sin decir es «—», nunca 0. Las reps las gira la corona (`MunecaVivo`), y se guardan con la acción
/// del momento.
struct MunecaPuntuacion: View {
    let cara: Vivo.CaraPuntuacion

    var body: some View {
        MunecaColumna {
            MunecaContexto(linea: cara.contexto)
            MunecaCentro { heroe }
            ForEach(Array(cara.notas.enumerated()), id: \.offset) { k, nota in
                MunecaNota(nota: nota, tono: (k == 0 && cara.rondas != nil && (cara.reps ?? 0) > 0) ? MunecaPaleta.tinta : MunecaPaleta.tinta2)
            }
            MunecaNota(nota: cara.pista)
            if let pulso = cara.pulso { MunecaLinea(linea: pulso) }
        }
    }

    /// Un movimiento: las reps con su nombre encima. Varios: rondas + reps en tres piezas.
    @ViewBuilder
    private var heroe: some View {
        if let rondas = cara.rondas {
            let talla = cara.heroe.talla
            VStack(spacing: 0) {
                Text(cara.heroe.vista.etiqueta ?? "")
                    .font(MunecaTipo.nota)
                    .foregroundStyle(MunecaPaleta.tinta2)
                    .frame(height: CGFloat(Vivo.Fila.etiquetaHeroe.alto))
                Text("\(Text("\(rondas)").foregroundStyle(MunecaPaleta.tinta))\(Text(" + ").foregroundStyle(MunecaPaleta.tinta2))\(Text(cara.reps.map(String.init) ?? "—").foregroundStyle(cara.reps == nil ? MunecaPaleta.tinta2 : MunecaPaleta.tinta))")
                    .font(MunecaTipo.fuente(talla.cuerpo, Vivo.escalaMuneca.peso))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(height: CGFloat(talla.cuerpo * Vivo.escalaMuneca.caja))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(rondas) rondas y \(cara.reps.map(String.init) ?? "sin decir") repeticiones")
        } else {
            MunecaHeroe(heroe: cara.heroe, tono: cara.reps == nil ? MunecaPaleta.tinta2 : MunecaPaleta.tinta)
        }
    }
}

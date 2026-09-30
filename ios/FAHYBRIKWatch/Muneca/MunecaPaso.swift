import SwiftUI

// LA PÁGINA PASO — una cara por lo que haces (modelo §5), pintada desde
// `Vivo.CaraMuneca`. Espejo de `kit-reloj/pasos.tsx`.
//
//   .paso        contexto, nota, héroe según el objetivo (P3), banda con su
//                marca ▲▼, instrucción, lo que falta, la otra métrica.
//   .recupera    monocromo: la cuenta atrás, «Luego · …», la pista de la acción
//                y el pulso bajando.
//   .descanso    la fase común (P8): cuenta atrás, «Viene: …», +30 s y Empezar ya.
//   .completada  «Sesión completada».
//
// La vista NO decide nada: ni qué número manda, ni qué fila sobra, ni si hay
// tinte. TOCAR LA PANTALLA NO CIERRA NADA: esta cara no lleva ningún gesto (el
// doble toque cuelga de `MunecaVivo`, que es quien conoce la acción del momento).

struct MunecaPaso: View {
    let cara: Vivo.CaraMuneca
    /// «+30 s» del descanso. `nil` = el motor no puede estirarlo: el botón no se enseña.
    var alMas30: (() -> Void)? = nil
    /// El botón de «Empezar ya» del descanso (la misma acción que el doble toque).
    var alEmpezarYa: () -> Void = {}
    /// La acción del momento (la del doble toque): el botón «Confirmar» del descanso que anota.
    var alPrimaria: () -> Void = {}
    /// Lo que se puede hacer sobre la anotación; `nil` = nada.
    var anotar: MunecaAnotar? = nil

    var body: some View {
        switch cara {
        case let .paso(c): paso(c)
        case let .recupera(c): recupera(c)
        case let .descanso(c): descanso(c)
        case let .serie(c): MunecaSerie(cara: c)
        case let .colocate(c): MunecaColocate(cara: c)
        case let .anotar(c): MunecaAnotarCara(cara: c, anotar: anotar, alMas30: alMas30, alPrimaria: alPrimaria)
        case .completada: MunecaCompletada()
        }
    }

    // MARK: - El paso de correr

    private func paso(_ c: Vivo.CaraPaso) -> some View {
        MunecaColumna {
            MunecaContexto(linea: c.contexto)
            // La nota va ARRIBA, bajo el contexto: abajo las esquinas dejan ~160 pt
            // y una nota de honestidad no puede quedarse a medias.
            if let nota = c.nota { MunecaNota(nota: nota) }
            MunecaCentro { MunecaHeroe(heroe: c.heroe) }
            if let banda = c.banda { MunecaBandaObjetivo(banda: banda) }
            if let instruccion = c.instruccion { MunecaInstruccion(linea: instruccion) }
            if let tope = c.tope { MunecaNota(nota: tope) }
            if let segundo = c.segundo { MunecaLinea(linea: segundo) }
            if let pista = c.pista { MunecaNota(nota: pista) }
            if let tercero = c.tercero { MunecaLinea(linea: tercero) }
        }
    }

    // MARK: - Recuperación: monocromo

    private func recupera(_ c: Vivo.CaraRecupera) -> some View {
        MunecaColumna {
            MunecaContexto(linea: c.contexto)
            MunecaCentro { MunecaHeroe(heroe: c.heroe) }
            if let luego = c.luego { MunecaNota(nota: luego, tono: MunecaPaleta.tinta) }
            // La pista va encima del pulso: la última fila es la más estrecha (esquinas).
            MunecaNota(nota: c.pista)
            if let pulso = c.pulso { MunecaLinea(linea: pulso) }
        }
    }

    // MARK: - Descanso común

    private func descanso(_ c: Vivo.CaraDescanso) -> some View {
        MunecaColumna {
            MunecaContexto(linea: c.contexto)
            MunecaCentro { MunecaHeroe(heroe: c.heroe) }
            if let pulso = c.pulso { MunecaLinea(linea: pulso) }
            // Fuerza: la serie ya anotada en una píldora que se reabre, y lo que viene en dos partes (qué y dosis).
            if let hueco = c.hueco { MunecaPildora(pildora: hueco) { anotar?.abrir(0) } }
            if let viene = c.viene { MunecaNota(nota: viene, tono: MunecaPaleta.tinta) }
            if let viene = c.vieneFuerza { MunecaViene(viene: viene) }
            botones(c.acciones)
        }
    }

    private func botones(_ acciones: [Vivo.AccionDeCara]) -> some View {
        HStack(spacing: MunecaForma.huecoBotones) {
            ForEach(acciones, id: \.rawValue) { accion in
                switch accion {
                case .mas30s:
                    if let alMas30 {
                        MunecaBoton(titulo: accion.rawValue, variante: .superficie, accion: alMas30)
                            .frame(minWidth: MunecaForma.anchoMas30Minimo, maxWidth: MunecaForma.anchoMas30)
                    }
                case .empezarYa, .confirmar, .listo:
                    MunecaBoton(titulo: accion.rawValue, accion: accion == .empezarYa ? alEmpezarYa : alPrimaria)
                        .frame(maxWidth: MunecaForma.anchoEmpezarYa)
                        .layoutPriority(1)
                }
            }
        }
        .padding(.horizontal, 4)
        .frame(height: CGFloat(Vivo.Fila.boton.alto))
    }
}

// MARK: - Sesión completada

/// La sesión acabó sola. El sello y la frase; lo que se guardó y cómo (la
/// completitud) es del final que viene detrás.
struct MunecaCompletada: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(MunecaPaleta.tinta)
                .accessibilityHidden(true)
            Text("Sesión completada")
                .font(MunecaTipo.fuente(Vivo.TipoMuneca.tercero, 600))
                .foregroundStyle(MunecaPaleta.tinta)
                .lineLimit(1)
                .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.tercero))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, CGFloat(Vivo.MedidasMuneca.ladoSafe))
        .accessibilityElement(children: .combine)
    }
}

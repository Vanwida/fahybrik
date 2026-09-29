import SwiftUI

// LAS PIEZAS DE LA FAMILIA WOD — lo que el WOD mete en la franja elástica,
// sobre las celdas (espejo de `kit-iphone-vivo/lista.tsx` y `puntuacion.tsx`).
//   VivoListaAlrededor     la lista ±1 del chipper: lo que acabas de hacer con su
//                          tiempo, lo que viene y cuántas quedan. Nunca desborda.
//   VivoAnotarPuntuacion   la puntuación del AMRAP en la campana: [5 rondas]
//                          [— reps] y UN par de ± grandes; lo no dicho es «—».
// Qué se pinta lo deciden `Vivo.alrededorDe`, `Vivo.textoEstacion` y
// `Vivo.textoPuntuacion`. Aquí solo se decide cómo.

/// Lo que la familia WOD pone sobre las celdas, decidido en `VivoIphoneCuadro`.
enum VivoApoyoWod: Equatable {
    /// El chipper: la ventana ±1 alrededor de la estación. Quita «Luego» (ya lo dice).
    case lista(Vivo.AlrededorVista)
    /// La campana del AMRAP: la puntuación que se está diciendo.
    case puntuacion(Vivo.Dial, tareas: [Vivo.Tarea], foco: Vivo.CampoPuntuacion)

    /// Cuántas celdas quedan debajo y si van compactas (etiqueta y valor en fila).
    var celdas: Int { if case .lista = self { return 4 } else { return 2 } }
    var compacta: Bool { if case .lista = self { return true } else { return false } }
    /// «Luego» sobra cuando el apoyo ya dice lo que viene (un dato, un sitio).
    var quitaLuego: Bool { if case .lista = self { return true } else { return false } }
}

/// Un gesto guionizado (espejo del `guion` de `kit-iphone-vivo/Vivo.tsx`): a los
/// `en` segundos de montar, el vivo lo hace por el mismo camino que el dedo.
/// Solo lo usan las capturas; la app no guioniza nada.
struct VivoGestoGuion: Equatable {
    enum Gesto: Equatable {
        case primaria
        /// Los ± de la puntuación: mueve el dato enfocado `delta` de golpe.
        case puntuacion(Int)
        /// Mantener Parar: abre la hoja de terminar (con sus salidas).
        case parar
        /// Pausa / Reanudar de la franja (la pausa del atleta, que se reanuda sola).
        case pausa
    }
    var en: TimeInterval
    var gesto: Gesto
}

// MARK: - La lista ±1

private enum VivoLista {
    static let altoFila: CGFloat = 28
    static let anchoEtiqueta: CGFloat = 48
}

private struct VivoFilaLista: View {
    let etiqueta: String
    let texto: String
    var hecha = false
    var tiempo: String? = nil

    var body: some View {
        HStack(spacing: 10) {
            VivoEtiqueta(texto: etiqueta).frame(minWidth: VivoLista.anchoEtiqueta, alignment: .leading)
            Text(texto)
                .font(.system(size: VivoTokens.TI.cuerpo, weight: .semibold))
                .foregroundStyle(hecha ? VivoColor.tinta2 : VivoColor.tinta)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let tiempo { VivoNumeral(texto: tiempo, cuerpo: VivoTokens.TI.cuerpo, tono: VivoColor.tinta2) }
        }
        .frame(height: VivoLista.altoFila)
    }
}

/// LA VENTANA ALREDEDOR DE LA ESTACIÓN: «hecha · 50 Double Under · 1:02»,
/// «luego · 30 cal Row», «+7 más · 1 hecha antes». Tocar abre la Estructura.
struct VivoListaAlrededor: View {
    let alrededor: Vivo.AlrededorVista
    let alAbrir: () -> Void

    var body: some View {
        let a = alrededor
        let resto = [a.masAdelante > 0 ? "+\(a.masAdelante) más" : a.siguiente != nil ? "la última después" : "es la última",
                     a.masAtras > 0 ? "\(a.masAtras) \(a.masAtras == 1 ? "hecha" : "hechas") antes" : nil]
            .compactMap { $0 }.joined(separator: " · ")
        Button(action: alAbrir) {
            VivoSuperficie(padding: 10) {
                VStack(spacing: 0) {
                    if let ant = a.anterior {
                        VivoFilaLista(etiqueta: "hecha", texto: Vivo.textoEstacion(ant.paso, conCarga: false), hecha: true,
                                      tiempo: ant.segundos.map { Vivo.fmtReloj($0) })
                    } else {
                        VivoFilaLista(etiqueta: "primera", texto: "es la primera estación", hecha: true)
                    }
                    if let sig = a.siguiente {
                        VivoFilaLista(etiqueta: "luego", texto: Vivo.textoEstacion(sig))
                    } else {
                        VivoFilaLista(etiqueta: "luego", texto: "nada: esta es la última")
                    }
                    HStack(spacing: 10) {
                        VivoEtiqueta(texto: resto)
                        Spacer(minLength: 0)
                        VivoEtiqueta(texto: "todas ›", tono: VivoColor.tinta)
                    }
                    .frame(height: VivoLista.altoFila)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ver todas las estaciones")
    }
}

// MARK: - La puntuación del AMRAP

/// Un dato de la puntuación: valor + unidad en una píldora; borde naranja si es el que mueven los ±.
private struct VivoDatoPuntuacion: View {
    let valor: String
    let unidad: String
    let activo: Bool
    let dicho: Bool
    let alPulsar: () -> Void

    var body: some View {
        Button(action: alPulsar) {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                VivoNumeral(texto: valor, cuerpo: 22, tono: dicho ? VivoColor.tinta : VivoColor.tinta2)
                VivoEtiqueta(texto: unidad, tono: dicho ? VivoColor.tinta : VivoColor.tinta2)
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

/// LA TARJETA DE LA PUNTUACIÓN: [5 rondas] [— reps] y los ±; arriba, dónde te
/// quedaste. Con un solo movimiento no hay rondas: solo las reps. Guardar es la
/// acción primaria de la franja; aquí solo se mueven datos.
struct VivoAnotarPuntuacion: View {
    let dial: Vivo.Dial
    let tareas: [Vivo.Tarea]
    let foco: Vivo.CampoPuntuacion
    let alFoco: (Vivo.CampoPuntuacion) -> Void
    let alMover: (Int) -> Void

    var body: some View {
        let conRondas = tareas.count > 1
        VivoSuperficie(padding: 12) {
            VStack(spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("Puntuación").font(.system(size: VivoTokens.TI.datoTexto, weight: .bold)).foregroundStyle(VivoColor.tinta).lineLimit(1)
                    Spacer(minLength: 0)
                    VivoEtiqueta(texto: Vivo.textoPuntuacion(dial, tareas), tono: dial.reps == nil ? VivoColor.tinta2 : VivoColor.tinta)
                }
                HStack(spacing: 6) {
                    if conRondas {
                        VivoDatoPuntuacion(valor: String(dial.rondas), unidad: dial.rondas == 1 ? "ronda" : "rondas", activo: foco == .rondas, dicho: true) { alFoco(.rondas) }
                    }
                    VivoDatoPuntuacion(valor: dial.reps.map(String.init) ?? "—", unidad: "reps", activo: foco == .reps, dicho: dial.reps != nil) { alFoco(.reps) }
                    Spacer(minLength: 0)
                    HStack(spacing: 6) {
                        VivoBotonRedondo(nombre: "menos", talla: VivoTokens.TI.botonMenor.alto, accion: { alMover(-1) }) { VivoIcono(sistema: "minus", talla: 20, peso: .bold) }
                        VivoBotonRedondo(nombre: "más", talla: VivoTokens.TI.botonMenor.alto, accion: { alMover(1) }) { VivoIcono(sistema: "plus", talla: 20, peso: .bold) }
                    }
                }
            }
        }
    }
}

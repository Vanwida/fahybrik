import SwiftUI

// LOS ESTADOS DE LA ENTRADA — lo que se ve cuando no hay nada que empezar o hay algo
// que decidir antes: sin sesión, hecho hoy, entreno sin guardar y cómo llegas.
//
// La misma información y el mismo comportamiento de siempre, en el lenguaje del lienzo
// (`EntradaTipo`): contexto de 16 pt en gris, una escala por papel, el naranja solo en
// la acción, y la muñeca bajada sin rellenos ni tintes.

// MARK: - Sin sesión

/// Aún no ha llegado nada del iPhone.
struct EntradaSinPlanView: View {
    var body: some View {
        EntradaPagina(espacio: EntradaTipo.huecoFilas) {
            Image(systemName: "iphone.gen3")
                .font(.system(size: EntradaTipo.segundo))
                .foregroundStyle(WatchTheme.dim)
                .accessibilityHidden(true)
            Text("Abre \(Marca.nombre) en el iPhone")
                .font(.entrada(EntradaTipo.linea))
                .foregroundStyle(WatchTheme.ink)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text("Tu entreno aparecerá aquí.")
                .font(.entrada(EntradaTipo.nota, .medium))
                .foregroundStyle(WatchTheme.dim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Hecho hoy

/// La sesión de hoy ya está guardada. «completa» = el sello con su marca; «parcial»
/// (un Terminar antes de tiempo) = medio anillo, y las dos lo dicen con palabras.
struct EntradaHechoView: View {
    let title: String
    /// "full" | "partial", tal cual llega del final. Nil (un push viejo) se lee completa.
    let completeness: String?
    /// «DOBLES · con {nombre}», o nil para una sesión individual.
    var doublesBadge: String? = nil

    private var esParcial: Bool { completeness == WorkoutCompleteness.partial.rawValue }

    var body: some View {
        EntradaPagina(espacio: EntradaTipo.hueco) {
            EntradaSello(parcial: esParcial)
            EntradaContexto(partes: ["Hecho hoy"])
            Text(title)
                .font(.entrada(EntradaTipo.linea))
                .foregroundStyle(WatchTheme.ink)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(EntradaTipo.escalaSuelo)
            if let doublesBadge {
                EntradaDobles(texto: doublesBadge)
            }
            Text(esParcial ? "Sesión parcial registrada" : "Sesión completada")
                .font(.entrada(EntradaTipo.nota, .medium))
                .foregroundStyle(WatchTheme.dim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Entreno sin guardar (retomar)

/// Hay una copia reciente de un entreno que se cortó a mitad: retomarlo (sus vueltas y
/// su tiempo sobreviven a que el sistema mate la app) o descartarlo.
struct EntradaReanudarView: View {
    let title: String
    let onResume: () -> Void
    let onDiscard: () -> Void

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: EntradaTipo.huecoFilas) {
                EntradaContexto(partes: ["Entreno sin guardar"])
                Text(title)
                    .font(.entrada(EntradaTipo.linea))
                    .foregroundStyle(WatchTheme.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(EntradaTipo.escalaSuelo)
                Text("Se cortó a mitad. ¿Retomarlo?")
                    .font(.entrada(EntradaTipo.nota, .medium))
                    .foregroundStyle(WatchTheme.dim)
                    .multilineTextAlignment(.center)
                EntradaBoton(titulo: "Reanudar entreno", accion: onResume)
                EntradaBoton(
                    titulo: "Descartar",
                    estilo: .superficie,
                    etiquetaAccesible: "Descartar el entreno sin guardar",
                    accion: onDiscard
                )
                EntradaVersion()
                }
                .padding(.horizontal, EntradaTipo.lado)
                .padding(.top, geo.safeAreaInsets.top)
                .padding(.bottom, EntradaTipo.safeAbajo)
            }
            .ignoresSafeArea(.container, edges: [.top, .bottom])
        }
        .background(WatchTheme.bg.ignoresSafeArea())
    }
}

// MARK: - Cómo llegas

/// La puntuación de hoy y lo que más pesa. Solo se enseña con una puntuación real: sin
/// ella el flujo la salta (honesto, sin datos falsos). El color de la cifra es el del
/// tramo (verde, ámbar, rojo) y con la muñeca bajada pasa a tinta.
struct EntradaComoLlegasView: View {
    let score: Int
    var delta7d: Int? = nil
    var worstDriver: String? = nil

    @Environment(\.isLuminanceReduced) private var atenuado

    var body: some View {
        // El héroe se ajusta al alto de la caja (en un 40 mm, la puntuación de 76 pt se
        // comía lo que más pesa): una fracción del lienzo, con el techo del modelo.
        GeometryReader { geo in
            pagina(heroe: min(EntradaTipo.heroe, geo.size.height * EntradaTipo.heroeFraccion))
        }
    }

    private func pagina(heroe: CGFloat) -> some View {
        EntradaPagina(espacio: EntradaTipo.hueco) {
            EntradaContexto(partes: ["¿Cómo llegas?"])
            Text("\(score)")
                .font(.entrada(heroe))
                .foregroundStyle(atenuado ? entradaTinta(atenuado: true) : WatchTheme.readinessColor(score))
                .lineLimit(1)
                .minimumScaleFactor(EntradaTipo.escalaHeroe)
            Text(tendencia)
                .font(.entrada(EntradaTipo.nota, .medium))
                .foregroundStyle(WatchTheme.dim)
            if let driver = worstDriver, !driver.isEmpty {
                VStack(spacing: 0) {
                    Text("Lo que más te frena")
                        .font(.entrada(EntradaTipo.nota, .medium))
                        .foregroundStyle(WatchTheme.dim)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(driver)
                        .font(.entrada(EntradaTipo.linea))
                        .foregroundStyle(entradaTinta(atenuado: atenuado))
                        .lineLimit(2)
                        .minimumScaleFactor(EntradaTipo.escalaSuelo)
                }
                .multilineTextAlignment(.center)
                .padding(.top, EntradaTipo.huecoFilas)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// La tendencia de 7 días con su sentido en palabras (▲ / ▼), o «de 100» si no hay.
    private var tendencia: String { EntradaBrief.tendencia(delta7d: delta7d) }
}

import SwiftUI

// LAS DOS TESELAS y LA ACCIÓN SECUNDARIA.
//
// Marca reciente y pasos son las dos pruebas que Hoy conserva del día a día: el PROGRESO entero vive
// en Analíticas (DECISIONS 29-sep), aquí queda UNA marca como muestra y lleva allí. Del mismo peso, una
// al lado de la otra (`TeselasDia` las iguala en alto y las pasa a una columna en texto accesible).
//
// Una marca que no existe NO se pinta con un guion: es un hueco que el atleta puede llenar con un acto
// (medirse), así que se declara con su salida («¿Te pruebas?», §6.2 bis) y se tiñe del acento, que es
// lo que hace el kit con las teselas que piden un acto. Unos pasos sin muestras no son un cero medido.
// Y mientras Salud o el análisis de carrera no han contestado, la tesela es un esqueleto: aún no
// sabemos cuál de las dos toca.

struct HoyTeselas: View {
    let lectura: LecturaHoy
    let acciones: HoyAcciones

    var body: some View {
        TeselasDia {
            marca
            pasos
        }
    }

    // MARK: - Marca reciente

    @ViewBuilder
    private var marca: some View {
        if lectura.cargando {
            esqueleto(ancho: 96)
        } else {
            switch lectura.marca {
            case .cargando:
                esqueleto(ancho: 96)
            case .ninguna:
                TeselaDia(
                    rotulo: "¿Te pruebas?",
                    realce: true,
                    etiqueta: "¿Te pruebas? Un 1 km o un remo 500, y la app lo mide sola",
                    alTocar: acciones.abrirMarcas
                ) {
                    Text("Un 1 km o un remo 500, y la app lo mide sola.")
                        .papel(.notaFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                }
            case .reciente(let m):
                TeselaDia(
                    rotulo: m.titulo,
                    etiqueta: "\(m.titulo): \(m.valor)\(Self.textoDeTendencia(m.tendencia).map { ", \($0)" } ?? ""). Ver tu progreso",
                    alTocar: { acciones.abrirPestana(.analiticas) }
                ) {
                    Text(m.valor).papel(.dato).foregroundStyle(Theme.Color.foreground)
                    tendencia(m.tendencia)
                }
            }
        }
    }

    static func textoDeTendencia(_ t: MarcaReciente.Tendencia) -> String? {
        switch t {
        case .primeraPrueba: return "tu primera prueba"
        case .mejora(let texto), .empeora(let texto): return texto
        case .igual: return "igual que la primera"
        }
    }

    /// Contra la primera prueba: bajar el tiempo es mejorar (flecha abajo y verde), subirlo no (arriba, rojo).
    /// Con una sola prueba o con dos iguales no hay dirección que afirmar.
    @ViewBuilder
    private func tendencia(_ t: MarcaReciente.Tendencia) -> some View {
        switch t {
        case .mejora(let texto):
            filaDeTendencia(texto, glifo: .baja, color: Theme.Color.ok)
        case .empeora(let texto):
            filaDeTendencia(texto, glifo: .sube, color: Theme.Color.danger)
        case .igual:
            Text("Igual que la primera").papel(.nota).foregroundStyle(Theme.Color.muted)
        case .primeraPrueba:
            Text("Tu primera prueba").papel(.nota).foregroundStyle(Theme.Color.muted)
        }
    }

    private func filaDeTendencia(_ texto: String, glifo: GlifoDia, color: SwiftUI.Color) -> some View {
        HStack(alignment: .top, spacing: 4) {
            IconoDia(glifo, tam: 16, peso: .bold).padding(.top, 2)
            Text(texto).papel(.notaFuerte)
        }
        .foregroundStyle(color)
    }

    // MARK: - Pasos

    @ViewBuilder
    private var pasos: some View {
        if lectura.cargando {
            esqueleto(ancho: 96)
        } else {
            switch lectura.pasos {
            case .leyendo:
                esqueleto(ancho: 96)
            case .cifra(let valor):
                TeselaDia(etiqueta: "Pasos hoy, \(valor)", cabecera: { cabeceraDePasos }) {
                    Text(valor).papel(.dato).foregroundStyle(Theme.Color.foreground)
                }
            case .conectar:
                TeselaDia(
                    realce: true,
                    etiqueta: "Pasos hoy. Conecta Apple Salud para ver tus pasos",
                    alTocar: { acciones.abrirPestana(.perfil) },
                    cabecera: { cabeceraDePasos },
                    contenido: {
                        Text("Conecta Apple Salud")
                            .papel(.cuerpoFuerte)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                )
            case .sinDatos:
                TeselaDia(etiqueta: "Pasos hoy, sin datos todavía. Salud aún no tiene pasos de hoy", cabecera: { cabeceraDePasos }) {
                    Text("Sin datos todavía").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.muted)
                    Text("Salud aún no tiene pasos de hoy").papel(.nota).foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    private var cabeceraDePasos: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text("Pasos hoy").papel(.rotulo).foregroundStyle(Theme.Color.muted)
            Spacer(minLength: Theme.Spacing.xs)
            IconoDia(.huellas, tam: 22, peso: .regular).foregroundStyle(Theme.Color.muted)
        }
        .frame(minHeight: 20)
    }

    // MARK: - En frío

    /// Una tesela con la misma forma que la real: la cabecera, el dato y el pie, en barras.
    private func esqueleto(ancho: CGFloat) -> some View {
        TeselaDia(cabecera: { SkeletonBar(width: ancho, height: 15, radius: 5) }, contenido: {
            SkeletonBar(width: 100, height: 34, radius: 9)
            SkeletonBar(width: 90, height: 15, radius: 5)
        })
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando")
    }
}

// MARK: - «Crear entreno libre»

/// La acción secundaria mientras el sujeto no sea ya el constructor: suma al plan, no lo rompe, y le llega
/// igual al coach. Una fila con contorno, sin relleno: lo que se rellena es la acción del sujeto.
struct HoyEntrenoLibre: View {
    let cargando: Bool
    let acciones: HoyAcciones

    /// El alto mínimo de la fila: cabe el círculo de 44 pt y dos líneas de apoyo con su aire.
    private static let altoDeFila: CGFloat = 76

    var body: some View {
        if cargando {
            fila {
                SkeletonBar(width: 44, height: 44, radius: 22)
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    SkeletonBar(height: 17, radius: 6).frame(maxWidth: 160)
                    SkeletonBar(height: 15, radius: 5)
                }
            }
            .accessibilityHidden(true)
        } else {
            Button {
                Haptics.medium()
                acciones.crearEntrenoLibre()
            } label: {
                fila {
                    IconoDia(.mas, tam: 22, peso: .bold)
                        .foregroundStyle(Theme.Color.accentOn)
                        .frame(width: 44, height: 44)
                        .background(Theme.Color.accent, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Crear entreno libre").papel(.accion).foregroundStyle(Theme.Color.foreground)
                        Text("Suma al plan, no lo rompe. Le llega igual a tu coach.")
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
                }
            }
            .buttonStyle(PressScaleStyle(escala: 0.98))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Crear entreno libre. Suma al plan, no lo rompe. Le llega igual a tu coach")
            .accessibilityAddTraits(.isButton)
        }
    }

    private func fila<C: View>(@ViewBuilder _ contenido: () -> C) -> some View {
        HStack(spacing: 14) { contenido() }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, minHeight: Self.altoDeFila, alignment: .leading)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
                    .strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
    }
}

import SwiftUI

// LAS PIEZAS DEL DETALLE DE UNA MARCA: el sujeto, lo que se compara con él y su historial.
//
// Vistas planas, sin scroll ni servicio, para que la pantalla, la galería y las capturas pinten lo mismo.

// MARK: - El sujeto

/// Su mejor marca (o la invitación a tener una). Tono `acento`: la marca en suave, un momento que invita sin
/// apremiar. La cifra manda a 44 pt; el kicker dice de qué prueba es y el apoyo la sitúa.
struct SujetoDeMarca: View {
    let sujeto: LecturaDeMarca.Sujeto

    var body: some View {
        switch sujeto {
        case let .conMarca(kicker, cifra, apoyo):
            SujetoDia(tono: .acento, etiqueta: ([kicker, cifra] + [apoyo].compactMap { $0 }).joined(separator: ". ")) {
                KickerDia(kicker)
                // Una cifra no se parte: «1:02:10» o «2800 m» bajan de tamaño antes que de línea.
                TituloDia(cifra)
                if let apoyo { ApoyoDia(apoyo) }
            }
        case let .sinMarca(kicker, titulo, apoyo):
            SujetoDia(tono: .acento, etiqueta: "\(kicker). \(titulo). \(apoyo)") {
                KickerDia(kicker)
                TituloDia(titulo)
                ApoyoDia(apoyo)
            }
        }
    }
}

// MARK: - La celebración

/// Lo que se celebra tras un intento o una carrera registrada: el número y lo que batió. Sin confeti. La cara
/// es la del acento (lo que ya está en marcha) y el texto, la tinta del tema.
struct TarjetaMarcaNueva: View {
    let nueva: MarcaNueva

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            FichaDia(tono: nueva.esRecord ? .realce : .normal) {
                IconoDia(nueva.esRecord ? .estrella : .check, tam: 22).symbolVariant(nueva.esRecord ? .fill : .none)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(nueva.titulo)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                Text(nueva.linea)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.foreground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Theme.Spacing.l)
        .tarjetaDia(realce: true, alAncho: true)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

// MARK: - Contra qué se compara

/// Calle y cinta, lado a lado. La mitad que aún no se tiene se dice con palabras: donde va un tiempo no se pinta
/// un guion.
struct TeselasDeContexto: View {
    let contextos: LecturaDeMarca.Contextos

    var body: some View {
        TeselasDia {
            tesela("Aire libre", contextos.aire)
            tesela("En cinta", contextos.cinta)
        }
    }

    private func tesela(_ rotulo: String, _ cifra: String?) -> some View {
        TeselaDia(
            rotulo: rotulo,
            etiqueta: "\(rotulo), \(cifra ?? "sin marca")"
        ) {
            if let cifra {
                Text(cifra)
                    .papel(.dato)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            } else {
                Text("Sin marca")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }
}

/// Tu marca fresca contra la MISMA distancia dentro de tu última carrera. El hueco es lo que entrena tu plan.
struct GemeloDeCarrera: View {
    let gemelo: LecturaDeMarca.Gemelo

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TeselasDia {
                TeselaDia(rotulo: "En el box", etiqueta: "En el box, \(gemelo.enElBox), tu PR") {
                    Text(gemelo.enElBox)
                        .papel(.dato)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text("tu PR").papel(.nota).foregroundStyle(Theme.Color.muted)
                }
                TeselaDia(rotulo: "En carrera", etiqueta: "En carrera, \(gemelo.enCarrera), \(gemelo.nombreDeLaCarrera)") {
                    Text(gemelo.enCarrera)
                        .papel(.dato)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(gemelo.nombreDeLaCarrera)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(2)
                }
            }
            if let hueco = gemelo.hueco {
                Text(hueco)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - El historial

/// Del más reciente al más viejo, con lo que mejoró cada intento. Sin ninguno, la frase que dice cómo tener el
/// primero (la acción anclada es su salida).
struct HistorialDeMarca: View {
    let filas: [LecturaDeMarca.FilaDeHistorial]
    let vacio: String
    let alRetirar: (MarkResult) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Historial")
            if filas.isEmpty {
                Text(vacio)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(Theme.Spacing.l)
                    .tarjetaDia(alAncho: true)
            } else {
                // Si alguna fila se puede retirar, TODAS reservan el sitio del «···»: las cifras caen en
                // columna aunque unas filas (un test del coach) no ofrezcan la acción.
                let conMenu = filas.contains(where: \.retirable)
                ListaDia {
                    ForEach(filas) { fila in
                        FilaDeHistorialView(fila: fila, reservaMenu: conMenu, alRetirar: { alRetirar(fila.resultado) })
                    }
                }
            }
        }
    }
}

struct FilaDeHistorialView: View {
    let fila: LecturaDeMarca.FilaDeHistorial
    let reservaMenu: Bool
    let alRetirar: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            // El dato de la fila se lee de una vez; el «···» es un control aparte, con su nombre.
            datos
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(fila.etiquetaAccesible)
            if fila.retirable {
                // El «···» explícito: retirar una marca no puede depender de una pulsación larga que nadie
                // descubre ni se alcanza con VoiceOver.
                Menu {
                    Button(role: .destructive, action: alRetirar) {
                        Label("Retirar esta marca", systemImage: "trash")
                    }
                } label: {
                    IconoDia(.puntos, tam: 20, peso: .bold)
                        .foregroundStyle(Theme.Color.muted)
                        .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Acciones de la marca \(fila.cifra)")
            } else if reservaMenu {
                Color.clear.frame(width: Theme.Size.toque, height: 1).accessibilityHidden(true)
            }
        }
        .padding(.leading, 18)
        .padding(.trailing, reservaMenu ? 6 : 18)
        .padding(.vertical, 8)
        .frame(minHeight: 64)
    }

    private var datos: some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text(fila.cuando)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                Text(fila.procedencia)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)

            if let delta = fila.delta {
                // El color no va solo: el signo lo dice el número y VoiceOver lee «mejora» o «empeora».
                Text(delta.texto)
                    .papel(.notaFuerte)
                    .foregroundStyle(delta.mejora ? Theme.Color.ok : Theme.Color.danger)
                    .lineLimit(1)
            }
            Text(fila.cifra)
                .papel(.seccion)
                .monospacedDigit()
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
        }
    }
}

// MARK: - Cargando

/// Lo que se ve antes de que llegue la marca: el sujeto neutro y el historial con su título y sus filas, de las
/// medidas de lo que va a llegar. Nada salta al llegar el dato.
struct EsqueletoDeMarca: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            SujetoDia(tono: .neutro) {
                SkeletonBar(width: 150, height: 15)
                SkeletonBar(width: 170, height: 44, radius: Theme.Radius.m)
                SkeletonBar(width: 210, height: 17)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SkeletonBar(width: 120, height: 24)
                ListaDia {
                    ForEach(0..<3, id: \.self) { _ in
                        HStack(spacing: Theme.Spacing.m) {
                            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                                SkeletonBar(width: 110, height: 17)
                                SkeletonBar(width: 80, height: 15)
                            }
                            Spacer(minLength: Theme.Spacing.m)
                            SkeletonBar(width: 64, height: 22)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 8)
                        .frame(minHeight: 64)
                    }
                }
            }
        }
        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando la marca")
    }
}

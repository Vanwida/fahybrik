import SwiftUI

// LAS TARJETAS DEL PLAN SIN COACH. Cada una es una pieza de la pestaña del atleta libre (su carrera, lo que sabemos
// de él, sus marcas, su semana bloqueada, la conversión) en el lenguaje de «El día»: tarjetas de radio 22 con título
// de sección de 24, filas a 17 y apoyos a 15. Ninguna inventa un dato: lo que no llega no se pinta.
//
// El orden y la selección de cuáles salen los decide `FreePlanView` (con lo que dice `LecturaLibre`); aquí solo
// se PINTA cada una. Tocar una marca o una fila no navega desde aquí: avisa con un cierre, y quien monta la
// pantalla sabe adónde lleva.

// MARK: - Tu carrera

struct TarjetaCarreraPlan: View {
    let carrera: CarreraDelPlanLibre

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Tu carrera") {
                if let cuenta = PlanLibreCopy.cuentaAtras(carrera.dias) { InfoPill(text: cuenta, estilo: .velo) }
            }
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(carrera.nombre).papel(.seccion).foregroundStyle(Theme.Color.foreground)
                    if let categoria = carrera.categoria { Text(categoria).papel(.nota).foregroundStyle(Theme.Color.muted) }
                }
                if let objetivo = carrera.objetivo {
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                        Text("Tu objetivo").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.muted)
                        Spacer(minLength: 0)
                        Text(objetivo).papel(.dato).foregroundStyle(Theme.Color.foreground)
                    }
                }
                // Su objetivo contra su realidad: la conversación interesante, y la que faltaba.
                if let comparacion = carrera.comparacion {
                    Hairline()
                    comparacionView(comparacion)
                } else if let faltan = PlanLibreCopy.marcasQueFaltan(carrera.faltan) {
                    Hairline()
                    Text(faltan).papel(.cuerpo).foregroundStyle(Theme.Color.foreground)
                }
            }
            .padding(18)
            .tarjetaDia(alAncho: true)
        }
    }

    @ViewBuilder
    private func comparacionView(_ c: Comparacion) -> some View {
        switch c {
        case let .mejor(mejor, deltaS):
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                    Text("Tu mejor en la misma categoría").papel(.nota).foregroundStyle(Theme.Color.muted)
                    Spacer(minLength: 0)
                    Text(PlanLibreCopy.reloj(mejor.tiempoS)).papel(.cuerpoFuerte).monospacedDigit().foregroundStyle(Theme.Color.foreground)
                }
                Text(PlanLibreCopy.veredictoDelObjetivo(mejor: mejor, deltaS: deltaS))
                    .papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
            }
        case let .sin(motivo, categoria):
            Text(PlanLibreCopy.textoSinComparacion(motivo: motivo, categoria: categoria))
                .papel(.cuerpo).foregroundStyle(Theme.Color.foreground)
        }
    }
}

/// Sin carrera objetivo: se invita a ponerla, con su salida.
struct TarjetaSinCarreraPlan: View {
    let alAbrir: () -> Void

    var body: some View {
        Button(action: { Haptics.light(); alAbrir() }) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("¿Ya tienes una carrera?").papel(.etiqueta).foregroundStyle(Theme.Color.muted)
                    Text("Ponla y te llevamos la cuenta atrás.").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                IconoDia(.mas, tam: 22, peso: .bold).foregroundStyle(Theme.Color.accentText)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .frame(minHeight: 84)
            .tarjetaDia(alAncho: true)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("¿Ya tienes una carrera? Ponla y te llevamos la cuenta atrás.")
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Lo que ya sabemos de ti

/// Su VO₂ máx del reloj: real, y en ningún otro sitio de la app.
struct TarjetaVo2Plan: View {
    let vo2: Vo2Reloj

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Lo que ya sabemos de ti")
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                    Text(vo2.etiqueta).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    Spacer(minLength: 0)
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(vo2.valor).papel(.dato).foregroundStyle(Theme.Color.foreground)
                        if !vo2.unidad.isEmpty { Text(vo2.unidad).papel(.notaFuerte).foregroundStyle(Theme.Color.muted) }
                    }
                }
                Text("Lo mide tu reloj. Es el tamaño de tu motor: manda en los 8 km de carrera.")
                    .papel(.nota).foregroundStyle(Theme.Color.muted)
            }
            .padding(18)
            .tarjetaDia(alAncho: true)
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Traer su historial

struct TarjetaImportarPlan: View {
    let alAbrir: () -> Void

    var body: some View {
        Button(action: { Haptics.medium(); alAbrir() }) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("¿Ya has corrido un HYROX?").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    Text("Búscate por tu nombre y te traemos tus tiempos, estación por estación, en un toque.")
                        .papel(.nota).foregroundStyle(Theme.Color.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                IconoDia(.flecha, tam: 20, peso: .bold).foregroundStyle(Theme.Color.accentText)
            }
            .padding(EdgeInsets(top: 16, leading: 20, bottom: 16, trailing: 18))
            .tarjetaDia(alAncho: true)
            .overlay(alignment: .leading) { Rectangle().fill(Theme.Color.accent).frame(width: 4) }
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("¿Ya has corrido un HYROX? Búscate por tu nombre y traemos tus tiempos.")
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Las tres de arranque

/// Para quien no ha medido nada: las tres que bastan para afinar su semana, numeradas como pasos.
struct TarjetaArranquePlan: View {
    let pasos: [MarcaLibre]
    let alAbrir: (MarcaLibre) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Empieza por medirte")
            VStack(alignment: .leading, spacing: 0) {
                Text("Si aún no has corrido ninguna, estas tres bastan para afinar tu semana.")
                    .papel(.nota).foregroundStyle(Theme.Color.muted)
                    .padding(EdgeInsets(top: 16, leading: 18, bottom: 8, trailing: 18))
                ForEach(Array(pasos.enumerated()), id: \.element.id) { i, m in
                    Button(action: { Haptics.light(); alAbrir(m) }) {
                        HStack(spacing: 14) {
                            Text("\(i + 1)")
                                .papel(.cuerpoFuerte).monospacedDigit()
                                .foregroundStyle(Theme.Color.foreground)
                                .frame(width: 32, height: 32)
                                .background(Theme.Color.accentTint, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.etiqueta).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                                Text(m.como).papel(.nota).foregroundStyle(Theme.Color.muted)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            IconoDia(.chevron, tam: 18, peso: .semibold).foregroundStyle(Theme.Color.muted)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, Theme.Spacing.m)
                        .frame(minHeight: 72)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleStyle())
                    .overlay(alignment: .top) { Hairline() }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Paso \(i + 1). \(m.etiqueta). \(m.como)")
                    .accessibilityAddTraits(.isButton)
                }
            }
            .tarjetaDia(alAncho: true)
        }
    }
}

/// El catálogo vive en el servidor: si no se puede leer no hay nada honesto que listar, y se ofrece reintentar.
struct TarjetaCatalogoCaidoPlan: View {
    var reintentando = false
    let alReintentar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("No pudimos cargar tus marcas.").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
            Text("Revisa tu conexión e inténtalo de nuevo.").papel(.nota).foregroundStyle(Theme.Color.muted)
            Button(action: { Haptics.light(); alReintentar() }) {
                HStack(spacing: Theme.Spacing.s) {
                    IconoDia(.reintentar, tam: 18, peso: .bold)
                    Text(reintentando ? "Reintentando" : "Reintentar").papel(.cuerpoFuerte)
                }
                .foregroundStyle(Theme.Color.accentText)
                .frame(minHeight: Theme.Size.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .disabled(reintentando)
        }
        .padding(18)
        .tarjetaDia(alAncho: true)
    }
}

// MARK: - Lo que sus carreras dicen de él (el sujeto, con evidencia)

/// Una fila de la evidencia, dentro del sujeto: el título, la cifra grande y, debajo, qué es y qué NO es.
struct FilaEvidenciaPlan: View {
    let titulo: String
    let valor: String
    var extra: String?
    let nota: String

    @Environment(\.tonoDia) private var tono

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Con el texto muy grande la cifra baja debajo del título en vez de apretarlo.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(titulo).papel(.cuerpoFuerte).lineLimit(1).fixedSize(horizontal: true, vertical: false)
                    Spacer(minLength: Theme.Spacing.s)
                    Text(valor).papel(.seccion).monospacedDigit().fixedSize(horizontal: true, vertical: false)
                    if let extra { Text(extra).papel(.notaFuerte).monospacedDigit().fixedSize(horizontal: true, vertical: false) }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo).papel(.cuerpoFuerte)
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(valor).papel(.seccion).monospacedDigit()
                        if let extra { Text(extra).papel(.notaFuerte).monospacedDigit() }
                    }
                }
            }
            Text(nota).papel(.nota).fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(tono.papeles.tinta)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(tono.lineaInterior).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - La semana bloqueada

/// «Cómo se arregla»: la demostración de competencia que sostiene el embudo, y por eso tiene que ser VERDAD. Lo
/// difuminado es REAL (las sesiones de debajo son las de verdad; el desenfoque es solo presentación), la
/// estructura es NUESTRA y los números son SUYOS. El candado dice de dónde salen, que es lo que separa esto de un anuncio.
struct TarjetaSemanaBloqueadaPlan: View {
    let semana: SemanaBloqueada

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Cómo se arregla") {
                Text("tu semana").papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(semana.sesiones.enumerated()), id: \.offset) { i, s in
                    let bloqueada = i >= semana.visibles
                    HStack(alignment: .top, spacing: 14) {
                        Text(s.dia).papel(.notaPesada).foregroundStyle(Theme.Color.muted).frame(width: 40, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.titulo).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                            Text(s.detalle).papel(.notaPesada).foregroundStyle(Theme.Color.accentText)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, Theme.Spacing.m)
                    .overlay(alignment: .bottom) { if i < semana.sesiones.count - 1 { Hairline() } }
                    // El desenfoque es SOLO presentación: la sesión de debajo es la real.
                    .blur(radius: bloqueada ? 4.5 : 0)
                    .opacity(bloqueada ? 0.6 : 1)
                    .allowsHitTesting(!bloqueada)
                    .accessibilityElement(children: bloqueada ? .ignore : .combine)
                    .accessibilityHidden(bloqueada)
                }
                HStack(spacing: Theme.Spacing.s) {
                    IconoDia(.candado, tam: 16, peso: .semibold)
                    Text(semana.base).papel(.notaFuerte).multilineTextAlignment(.center)
                }
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
            }
            .padding(EdgeInsets(top: 6, leading: 18, bottom: 14, trailing: 18))
            .tarjetaDia(alAncho: true)
        }
    }
}

// MARK: - Tus marcas

struct TarjetaMarcasPlan: View {
    let medidas: [MarcaLibre]
    let faltan: [MarcaLibre]
    let alAbrir: (MarcaLibre) -> Void
    let alVerTodas: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Tus marcas") {
                Button(action: { Haptics.light(); alVerTodas() }) {
                    HStack(spacing: 4) {
                        Text("Todas").papel(.notaPesada)
                        IconoDia(.chevron, tam: 16, peso: .bold)
                    }
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(minHeight: Theme.Size.toque)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Ver todas tus marcas")
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(medidas.enumerated()), id: \.element.id) { i, m in
                    Button(action: { Haptics.light(); alAbrir(m) }) {
                        HStack(spacing: Theme.Spacing.m) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.etiqueta).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                                if let cuando = m.cuando { Text(cuando).papel(.nota).foregroundStyle(Theme.Color.muted) }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            if let valor = m.valor { Text(valor).papel(.seccion).monospacedDigit().foregroundStyle(Theme.Color.foreground) }
                            IconoDia(.chevron, tam: 18, peso: .semibold).foregroundStyle(Theme.Color.muted)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .frame(minHeight: 68)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleStyle())
                    .overlay(alignment: .top) { if i > 0 { Hairline() } }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel([m.etiqueta, m.valor, m.cuando].compactMap { $0 }.joined(separator: ", "))
                    .accessibilityAddTraits(.isButton)
                }
                if !faltan.isEmpty {
                    // NO es una lista de deberes: cada fila dice qué DESBLOQUEA.
                    Text("Lo que aún no hemos medido")
                        .papel(.notaPesada).foregroundStyle(Theme.Color.muted)
                        .padding(EdgeInsets(top: medidas.isEmpty ? 16 : 14, leading: 18, bottom: 4, trailing: 18))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .top) { if !medidas.isEmpty { Hairline() } }
                    ForEach(faltan) { m in
                        Button(action: { Haptics.light(); alAbrir(m) }) {
                            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.etiqueta).papel(.cuerpo).foregroundStyle(Theme.Color.foreground)
                                    Text(m.desbloquea).papel(.nota).foregroundStyle(Theme.Color.muted)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                Text(m.dura).papel(.nota).foregroundStyle(Theme.Color.muted).lineLimit(1).padding(.top, 2)
                                IconoDia(.chevron, tam: 18, peso: .semibold).foregroundStyle(Theme.Color.muted)
                            }
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .frame(minHeight: 72)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(PressScaleStyle())
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(m.etiqueta), aún sin medir. \(m.desbloquea). \(m.dura).")
                        .accessibilityAddTraits(.isButton)
                    }
                }
            }
            .tarjetaDia(alAncho: true)
        }
    }
}

// MARK: - El cierre: la persona, no el paywall

/// La única pieza que habla de un coach, y la última. Sin nombre: un atleta libre no tiene coach.
struct TarjetaConversionPlan: View {
    let alHablar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                IconoDia(.silueta, tam: 24, peso: .semibold)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 48, height: 48)
                    .background(Theme.Color.surfaceElevated, in: Circle())
                    .overlay(Circle().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Entrena con un coach").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    Text("Una llamada de 15 minutos").papel(.nota).foregroundStyle(Theme.Color.muted)
                }
            }
            Text("Estos números son tuyos y son gratis. Lo que cuesta es decidir qué hacer con ellos cada semana: eso lo hace un coach.")
                .papel(.cuerpo).foregroundStyle(Theme.Color.foreground)
            BotonAccionDia("Hablar con un coach", completa: true, impacto: .medio, accion: alHablar)
            Text("Sin compromiso · eliges tú el hueco")
                .papel(.nota).foregroundStyle(Theme.Color.muted).frame(maxWidth: .infinity)
        }
        .padding(18)
        .tarjetaDia(alAncho: true)
    }
}

// MARK: - En frío

/// La silueta de las tarjetas que llegarán (carrera y una segunda), para que nada salte.
struct TarjetasPlanEsqueleto: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            ForEach(0..<2, id: \.self) { i in
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    SkeletonBar(width: i == 0 ? 130 : 220, height: 24, radius: 7)
                    SkeletonBar(height: i == 0 ? 170 : 112, radius: Theme.Radius.tarjeta)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

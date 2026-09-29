import SwiftUI

// EL SUJETO DE «CARRERAS» — el póster (la única foto de la pestaña) y los otros momentos en que
// lo que importa ahora no es un objetivo con su cuenta atrás. Espejo de `poster.tsx` y `sujetos.tsx`.
//
//   · objetivo    → el principal, con cuenta atrás, meta y un predicho que nunca inventa un tiempo
//   · postcarrera → corriste hace poco y falta tu resultado (importarlo)
//   · última      → sin nada por delante: tu última carrera y fijar la siguiente
//   · vacío       → ni una cosa ni otra: la invitación, con sus DOS salidas
//   · cargando    → esqueleto con la forma final
//   · error       → «No pudimos cargar tus carreras» con «Reintentar»
//
// El póster es una superficie de apariencia OSCURA anidada (`PosterDia`): el texto va SIEMPRE sobre
// foto oscurecida, también con el tema claro, y por eso todo lo de dentro lee `Theme.Color.foreground`
// (la tinta clara de esa superficie), nunca un blanco escrito a mano. Altura (§6.1): el póster pide el
// alto que sobre y reparte con un `Spacer` entre lo que ES y lo que se HACE: el sobrante entra en el
// propio sujeto, jamás en una cola muerta debajo.

// MARK: - Piezas del póster

/// El texto de una fila del póster: tinta del tema (clara sobre la foto oscurecida), papel a elegir.
private extension View {
    func sobrePoster(_ papel: Theme.Typography.Papel) -> some View {
        self
            .papel(papel)
            .foregroundStyle(Theme.Color.foreground)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// «Objetivo principal», «Tu última carrera»…: el glifo y la etiqueta que abren el póster.
private struct KickerPoster<Glifo: View>: View {
    let texto: String
    let glifo: Glifo

    init(_ texto: String, @ViewBuilder glifo: () -> Glifo) {
        self.texto = texto
        self.glifo = glifo()
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            glifo
            Text(texto).papel(.kicker)
        }
        .foregroundStyle(Theme.Color.foreground)
        .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// El nombre de la carrera: display de marca, pesado e inclinado.
private struct NombrePoster: View {
    let nombre: String

    var body: some View {
        Text(nombre)
            .sobrePoster(.sujeto)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// La regleta de tramos medidos del póster y su panel: el predicho con TODOS sus estados (cifra,
/// parcial, sin datos, sin meta, error, esqueleto), siempre con la misma forma.
private struct PanelPredicho: View {
    let texto: TextoPredicho
    let alReintentar: () -> Void

    var body: some View {
        Group {
            if texto.esqueleto {
                VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                    SkeletonBar(width: 130, height: 15, radius: 5)
                    SkeletonBar(width: 110, height: 32, radius: 8)
                    SkeletonBar(height: 15, radius: 5).frame(maxWidth: 250)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Calculando tu predicho")
                .accessibilityAddTraits(.updatesFrequently)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(texto.etiqueta).sobrePoster(.rotulo)
                        if let valor = texto.valor {
                            Text(valor)
                                .sobrePoster(texto.valorEsCifra ? .dato : .seccion)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        if let regleta = texto.regleta {
                            RegletaNeutraCarreras(n: regleta.n, de: regleta.de)
                        }
                        if let frase = texto.frase {
                            HStack(alignment: .top, spacing: 6) {
                                if let marca = texto.marca {
                                    IconoDia(marca == .ok ? .baja : .sube, tam: 16, peso: .bold)
                                        .foregroundStyle(marca == .ok ? Theme.Color.ok : Theme.Color.warning)
                                        .padding(.top, 2)
                                }
                                Text(frase).sobrePoster(.notaFuerte)
                            }
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(TextosCarreras.vozPredicho(texto))
                    if texto.reintentar {
                        Button {
                            Haptics.light()
                            alReintentar()
                        } label: {
                            HStack(spacing: Theme.Spacing.s) {
                                IconoDia(.reintentar, tam: 18, peso: .semibold)
                                Text("Reintentar").papel(.rotulo)
                            }
                            .foregroundStyle(Theme.Color.foreground)
                            .frame(minHeight: Theme.Size.toque, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(PressScaleStyle(escala: 0.96))
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .panelSobreFoto()
    }
}

/// El «⋯» del póster: 48 pt de toque, un círculo de 38 sobre la foto. Cuelga SOBRE el póster (no
/// dentro) y lleva su propia apariencia oscura: su tinta tiene que ser la del póster con los dos
/// temas, no la del tema del teléfono.
private struct BotonPuntosPoster: View {
    let etiqueta: String
    let accion: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            IconoDia(.puntos, tam: 20)
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 38, height: 38)
                .background(Theme.Color.background.opacity(0.62), in: Circle())
                .overlay(Circle().strokeBorder(Theme.Color.foreground.opacity(0.26), lineWidth: 1))
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.92))
        .environment(\.colorScheme, .dark)
        .accessibilityLabel(etiqueta)
    }
}

// MARK: - El objetivo con su cuenta atrás

struct PosterObjetivoCarreras: View {
    let carrera: ProximaCarrera
    /// Falso = no hay principal y se enseña la más próxima (con su salida: hacerla principal).
    let principal: Bool
    let hoy: String
    let prediccion: PrediccionCarrera
    /// Lo que hace la acción principal (lo decide `DecideCarreras.accionObjetivo`; la pantalla lo cablea).
    let alAbrir: (AccionObjetivoCarrera) -> Void
    let alAcciones: () -> Void
    let alReintentarPredicho: () -> Void

    private var accion: AccionObjetivoCarrera {
        DecideCarreras.accionObjetivo(principal: principal, carrera: carrera, prediccion: prediccion)
    }

    private var esHoy: Bool { carrera.diasHasta == 0 }

    private var kicker: String {
        principal ? (esHoy ? "Día de carrera" : PrioridadCarrera.principal.etiqueta) : carrera.prioridad.etiqueta
    }

    private var cuando: String {
        carrera.fecha.flatMap { FechaES.corta($0, hoy: hoy, conDia: true) } ?? "Fecha por confirmar"
    }

    private var donde: String { [cuando, carrera.lugar].compactMap { $0 }.joined(separator: " · ") }

    var body: some View {
        let categoria = DecideCarreras.lineaCategoria(carrera)
        let equipo = DecideCarreras.etiquetaEquipo(carrera.formato)
        let texto = TextosCarreras.textoPredicho(
            prediccion,
            contexto: ContextoPredicho(principal: principal, tipoEvento: carrera.tipoEvento, formato: carrera.formato)
        )
        PosterDia(foto: carrera.foto, densidad: .pantalla) {
            VStack(alignment: .leading, spacing: 10) {
                KickerPoster(kicker) {
                    if principal { IconoDia(.diana, tam: 18) } else { IconoCarreras(.bandera, tam: 18) }
                }
                .padding(.trailing, Theme.Size.toque + 4)
                NombrePoster(nombre: carrera.nombre)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: Theme.Spacing.s) {
                        IconoDia(.calendario, tam: 18)
                        Text(donde).sobrePoster(.cuerpoFuerte)
                    }
                    if categoria != nil || equipo != nil {
                        HStack(spacing: Theme.Spacing.m - 2) {
                            if let equipo {
                                HStack(spacing: 6) {
                                    IconoCarreras(.equipo, tam: 18)
                                    Text(equipo).sobrePoster(.notaPesada)
                                }
                            }
                            if let categoria { Text(categoria).sobrePoster(.notaFuerte) }
                        }
                    }
                }
                .foregroundStyle(Theme.Color.foreground)
            }
            Spacer(minLength: 18)
            VStack(alignment: .leading, spacing: 14) {
                cuentaYMeta
                PanelPredicho(texto: texto, alReintentar: alReintentarPredicho)
                Button {
                    Haptics.light()
                    alAbrir(accion)
                } label: {
                    AccionDia(accion.etiqueta, glifo: accion == .verCamino ? .flecha : nil)
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
            }
        }
        // El póster ENTERO abre lo mismo que su acción. El toque va en el contenedor y no en un botón
        // que lo envuelva: el «⋯» y el «Reintentar» de dentro son botones de verdad, y un botón dentro
        // de otro no recibe el toque de forma fiable. Un botón hijo gana siempre al gesto del padre.
        .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.sujeto, style: .continuous))
        .onTapGesture {
            Haptics.light()
            alAbrir(accion)
        }
        .overlay(alignment: .topTrailing) {
            BotonPuntosPoster(etiqueta: "Acciones de \(carrera.nombre)", accion: alAcciones)
                .padding(.top, Theme.Spacing.s)
                .padding(.trailing, Theme.Spacing.s + 2)
        }
    }

    private var cuentaYMeta: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .bottom, spacing: Theme.Spacing.m) {
                cuenta
                Spacer(minLength: Theme.Spacing.m)
                meta
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                cuenta
                meta
            }
        }
    }

    @ViewBuilder
    private var cuenta: some View {
        if let dias = carrera.diasHasta {
            CuentaAtrasDia(dias: dias)
        } else {
            // Sin fecha no hay cuenta atrás: se dice, no se inventa una cifra.
            Text("Sin fecha aún").sobrePoster(.saludo)
        }
    }

    @ViewBuilder
    private var meta: some View {
        if let metaS = carrera.metaS, let texto = Formato.metaDeCarrera(metaS) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Objetivo").sobrePoster(.rotulo)
                Text(texto).sobrePoster(.accion)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, Theme.Spacing.s)
            .panelSobreFoto()
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Corriste hace poco y falta tu resultado

struct PosterPostcarreraCarreras: View {
    let carrera: CarreraPasada
    let dias: Int
    let hoy: String
    let alImportar: () -> Void

    /// «Ayer» / «Hace 3 días» / «Hoy»: cuánto hace. Con el plazo del sujeto como límite de la cuenta
    /// (a los 9 días «hace 9 días» sigue situando; la frase por defecto ya diría una fecha).
    private var cuando: String {
        guard let fecha = carrera.fecha.flatMap(FechaES.fecha), let ahora = FechaES.fecha(hoy) else { return "Hace poco" }
        let texto = FechaES.hace(fecha, ahora: ahora, cuentaHasta: DecideCarreras.diasPostcarrera)
        return texto.prefix(1).uppercased() + texto.dropFirst()
    }

    var body: some View {
        let fecha = carrera.fecha.flatMap { FechaES.corta($0, hoy: hoy, conDia: true) } ?? ""
        let equipo = DecideCarreras.etiquetaEquipo(carrera.formato)
        let etiqueta = [
            cuando, carrera.nombre, fecha, "Falta tu resultado",
            "Importa tu resultado y verás tus parciales, tu ritmo por km y tu evolución",
            "Importar mi resultado",
        ].filter { !$0.isEmpty }.joined(separator: ". ")
        PosterDia(foto: carrera.foto, densidad: .pantalla, etiqueta: etiqueta, alTocar: {
            Haptics.light()
            alImportar()
        }) {
            VStack(alignment: .leading, spacing: 10) {
                KickerPoster(cuando) { IconoCarreras(.bandera, tam: 18) }
                NombrePoster(nombre: carrera.nombre)
                HStack(spacing: Theme.Spacing.m - 2) {
                    Text(fecha).sobrePoster(.cuerpoFuerte)
                    Text([equipo, carrera.division.etiqueta].compactMap { $0 }.joined(separator: " · "))
                        .sobrePoster(.notaFuerte)
                }
            }
            Spacer(minLength: 18)
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    Text("Falta tu resultado").sobrePoster(.dato)
                    Text("En cuanto se publique, impórtalo y verás tus parciales, tu ritmo por km y tu evolución.")
                        .sobrePoster(.cuerpo)
                }
                AccionDia("Importar mi resultado", glifo: .flecha)
            }
        }
    }
}

// MARK: - Sin nada por delante: tu última carrera

struct PosterUltimaCarreras: View {
    let carrera: CarreraPasada
    let pasadas: [CarreraPasada]
    let hoy: String
    let alBuscar: () -> Void

    var body: some View {
        let resumen = DecideCarreras.resumenDe(carrera, pasadas)
        let equipo = DecideCarreras.etiquetaEquipo(carrera.formato)
        let conQuien = DecideCarreras.textoEquipo(carrera.companeros)
        let fecha = carrera.fecha.flatMap { FechaES.corta($0, hoy: hoy) } ?? "Fecha por confirmar"
        let etiqueta = [
            "Tu última carrera", carrera.nombre, fecha, equipo, conQuien,
            resumen.totalS.flatMap { Formato.clock($0, enHoras: false) }.map { "Tiempo \($0)" },
            resumen.puesto, "Fijar mi próxima carrera",
        ].compactMap { $0 }.joined(separator: ". ")
        PosterDia(foto: carrera.foto, densidad: .pantalla, etiqueta: etiqueta, alTocar: {
            Haptics.light()
            alBuscar()
        }) {
            VStack(alignment: .leading, spacing: 10) {
                KickerPoster("Tu última carrera") { IconoCarreras(.bandera, tam: 18) }
                NombrePoster(nombre: carrera.nombre)
                HStack(spacing: Theme.Spacing.m - 2) {
                    Text(fecha).sobrePoster(.cuerpoFuerte)
                    Text(carrera.division.etiqueta).sobrePoster(.notaFuerte)
                }
            }
            Spacer(minLength: 18)
            VStack(alignment: .leading, spacing: 14) {
                if let total = resumen.totalS {
                    Text(Formato.clock(total, enHoras: false))
                        .sobrePoster(.cuenta)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    if equipo != nil {
                        CintaCarreras(sobreFoto: true, icono: { IconoCarreras(.equipo, tam: 18) }) {
                            Text("Tiempo del equipo\(conQuien.map { " · \($0)" } ?? "")")
                        }
                    } else {
                        PildoraDelta(deltaS: resumen.deltaAnteriorS, sobreFoto: true)
                    }
                    PildoraPuesto(texto: resumen.puesto, sobreFoto: true)
                }
                ParcialesCarrera(resumen: resumen, sobreFoto: true)
                AccionDia("Fijar mi próxima carrera", glifo: .lupa)
            }
        }
    }
}

// MARK: - Ni carreras por delante ni por detrás

struct PosterVacioCarreras: View {
    let alBuscar: () -> Void
    let alImportar: () -> Void

    var body: some View {
        PosterDia(
            foto: BrandImagery.raceCardBackgroundDefault,
            densidad: .pantalla,
            etiqueta: "Tus carreras. Todavía no tienes ninguna: busca una carrera o importa tu historial de HYROX"
        ) {
            VStack(alignment: .leading, spacing: 10) {
                KickerPoster("Tus carreras") { IconoCarreras(.bandera, tam: 18) }
                NombrePoster(nombre: "¿A qué carrera vas?")
                Text("Fíjala y tendrás cuenta atrás, el predicho de tu tiempo y un plan que apunta a ese día.")
                    .sobrePoster(.cuerpo)
                Button {
                    Haptics.light()
                    alBuscar()
                } label: {
                    AccionDia("Buscar carrera", glifo: .lupa)
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
                .padding(.top, 4)
            }
            Spacer(minLength: 18)
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                Rectangle().fill(Theme.Color.foreground.opacity(0.26)).frame(height: 1)
                Text("¿Ya has corrido HYROX?").sobrePoster(.accion)
                Text("Importa tu historial, individuales y dobles: tus parciales por estación, tu ritmo por km y tu evolución.")
                    .sobrePoster(.nota)
                Button {
                    Haptics.light()
                    alImportar()
                } label: {
                    HStack(spacing: Theme.Spacing.m - 2) {
                        IconoDia(.mas, tam: 20, peso: .bold)
                        Text("Importar mi historial").papel(.accion)
                    }
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.horizontal, 22)
                    .frame(minHeight: Theme.Size.accion)
                    .background(Theme.Color.background.opacity(0.40), in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.Color.foreground.opacity(0.60), lineWidth: 1.5))
                    .contentShape(Capsule())
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
            }
            .padding(.top, Theme.Spacing.m)
        }
    }
}

// MARK: - Cargando en frío: la MISMA forma que tendrá

struct PosterCargandoCarreras: View {
    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.sujeto, style: .continuous)
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                SkeletonBar(width: 150, height: 15, radius: 5).frame(minHeight: 32)
                SkeletonBar(height: 44, radius: 10).frame(maxWidth: 300)
                SkeletonBar(height: 44, radius: 10).frame(maxWidth: 190)
                SkeletonBar(height: 17, radius: 6).frame(maxWidth: 240)
            }
            Spacer(minLength: 18)
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .bottom) {
                    SkeletonBar(width: 150, height: 76, radius: 12)
                    Spacer(minLength: Theme.Spacing.m)
                    SkeletonBar(width: 112, height: 54, radius: Theme.Radius.fila)
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                    SkeletonBar(width: 130, height: 15, radius: 5)
                    SkeletonBar(width: 110, height: 32, radius: 8)
                    SkeletonBar(height: 15, radius: 5).frame(maxWidth: 250)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.m)
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous).strokeBorder(Theme.Color.hairline, lineWidth: 1))
                SkeletonBar(width: 190, height: 52, radius: 26)
            }
        }
        .padding(EdgeInsets(top: 16, leading: 22, bottom: 20, trailing: 22))
        .frame(maxWidth: .infinity, minHeight: 400, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.Color.surface, in: forma)
        .overlay(forma.strokeBorder(Theme.Color.hairline, lineWidth: 1))
        .clipShape(forma)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tus carreras")
        .accessibilityAddTraits(.updatesFrequently)
    }
}

// MARK: - Error de carga, con su salida

struct SujetoErrorCarreras: View {
    /// Vuelve a pedir la pestaña. Mientras dura, el botón no admite otro toque y el glifo gira.
    let alReintentar: () async -> Void
    @State private var reintentando = false

    var body: some View {
        SujetoDia(tono: .peligro, etiqueta: "No pudimos cargar tus carreras. Revisa tu conexión e inténtalo de nuevo.", anuncia: true) {
            KickerDia("Tus carreras")
            TituloDia("No pudimos cargar tus carreras")
            ApoyoDia("Revisa tu conexión e inténtalo de nuevo.")
        } abajo: {
            Button {
                guard !reintentando else { return }
                Haptics.light()
                reintentando = true
                Task {
                    await alReintentar()
                    reintentando = false
                }
            } label: {
                AccionDia(reintentando ? "Reintentando" : "Reintentar", glifo: .reintentar, enCurso: reintentando)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
            .disabled(reintentando)
        }
    }
}

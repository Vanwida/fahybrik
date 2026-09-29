import SwiftUI

// EL SUJETO DE PLAN — el día que la card muestra, en grande. `LecturaPlan.vista` decide QUÉ es; aquí solo
// se pinta. Un bloque, un título de marca, ninguna acción dentro: la única puerta de empezar es la acción
// anclada de abajo, la misma para cualquier día (DECISIONS 6-ago).
//
// El tinte lo pone el MOMENTO del día mostrado y jamás lleva el texto:
//   hoy por hacer = acento del club SÓLIDO («haz esto ahora») · lo que viene = acento suave · hecha = verde ·
//   a medias = ámbar · sin hacer = gris · descanso = verde azulado.
//
// De arriba abajo, lo que responde «qué toca y cómo es»:
//   fecha y estado → título → pastillas (franja, Libre, Test, formato, duración) → partes con sus ejercicios
//   (el marco, atenuado y sin lista) → nota del coach → lo siguiente.
// La dosis NO va aquí (DECISIONS 7-ago): un bloque suelto se leía como la de toda la sesión. Y la duración es
// el reloj que ESCRIBE el plan, o su razón; en una sesión hecha, los minutos MEDIDOS.

// MARK: - Una sesión

struct SujetoSesionPlan: View {
    let l: LecturaPlan
    let dia: DiaDelPlan
    let principal: AthleteWeekDaySession
    /// El estado que dice el DÍA (una pendiente pasada es «sin hacer»).
    let estado: EstadoSesion
    let semana: SemanaDelPlan
    let offset: Int
    let desglose: Desglose
    let tono: TonoDia
    /// Índice (0-6) del día del carril al que apunta la muesca.
    let indice: Int?
    let alAbrir: (AthleteWeekDaySession) -> Void

    private var terminada: Bool { principal.estado.trabajada }
    private var fecha: String { FechasDelPlan.etiqueta(de: dia.isoDate, hoy: l.hoyIso) }

    /// Lo siguiente solo sitúa el día de HOY: hojeando otro día ese marco sería el de hoy colgado de otro.
    private var siguiente: (dia: DiaDelPlan, sesion: AthleteWeekDaySession)? {
        terminada && dia.esHoy && offset == 0 ? semana.sesionDeManana : nil
    }

    var body: some View {
        SujetoDia(tono: tono, etiqueta: "\(principal.title). \(fecha). \(estado.etiqueta)") {
            KickerDia(fecha) { pastillaDeEstado }
            TituloPlan(texto: principal.title, escalon: EscalonDeTitulo(titulo: principal.title))
            PastillasDeSesionPlan(dia: dia, principal: principal, desglose: desglose)
        } abajo: {
            cuerpo
            if let nota = desglose.listo?.notaDelDia {
                NotaDelCoachPlan(texto: nota, coach: l.coach)
            }
            if let siguiente {
                FilaContextoPlan(
                    etiqueta: FechasDelPlan.rotulo(de: siguiente.dia.isoDate, hoy: l.hoyIso),
                    titulo: siguiente.sesion.title, modalidad: siguiente.sesion.modality,
                    detalle: DuracionDeSesion.texto(siguiente.sesion), estado: nil,
                    accesible: "Lo siguiente: \(FechasDelPlan.etiqueta(de: siguiente.dia.isoDate, hoy: l.hoyIso)), \(siguiente.sesion.title)",
                    alTocar: { alAbrir(siguiente.sesion) })
            }
        }
        .overlay(alignment: .top) { muesca }
    }

    @ViewBuilder
    private var pastillaDeEstado: some View {
        if tono == .accion {
            InfoPill(text: estado.etiqueta, estilo: .sobreAccion)
        } else {
            PastillaPlan(texto: estado.etiqueta, papel: .estado, sello: estado.sello)
        }
    }

    @ViewBuilder
    private var cuerpo: some View {
        switch desglose {
        case .cargando:
            PartesEsqueletoPlan()
        case let .listo(d) where !d.partes.isEmpty:
            ListaDePartesPlan(desglose: d)
        case .listo, .sinDetalle:
            // Sin desglose se dice lo que sí se sabe (la estructura de la fila) y se calla el resto.
            if let resumen = principal.shortPrescription {
                ApoyoDia(resumen)
            } else {
                ApoyoDia("El detalle no está disponible ahora. Abre la sesión para verla entera.")
            }
        }
    }

    @ViewBuilder
    private var muesca: some View {
        if let indice { MuescaPlan(indice: indice, tono: tono) }
    }
}

/// Las pastillas de la sesión: franja (solo con más de una), «Libre», «Test», el formato y la duración.
struct PastillasDeSesionPlan: View {
    let dia: DiaDelPlan
    let principal: AthleteWeekDaySession
    let desglose: Desglose

    var body: some View {
        let listo = desglose.listo
        let terminada = principal.estado.trabajada
        // Una sesión hecha se cuenta con lo que se MIDIÓ; una por hacer, con el reloj que escribe el plan.
        let medido = terminada ? listo?.medidoMin.flatMap(Formato.duracion) : nil
        let escrita = terminada ? nil : DuracionDeSesion.texto(principal)
        if dia.sesiones.count > 1 || principal.isSelfOrigin || principal.isTestSession || listo?.formato != nil || medido != nil || escrita != nil {
            FlowLayout(spacing: Theme.Spacing.s) {
                if dia.sesiones.count > 1 { PastillaPlan(texto: principal.franja) }
                if principal.isSelfOrigin { PastillaPlan(texto: "Libre") }
                if principal.isTestSession { PastillaPlan(texto: "Test", glifo: .cronometro) }
                if let formato = listo?.formato { PastillaPlan(texto: formato) }
                if let medido {
                    PastillaPlan(texto: "Duró \(medido)", glifo: .cronometro)
                } else if let escrita {
                    // Solo lleva peso cuando lleva NÚMERO: una razón («Dura lo que tardes») no es un dato.
                    PastillaPlan(texto: escrita, glifo: .cronometro, enfasis: DuracionDeSesion.llevaNumero(principal))
                }
            }
        }
    }
}

// MARK: - Las partes

struct ListaDePartesPlan: View {
    let desglose: DesgloseSesion

    @Environment(\.tonoDia) private var tono

    private var partes: [ParteDeSesion] { Array(desglose.partes.prefix(DesgloseSesion.maxPartes)) }
    private var deMas: Int { max(0, desglose.partes.count - partes.count) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(partes) { parte in
                // Con UN solo bloque su título repite el de la sesión: encabezar la lista con él no dice nada.
                FilaDeParteDelPlan(parte: parte, mostrarTitulo: partes.count > 1)
            }
            if deMas > 0 {
                Text(deMas == 1 ? "1 parte más" : "\(deMas) partes más")
                    .papel(.notaPesada)
                    .foregroundStyle(tono.papeles.tinta)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 10)
                    .overlay(alignment: .top) { Rectangle().fill(tono.lineaInterior).frame(height: 1) }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("De qué está hecha la sesión")
    }
}

/// UNA parte de la sesión: su punto de modalidad, su título y cuántos ejercicios lleva, y los NOMBRES de los
/// ejercicios (cada uno su fila, nunca un recuento ni una frase con comas). El marco (calentamiento, vuelta
/// a la calma) no es el trabajo: se dice y no se lista.
struct FilaDeParteDelPlan: View {
    let parte: ParteDeSesion
    let mostrarTitulo: Bool

    @Environment(\.tonoDia) private var tono

    private var tinta: SwiftUI.Color { tono.papeles.tinta }
    private var nombres: [String] { parte.estructural ? [] : parte.nombresVisibles }
    private var deMas: Int { parte.estructural ? 0 : parte.nombresDeMas }

    private var punto: some View {
        ModalityDot(modality: parte.modalidad, size: parte.estructural ? 8 : 10, tinta: tono == .accion ? tinta : nil)
    }

    private var titulo: some View {
        Text(parte.titulo).papel(parte.estructural ? .cuerpo : .cuerpoFuerte).foregroundStyle(tinta)
    }

    private var recuento: some View {
        Text(parte.ejercicios == 1 ? "1 ejercicio" : "\(parte.ejercicios) ejercicios")
            .papel(.nota).monospacedDigit().foregroundStyle(tinta)
    }

    /// El título y cuántos ejercicios lleva, en una línea; con el texto muy grande el recuento baja debajo en vez de
    /// partir el título por la mitad de una palabra («Calenta/miento»).
    private var cabecera: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                punto
                titulo.lineLimit(1).fixedSize(horizontal: true, vertical: false)
                Spacer(minLength: Theme.Spacing.s)
                recuento.fixedSize(horizontal: true, vertical: false)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 10) {
                    punto
                    titulo.frame(maxWidth: .infinity, alignment: .leading)
                }
                recuento.padding(.leading, 20)
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            if mostrarTitulo { cabecera }
            if !nombres.isEmpty || deMas > 0 {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(nombres, id: \.self) { nombre in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Circle().fill(tinta).frame(width: 4, height: 4).offset(y: -2)
                            Text(nombre).papel(.nota).foregroundStyle(tinta)
                        }
                    }
                    if deMas > 0 {
                        Text("+ \(deMas) más").papel(.notaPesada).foregroundStyle(tinta).padding(.leading, 14)
                    }
                }
                .padding(.leading, mostrarTitulo ? 20 : 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Theme.Spacing.m)
        .overlay(alignment: .top) { Rectangle().fill(tono.lineaInterior).frame(height: 1) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(mostrarTitulo ? "\(parte.titulo): \(parte.resumenDeNombres)" : parte.resumenDeNombres)
    }
}

/// Mismo tamaño que las filas que sustituye: al llegar el desglose, nada salta.
struct PartesEsqueletoPlan: View {
    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<3, id: \.self) { i in
                VStack(alignment: .leading, spacing: 9) {
                    SkeletonBar(height: 17, radius: 5).padding(.trailing, i == 1 ? 140 : 100)
                    if i == 1 { SkeletonBar(width: 130, height: 15, radius: 5).padding(.leading, 20) }
                }
                .padding(.vertical, Theme.Spacing.m)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { Rectangle().fill(Theme.Color.hairlineStrong).frame(height: 1) }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando las partes de la sesión")
        .accessibilityAddTraits(.updatesFrequently)
    }
}

// MARK: - La nota del coach

/// Lo que el coach escribió para ESTA sesión (no la ficha del ejercicio). Va marcada con su filo: el sistema no
/// escribe ahí. La dosis nunca ocupa este sitio; sin nota, se calla.
struct NotaDelCoachPlan: View {
    let texto: String
    let coach: String?

    @Environment(\.tonoDia) private var tono

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(tono == .accion ? tono.papeles.tinta.opacity(0.55) : Theme.Color.accent)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 4) {
                Text(coach.map { "Nota de \($0)" } ?? "Nota de tu coach")
                    .papel(.etiqueta)
                Text(texto)
                    .papel(.cuerpo)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(tono.papeles.tinta)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Ayer y mañana, dentro de la card

/// Una fila dentro de la card que lleva a otra sesión (ayer, mañana, lo siguiente). No es una tarjeta dentro de
/// otra: es una fila (un velo de la tinta del tema con su filo).
struct FilaContextoPlan: View {
    let etiqueta: String
    let titulo: String
    let modalidad: String?
    let detalle: String?
    /// El sello de cómo fue (ayer). Lo que aún no ha pasado no lleva ninguno.
    let estado: EstadoSesion?
    let accesible: String
    let alTocar: () -> Void

    var body: some View {
        Button(action: { Haptics.light(); alTocar() }) {
            HStack(spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(etiqueta).papel(.etiqueta).lineLimit(1)
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                        ModalityDot(modality: modalidad, size: 9).offset(y: -1)
                        Text(titulo).papel(.cuerpoFuerte).lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if detalle != nil || estado != nil {
                    HStack(spacing: 6) {
                        if let estado { SelloEstadoDia(estado: estado.sello, tam: 20) }
                        if let detalle { Text(detalle).papel(estado == nil ? .notaFuerte : .notaPesada).monospacedDigit() }
                    }
                }
                IconoDia(.chevron, tam: 16, peso: .bold)
            }
            .foregroundStyle(Theme.Color.foreground)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(minHeight: 68)
            .background(Theme.Color.foreground.opacity(0.07), in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous).strokeBorder(Theme.Color.foreground.opacity(0.12), lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accesible)
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Descanso

/// El día sin nada — y va en LA MISMA card que un día con sesión (mismo cascarón, otro contenido). No se
/// fabrica una sesión. Solo el descanso de HOY enseña de dónde vienes y a dónde vas: hojeando otro día, ese
/// marco sería el de hoy colgado de un día que no lo es (§7). Ayer se cuenta con lo MEDIDO, jamás con lo
/// previsto; sin medida se dice qué pasó.
struct SujetoDescansoPlan: View {
    let l: LecturaPlan
    let dia: DiaDelPlan
    let conContexto: Bool
    let semana: SemanaDelPlan
    let tono: TonoDia
    let indice: Int?
    let alAbrir: (AthleteWeekDaySession) -> Void

    private var ayer: (dia: DiaDelPlan, sesion: AthleteWeekDaySession)? { conContexto ? semana.sesionDeAyer : nil }
    private var siguiente: (dia: DiaDelPlan, sesion: AthleteWeekDaySession)? { conContexto ? semana.sesionDeManana : nil }

    private var detalleDeAyer: String? {
        guard let ayer else { return nil }
        guard ayer.sesion.estado.trabajada else { return "sin registrar" }
        return l.desglose(de: ayer.sesion.assignmentId).listo?.medidoMin.flatMap(Formato.duracion)
            ?? ayer.sesion.estado.etiqueta.lowercased()
    }

    var body: some View {
        SujetoDia(
            tono: tono,
            etiqueta: "\(PlanTextos.Descanso.titulo(esHoy: dia.esHoy)). \(FechasDelPlan.etiqueta(de: dia.isoDate, hoy: l.hoyIso))"
        ) {
            KickerDia(FechasDelPlan.etiqueta(de: dia.isoDate, hoy: l.hoyIso)) {
                PastillaPlan(texto: PlanTextos.Descanso.kicker, papel: .estado, sello: .pendiente)
            }
            TituloPlan(texto: PlanTextos.Descanso.titulo(esHoy: dia.esHoy))
            ApoyoDia(PlanTextos.Descanso.apoyo(esHoy: dia.esHoy))
        } abajo: {
            if conContexto {
                if ayer != nil || siguiente != nil {
                    VStack(alignment: .leading, spacing: 10) {
                        if let ayer {
                            FilaContextoPlan(
                                etiqueta: FechasDelPlan.rotulo(de: ayer.dia.isoDate, hoy: l.hoyIso),
                                titulo: ayer.sesion.title, modalidad: ayer.sesion.modality, detalle: detalleDeAyer,
                                estado: ayer.sesion.estado.efectivo(enDia: ayer.dia.isoDate, hoy: l.hoyIso),
                                accesible: [FechasDelPlan.etiqueta(de: ayer.dia.isoDate, hoy: l.hoyIso), ayer.sesion.title, detalleDeAyer]
                                    .compactMap { $0 }.joined(separator: ", "),
                                alTocar: { alAbrir(ayer.sesion) })
                        }
                        if let siguiente {
                            FilaContextoPlan(
                                etiqueta: FechasDelPlan.rotulo(de: siguiente.dia.isoDate, hoy: l.hoyIso),
                                titulo: siguiente.sesion.title, modalidad: siguiente.sesion.modality,
                                detalle: DuracionDeSesion.texto(siguiente.sesion), estado: nil,
                                accesible: [FechasDelPlan.etiqueta(de: siguiente.dia.isoDate, hoy: l.hoyIso), siguiente.sesion.title, DuracionDeSesion.texto(siguiente.sesion)]
                                    .compactMap { $0 }.joined(separator: ", "),
                                alTocar: { alAbrir(siguiente.sesion) })
                        } else {
                            semanaCerrada
                        }
                    }
                    .padding(.top, Theme.Spacing.l)
                    .overlay(alignment: .top) { Rectangle().fill(tono.lineaInterior).frame(height: 1) }
                } else {
                    semanaCerrada
                }
            }
        }
        .overlay(alignment: .top) { if let indice { MuescaPlan(indice: indice, tono: tono) } }
    }

    private var semanaCerrada: some View {
        Text(PlanTextos.Descanso.semanaCerrada)
            .papel(.notaFuerte)
            .foregroundStyle(tono.papeles.tinta)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

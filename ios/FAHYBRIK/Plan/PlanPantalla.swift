import SwiftUI

// LA PANTALLA DE PLAN, PINTADA — las tres piezas que salen de una lectura ya resuelta: el cromo de arriba, la
// columna que scrollea y el anclaje de abajo. Ninguna carga, ninguna decide, ninguna conoce el `AppDataStore`:
// reciben `LecturaPlan` + `VistaPlan` (lo que decidió `PlanLectura`) y las cosas que hacer cuando se toca algo.
//
// Por eso `PlanView` (que carga, navega y presenta) las compone con un `FillingScreen` y `.anchoredAction`, y
// por eso la galería de pruebas (`PlanGaleriaRenderTests`) puede pintar cada caso: `ImageRenderer` no dibuja un
// `ScrollView`, así que la galería pone la MISMA columna en un alto fijo y lee lo que la app leería.

/// Lo que la pantalla hace cuando se toca algo. Todo por defecto es un no-op: las `#Preview` y la galería
/// pintan sin conectar nada; `PlanView` lo conecta entero.
struct AccionesDePlan {
    var alDobles: () -> Void = {}
    var alCompartir: (SemanaDelPlan) -> Void = { _ in }
    var alCiclo: () -> Void = {}
    var alHistorial: () -> Void = {}
    var alChat: () -> Void = {}
    var alPulsarDia: (DiaDelPlan) -> Void = { _ in }
    /// -1 = hacia atrás, 1 = hacia delante.
    var alDeslizar: (Int) -> Void = { _ in }
    var alAtras: () -> Void = {}
    var alAdelante: () -> Void = {}
    var alVolver: () -> Void = {}
    var alAccion: (AccionAnclada) -> Void = { _ in }
    var alAbrir: (AthleteWeekDaySession) -> Void = { _ in }
    var menuDeSesion: (AthleteWeekDaySession, SemanaDelPlan?) -> AnyView = { _, _ in AnyView(EmptyView()) }
    var menuDelDia: (DiaDelPlan, SemanaDelPlan?) -> AnyView = { _, _ in AnyView(EmptyView()) }
}

extension VistaPlan {
    /// La semana que la vista enseña, si la hay (no la hay cargando, en pausa, en error ni en un vacío).
    var semana: SemanaDelPlan? {
        if case let .semana(_, s, _) = self { return s }
        return nil
    }
}

// MARK: - La pantalla entera

/// La pantalla con coach: el cromo fijo arriba, la columna que scrollea (`llena`: el sujeto se lleva el sobrante) y el
/// anclaje de abajo. Es lo que compone `PlanView` con sus datos y lo que pintan las `#Preview` de cada caso.
struct PlanPantalla<Arriba: View>: View {
    let l: LecturaPlan
    let v: VistaPlan
    let acciones: AccionesDePlan
    /// «Reintentar» está en marcha: la pastilla gira y dice «Reintentando».
    var reintentando = false
    @ViewBuilder let arriba: () -> Arriba

    var body: some View {
        VStack(spacing: 0) {
            PlanCromoDeLectura(l: l, v: v, acciones: acciones)
            FillingScreen {
                PlanColumna(l: l, v: v, acciones: acciones, arriba: arriba)
            }
        }
        .anclando(si: PlanAnclaje.hay(v, l)) {
            PlanAnclaje(l: l, v: v, acciones: acciones, enCurso: reintentando)
        }
    }
}

extension PlanPantalla where Arriba == EmptyView {
    init(l: LecturaPlan, v: VistaPlan, acciones: AccionesDePlan, reintentando: Bool = false) {
        self.init(l: l, v: v, acciones: acciones, reintentando: reintentando, arriba: { EmptyView() })
    }
}

// MARK: - El cromo

/// El cromo de la lectura: el historial y el chat no dependen de que haya plan, así que salen SIEMPRE; compartir
/// solo con una semana con sesiones delante.
struct PlanCromoDeLectura: View {
    let l: LecturaPlan
    let v: VistaPlan
    let acciones: AccionesDePlan

    var body: some View {
        PlanCromo(
            companero: l.companero,
            conSemana: v.semana?.tieneAlgunaSesion == true,
            conChat: true,
            alDobles: acciones.alDobles,
            alCompartir: { if let semana = v.semana { acciones.alCompartir(semana) } },
            alCiclo: acciones.alCiclo,
            alHistorial: acciones.alHistorial,
            alChat: acciones.alChat
        )
    }
}

// MARK: - La columna

/// Lo que scrollea: cabecera, carril y sujeto. El sujeto es lo ÚNICO que pide el sobrante (§6.1 `llena`); un
/// estado sin día que mostrar se CENTRA en el alto que queda. La tira de retomar un entreno, que solo existe en
/// la app, entra por `arriba`.
struct PlanColumna<Arriba: View>: View {
    let l: LecturaPlan
    let v: VistaPlan
    let acciones: AccionesDePlan
    @ViewBuilder let arriba: () -> Arriba

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            arriba()
            cabecera
            carril
            sujeto
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.top, 6)
        .padding(.bottom, Theme.Spacing.xl)
    }

    // MARK: cabecera

    @ViewBuilder
    private var cabecera: some View {
        switch v {
        case .cargando:
            CabeceraPlanEsqueleto()
        case let .semana(offset, semana, cuerpo):
            let puede = l.puedeAvanzar(offset: offset)
            CabeceraPlan(
                nombreBloque: semana?.nombreBloque,
                titulo: tituloDeSemana(semana?.posicion, offset: offset),
                rango: semana.flatMap { s in
                    FechasDelPlan.rango(desde: s.dias.first?.isoDate ?? "", hasta: s.dias.last?.isoDate ?? "")
                },
                intencion: semana?.intencion,
                hojeando: offset > 0,
                puedeAdelante: puede,
                adelanteBloqueado: !puede && l.bloqueadaPorElClub(offset: offset),
                cargando: cuerpo == .semanaCargando,
                alAtras: acciones.alAtras, alAdelante: acciones.alAdelante, alVolver: acciones.alVolver
            )
        default:
            EmptyView()
        }
    }

    // MARK: carril

    @ViewBuilder
    private var carril: some View {
        switch v {
        case .cargando:
            CarrilPlanEsqueleto()
        case let .semana(_, semana, cuerpo):
            if cuerpo == .semanaCargando {
                CarrilPlanEsqueleto()
            } else if let semana {
                CarrilPlan(
                    dias: semana.dias, hoyIso: l.hoyIso, mostradoIso: diaMostradoIso(cuerpo), tono: v.tono,
                    alPulsar: acciones.alPulsarDia, alDeslizar: acciones.alDeslizar,
                    menu: { dia in acciones.menuDelDia(dia, semana) })
            }
        default:
            EmptyView()
        }
    }

    private func diaMostradoIso(_ c: CuerpoPlan) -> String? {
        switch c {
        case let .sesion(dia, _, _, _), let .descanso(dia, _): return dia.isoDate
        default: return nil
        }
    }

    // MARK: sujeto

    @ViewBuilder
    private var sujeto: some View {
        let tono = v.tono
        switch v {
        case .cargando:
            SujetoPlanEsqueleto()
        case let .semana(offset, semana, cuerpo):
            switch cuerpo {
            case .semanaCargando:
                SujetoPlanEsqueleto()
            case let .sesion(dia, principal, otras, estado):
                if let semana {
                    VStack(spacing: Theme.Spacing.m) {
                        SujetoSesionPlan(
                            l: l, dia: dia, principal: principal, estado: estado, semana: semana, offset: offset,
                            desglose: l.desglose(de: principal.assignmentId), tono: tono,
                            indice: semana.dias.firstIndex { $0.isoDate == dia.isoDate },
                            alAbrir: acciones.alAbrir)
                        ForEach(otras) { otra in
                            FilaSesionPlan(
                                sesion: otra, dia: dia, l: l,
                                alAbrir: { acciones.alAbrir(otra) },
                                menu: { acciones.menuDeSesion(otra, semana) })
                        }
                    }
                    .frame(maxHeight: .infinity)
                    .id("\(offset)|\(dia.isoDate)|\(principal.assignmentId)")
                    .transition(.opacity)
                }
            case let .descanso(dia, conContexto):
                if let semana {
                    SujetoDescansoPlan(
                        l: l, dia: dia, conContexto: conContexto, semana: semana, tono: tono,
                        indice: semana.dias.firstIndex { $0.isoDate == dia.isoDate },
                        alAbrir: acciones.alAbrir)
                        .id("\(offset)|\(dia.isoDate)")
                        .transition(.opacity)
                }
            case .semanaFalla, .semanaVacia:
                centrado { SujetoEstadoPlan(v: v, l: l, tono: tono) }
            }
        case .error, .pausa, .sinPlan:
            centrado { SujetoEstadoPlan(v: v, l: l, tono: tono) }
        }
    }

    /// Una sola decisión: el bloque se centra en el alto que sobra, con el aire simétrico (`centra`).
    private func centrado<Contenido: View>(@ViewBuilder _ contenido: () -> Contenido) -> some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            contenido()
            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity)
    }
}

extension PlanColumna where Arriba == EmptyView {
    init(l: LecturaPlan, v: VistaPlan, acciones: AccionesDePlan) {
        self.init(l: l, v: v, acciones: acciones, arriba: { EmptyView() })
    }
}

// MARK: - El anclaje

/// Lo que va anclado abajo: el esqueleto de la acción mientras carga, la acción del estado, o nada (un vacío que
/// no tiene salida y lo dice: un pie vacío dejaría una barra muerta con su filete).
struct PlanAnclaje: View {
    let l: LecturaPlan
    let v: VistaPlan
    let acciones: AccionesDePlan
    var enCurso = false

    /// ¿Hay algo que anclar? Lo decide quien monta el pie, para no dibujar un pie vacío.
    static func hay(_ v: VistaPlan, _ l: LecturaPlan) -> Bool {
        v == .cargando || v.accion(en: l) != nil
    }

    var body: some View {
        if v == .cargando {
            AccionAncladaPlanEsqueleto()
        } else if let accion = v.accion(en: l) {
            AccionAncladaPlan(
                texto: accion.texto(coach: l.coach), simbolo: accion.simbolo, glifoAlFinal: accion.simboloAlFinal,
                enCurso: enCurso && accion == .reintentar, conMenu: accion.conMenu,
                alTocar: { acciones.alAccion(accion) },
                menu: {
                    switch accion {
                    case let .empezar(sesion, _), let .verHecho(sesion, _):
                        acciones.menuDeSesion(sesion, v.semana)
                    default:
                        EmptyView()
                    }
                })
        }
    }
}

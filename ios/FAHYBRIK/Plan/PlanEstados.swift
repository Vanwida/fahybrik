import SwiftUI

// LOS ESTADOS SIN DÍA QUE MOSTRAR — cada uno con SU motivo dicho y su salida (CONTRATO-UI §5: un vacío
// siempre lleva salida, o una frase que declare por qué no la hay). La acción de cada uno vive en la acción
// anclada de abajo, no aquí: la misma puerta, en el mismo sitio, en todos los estados.
//
//   · cargando  → esqueleto con la forma de la card (no un vacío: aún no sabemos)
//   · error     → sin semana y sin caché; «Reintentar»
//   · pausa     → el coach paró el plan: ni error ni vacío; el progreso está guardado
//   · sin plan  → EMPIEZA DESPUÉS (con la fecha exacta) o SE ESTÁ PREPARANDO; ninguno afirma qué hará el
//                 coach ni cuándo (DECISIONS 7-ago)
//   · semana que viene: falla o llegó vacía
//
// Es UNA decisión y por eso se CENTRA (§6.1 `centra`): el aire es simétrico, en vez de una card enorme y
// vacía. `SujetoDia` pide todo el alto que sobre; aquí se ata a su alto natural y quien lo pone lo centra.

/// El contenido de un estado sin día: kicker, título, apoyo y, si hace falta, una nota y algo a la derecha.
struct SujetoEstadoPlan: View {
    let v: VistaPlan
    let l: LecturaPlan
    let tono: TonoDia

    var body: some View {
        switch v {
        case .error:
            bloque(kicker: PlanTextos.ErrorDeCarga.kicker, titulo: PlanTextos.ErrorDeCarga.titulo, apoyo: PlanTextos.ErrorDeCarga.apoyo, anuncia: true)
        case let .pausa(desde):
            bloque(
                kicker: PlanTextos.Pausa.kicker, titulo: PlanTextos.Pausa.titulo,
                apoyo: PlanTextos.Pausa.apoyo(coach: l.coach), nota: PlanTextos.Pausa.nota(desde: desde),
                aparte: AnyView(IconoDia(.pausa, tam: 30, peso: .regular).foregroundStyle(Theme.Color.foreground)))
        case let .sinPlan(motivo, inicio):
            if motivo == .empiezaDespues, let inicio {
                bloque(
                    kicker: PlanTextos.EmpiezaDespues.kicker, titulo: PlanTextos.EmpiezaDespues.titulo(inicio: inicio),
                    apoyo: PlanTextos.EmpiezaDespues.apoyo,
                    // Sin semana que ver, la frase dice por qué no hay salida.
                    nota: l.actual?.hasNextWeek == true ? nil : PlanTextos.EmpiezaDespues.nota,
                    aparte: FechasDelPlan.faltanParaEmpezar(hoy: l.hoyIso, inicio: inicio).map { AnyView(InfoPill(text: $0, estilo: .tinta)) })
            } else {
                bloque(kicker: PlanTextos.Preparando.kicker, titulo: PlanTextos.Preparando.titulo, apoyo: PlanTextos.Preparando.apoyo(coach: l.coach))
            }
        case let .semana(_, _, cuerpo):
            switch cuerpo {
            case .semanaFalla:
                bloque(kicker: PlanTextos.SemanaFalla.kicker, titulo: PlanTextos.SemanaFalla.titulo, apoyo: PlanTextos.SemanaFalla.apoyo, anuncia: true)
            case .semanaVacia:
                bloque(kicker: PlanTextos.SemanaVacia.kicker, titulo: PlanTextos.SemanaVacia.titulo, apoyo: PlanTextos.SemanaVacia.apoyo)
            default:
                EmptyView()
            }
        case .cargando:
            EmptyView()
        }
    }

    private func bloque(
        kicker: String, titulo: String, apoyo: String, nota: String? = nil, aparte: AnyView? = nil, anuncia: Bool = false
    ) -> some View {
        SujetoDia(tono: tono, etiqueta: titulo, anuncia: anuncia) {
            KickerDia(kicker) { aparte }
            TituloDia(titulo, ajuste: .escalones)
            ApoyoDia(apoyo)
        } abajo: {
            if let nota { ApoyoDia(nota) }
        }
        // Una decisión, no una lista: la card mide lo suyo y el aire sobrante es simétrico (`centra`).
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// La card en frío: la MISMA silueta que la de un día con sesión (fecha, título de dos líneas, pastillas, tres partes).
struct SujetoPlanEsqueleto: View {
    var body: some View {
        SujetoDia(tono: .neutro, etiqueta: "Cargando tu plan") {
            SkeletonBar(width: 150, height: 15, radius: 5).frame(minHeight: 32)
            SkeletonBar(height: 44, radius: 10).padding(.trailing, 80)
            SkeletonBar(height: 44, radius: 10).padding(.trailing, 150)
            HStack(spacing: Theme.Spacing.s) {
                SkeletonBar(width: 96, height: 32, radius: 16)
                SkeletonBar(width: 120, height: 32, radius: 16)
            }
        } abajo: {
            ForEach(0..<3, id: \.self) { i in
                VStack(alignment: .leading, spacing: 9) {
                    SkeletonBar(height: 17, radius: 5).padding(.trailing, i == 1 ? 130 : 110)
                    if i == 1 { SkeletonBar(width: 130, height: 15, radius: 5) }
                }
                .padding(.top, Theme.Spacing.m)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { Hairline(fuerte: true) }
            }
        }
    }
}

import SwiftUI

// EL RESUMEN DE CORREDOR — un sujeto por página, la corona baja (P13).
//
//   Resumen   lo que un corredor mira primero: «5 de 6 dentro» (o los km), cuánto y en cuánto tiempo, el ritmo de lo
//             FUERTE y dónde está lo guardado, dicho con honestidad.
//   Series    cada serie contra SU objetivo, con la marca ▲▼ (`MunecaVueltas`, la misma página que el vivo).
//   Km        cada km (o vuelta) automático.
//   Pulso     medio y máximo, y el tiempo en cada zona del coach.
//   Guardado  dónde está la sesión, el RPE que se dio y «Listo».
//
// Qué se dice lo decide `Vivo.resumenDeCorrer`; aquí solo se dibuja. Lo que el motor no mide no se inventa: no hay
// desnivel por km (nadie lo mide en la muñeca) y un pulso que nadie tomó es «—».

struct FinalResumenCorrer: View {
    let resumen: Vivo.ResumenCorrer
    let session: WorkoutSession
    let coordinator: WatchWorkoutCoordinator
    let alListo: () -> Void

    var body: some View {
        MunecaMedidor { medidas in
            TabView {
                // Cada página mide TODA la pantalla (como en la pila del vivo): el paginador la metía dentro
                // del safe area del sistema y el núcleo ya descuenta él las safe areas.
                Group {
                    primera(medidas)
                    ForEach(Array(resumen.series.enumerated()), id: \.offset) { _, p in MunecaVueltas(pagina: p) }
                    ForEach(Array(resumen.km.enumerated()), id: \.offset) { _, p in MunecaVueltas(pagina: p) }
                    pulso(medidas)
                    guardado
                }
                .ignoresSafeArea()
            }
            .tabViewStyle(.verticalPage)
        }
        .background(MunecaPaleta.fondo.ignoresSafeArea())
    }

    // MARK: - Lo que un corredor mira primero

    private func primera(_ medidas: Vivo.MedidasMuneca) -> some View {
        MunecaColumna {
            MunecaContexto(partes: resumen.contexto, medidas: medidas, tono: MunecaPaleta.tinta)
            Spacer(minLength: 0)
            HStack(alignment: .firstTextBaseline, spacing: CGFloat(Vivo.huecoUnidad)) {
                Text(resumen.heroe.valor)
                    .font(MunecaTipo.fuente(Vivo.TipoMuneca.segundo * FinalForma.escalaHeroe, 600))
                    .foregroundStyle(MunecaPaleta.tinta)
                if let unidad = resumen.heroe.unidad {
                    Text(unidad).font(MunecaTipo.fuente(Vivo.TipoMuneca.tercero, 600)).foregroundStyle(MunecaPaleta.tinta2)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            Spacer(minLength: 0)
            ForEach(Array(resumen.lineas.enumerated()), id: \.offset) { _, l in FinalDato(dato: l) }
            FinalLineaGuardado(coordinator: coordinator)
        }
    }

    // MARK: - El pulso y sus zonas

    private func pulso(_ medidas: Vivo.MedidasMuneca) -> some View {
        MunecaColumna(alineacion: .leading) {
            MunecaContexto(partes: ["Pulso", "ppm"], medidas: medidas)
                .frame(maxWidth: .infinity, alignment: .center)
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(resumen.pulso.medio.map(String.init) ?? "—")
                    .font(MunecaTipo.fuente(Vivo.TipoMuneca.tercero, MunecaTipo.pesoDato)).foregroundStyle(MunecaPaleta.tinta)
                Text("medio").font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta2)
                if let maximo = resumen.pulso.maximo {
                    Text("·").font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta2)
                    Text(String(maximo)).font(MunecaTipo.fuente(Vivo.TipoMuneca.tercero, MunecaTipo.pesoDato)).foregroundStyle(MunecaPaleta.tinta)
                    Text("máx").font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta2)
                }
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity)
            ForEach(Array(resumen.pulso.zonasS.enumerated()), id: \.offset) { i, s in
                filaDeZona(n: i + 1, de: resumen.pulso.zonasS.count, segundos: s)
            }
        }
    }

    private func filaDeZona(n: Int, de total: Int, segundos: Double) -> some View {
        let mayor = Swift.max(1, resumen.pulso.zonasS.max() ?? 1)
        let color = MunecaPaleta.zona(Vivo.colorZona(n, total))
        return HStack(spacing: 6) {
            Text("Z\(n)").font(MunecaTipo.notaNegrita).foregroundStyle(color).frame(width: FinalForma.anchoZona, alignment: .leading)
            ZStack(alignment: .leading) {
                Capsule().fill(MunecaPaleta.carril)
                GeometryReader { g in Capsule().fill(color).frame(width: g.size.width * CGFloat(segundos / mayor)) }
            }
            .frame(height: FinalForma.altoBarraZona)
            Text(segundos > 0 ? Vivo.fmtReloj(segundos) : "—")
                .font(MunecaTipo.nota).foregroundStyle(segundos > 0 ? MunecaPaleta.tinta : MunecaPaleta.tinta2)
                .frame(minWidth: FinalForma.anchoTiempoZona, alignment: .trailing)
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Dónde está lo guardado

    private var guardado: some View {
        FinalGuardadoPagina(session: session, coordinator: coordinator, alListo: alListo)
    }
}

// MARK: - El estado de guardado

/// La línea corta de la primera página: dónde está la sesión, releída cada poco (el acuse llega solo).
struct FinalLineaGuardado: View {
    let coordinator: WatchWorkoutCoordinator

    var body: some View {
        TimelineView(.periodic(from: .now, by: FinalForma.releerGuardadoS)) { _ in
            let estado = coordinator.estadoDeGuardado()
            let firme = estado == .guardado || estado == .enMovil
            Label(estado.corto, systemImage: estado.glifo)
                .font(firme ? MunecaTipo.notaSemibold : MunecaTipo.nota)
                .foregroundStyle(firme ? MunecaPaleta.tinta : MunecaPaleta.tinta2)
                .lineLimit(1)
                .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.nota))
        }
    }
}

/// La última página: dónde está la sesión, el RPE que se dio y «Listo».
struct FinalGuardadoPagina: View {
    let session: WorkoutSession
    let coordinator: WatchWorkoutCoordinator
    let alListo: () -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: FinalForma.releerGuardadoS)) { _ in
            let estado = coordinator.estadoDeGuardado()
            MunecaColumna {
                Spacer(minLength: 0)
                Image(systemName: estado.glifo)
                    .font(.system(size: FinalForma.glifoGuardado, weight: .light))
                    .foregroundStyle(MunecaPaleta.tinta)
                    .accessibilityHidden(true)
                Text(estado.corto)
                    .font(MunecaTipo.fuente(Vivo.TipoMuneca.tercero, 600))
                    .foregroundStyle(MunecaPaleta.tinta)
                    .lineLimit(1)
                    .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.tercero))
                FinalNota(texto: estado.detalle)
                FinalNota(texto: rpeDicho, tono: MunecaPaleta.tinta)
                if let solaS = session.guardadaSolaTrasS {
                    FinalNota(texto: "Guardada sola · \(Vivo.fmtDuracion(solaS)) sin moverte")
                }
                Spacer(minLength: 0)
                MunecaBoton(titulo: "Listo", accion: alListo)
                    .padding(.horizontal, 4)
                    .frame(height: MunecaForma.altoBoton)
            }
        }
    }

    private var rpeDicho: String {
        guard let rpe = coordinator.rpe else { return "Sin RPE" }
        return "RPE \(rpe) · \(Vivo.palabraDelRpe(rpe, metodo: session.plan.wristMethod))"
    }
}

import SwiftUI

// «CÓMO LLEGAS HOY» — la disposición, subordinada.
//
// Una tira compacta (anillo, lectura y las cuatro señales en línea) que ya no es un héroe: el sujeto es
// el momento del día, y esto es el contexto con el que lo vives. El COLOR de la zona va en el arco y
// nunca en la cifra: una de 38 en rojo grande se lee como alarma y una de 91 en verde como aplauso, y la
// portada dice el estado del cuerpo, no un veredicto. La lectura es del ESTADO DEL CUERPO, jamás una
// prescripción (eso es método del coach), y los cortes de las zonas son `ReadinessZone`: la vista no
// escribe ni un 67 ni un 45.
//
// Estados: medida · sin datos (tres motivos, cada uno con su salida) · en frío (esqueleto con la misma
// forma). Cuando el sujeto ES el check-in y no hay número, el sujeto ya lo dice todo y la tira se calla
// (dos piezas diciendo lo mismo es ruido).

struct HoyDisposicion: View {
    let lectura: LecturaHoy
    let momento: MomentoHoy
    /// Cómo se cerró el check-in desde aquí mismo, si se cerró (la cifra tarda unos segundos en llegar).
    let cierre: CierreDelCheckin?
    let acciones: HoyAcciones

    /// El anillo de la cifra: el mismo tamaño en la cifra y en su esqueleto, para que nada salte.
    private static let diametroDelAnillo: CGFloat = 68
    private static let trazoDelAnillo: CGFloat = 6

    /// El check-in sigue por hacer y NO es ya el sujeto: la salida de un toque va aquí.
    private var conFilaDeCheckin: Bool {
        lectura.checkinPendiente && momento.tipo != .checkin
    }

    var body: some View {
        if lectura.cargando {
            esqueleto
        } else {
            switch lectura.disposicion {
            case .cargando:
                esqueleto
            case .sinDatos(let motivo):
                if momento.tipo != .checkin { sinDatos(motivo) }
            case .medida(let score, let delta7d, let senales):
                medida(score: score, delta7d: delta7d, senales: senales)
            }
        }
    }

    // MARK: - Medida

    private func medida(score: Int, delta7d: Int?, senales: [Senal]) -> some View {
        let zona = ReadinessZone.of(score: score)
        return VStack(alignment: .leading, spacing: 0) {
            Button(action: acciones.abrirDisposicion) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("Cómo llegas hoy").papel(.etiqueta).foregroundStyle(Theme.Color.muted)
                        Spacer(minLength: 0)
                        IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
                    }
                    HStack(spacing: Theme.Spacing.l) {
                        RecoveryRing(value: score, size: Self.diametroDelAnillo, stroke: Self.trazoDelAnillo, color: zona.color)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(zona.interpretation)
                                .papel(.cuerpoFuerte)
                                .foregroundStyle(Theme.Color.foreground)
                            if let delta7d { deltaEn7Dias(delta7d) }
                        }
                        Spacer(minLength: 0)
                    }
                    if !senales.isEmpty { tiraDeSenales(senales) }
                }
                .padding(Theme.Spacing.l)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.99))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(etiquetaAccesible(score: score, zona: zona, delta7d: delta7d))
            .accessibilityAddTraits(.isButton)

            if conFilaDeCheckin { filaDeSalida("Hacer el check-in de hoy", accion: acciones.hacerCheckin) }
        }
        .tarjetaDia()
    }

    private func deltaEn7Dias(_ delta: Int) -> some View {
        HStack(spacing: 4) {
            IconoDia(delta >= 0 ? .sube : .baja, tam: 16, peso: .bold)
            Text("\(delta >= 0 ? "+" : "\u{2212}")\(abs(delta)) en 7 días").papel(.rotulo)
        }
        .foregroundStyle(delta >= 0 ? Theme.Color.ok : Theme.Color.warning)
    }

    private func etiquetaAccesible(score: Int, zona: ReadinessZone, delta7d: Int?) -> String {
        var frase = "Cómo llegas hoy: \(score) de 100, \(zona.interpretation)"
        if let delta7d { frase += ", \(delta7d >= 0 ? "sube" : "baja") \(abs(delta7d)) en 7 días" }
        return frase + ". Ver el detalle"
    }

    // MARK: - Las señales

    /// Las cuatro señales en línea; en texto grande no caben y pasan a dos columnas.
    private func tiraDeSenales(_ senales: [Senal]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Hairline()
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: Theme.Spacing.m) {
                    ForEach(senales, id: \.clave) { celda($0) }
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)],
                          alignment: .leading, spacing: Theme.Spacing.m) {
                    ForEach(senales, id: \.clave) { celda($0) }
                }
            }
            .padding(.top, Theme.Spacing.m)
        }
        .accessibilityHidden(true)
    }

    private func celda(_ s: Senal) -> some View {
        // El check-in que se acaba de cerrar aquí manda sobre el dato de partida.
        let esCheckin = s.clave == .checkin
        let activa = s.activa || (esCheckin && cierre == .hecho)
        let valor: String
        if activa {
            valor = s.valor ?? (esCheckin ? "Hecho" : "Recibido")
        } else if esCheckin, cierre == .saltado {
            valor = "Saltado"
        } else if esCheckin, lectura.checkinPendiente {
            valor = "Por hacer"
        } else {
            valor = "Sin dato"
        }
        return VStack(alignment: .leading, spacing: 3) {
            Text(s.etiqueta).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
            Text(valor)
                .papel(activa ? .notaPesada : .nota)
                .foregroundStyle(activa ? Theme.Color.foreground : Theme.Color.muted)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Sin datos

    private func sinDatos(_ motivo: Disposicion.MotivoSinDatos) -> some View {
        let texto: String
        if cierre == .hecho {
            texto = "Check-in hecho. Tu cifra llega en unos segundos."
        } else if cierre == .saltado {
            texto = "Sin check-in hoy no hay cifra. Mañana puedes hacerlo."
        } else {
            switch motivo {
            case .checkinPendiente: texto = "Haz tu check-in matinal y sale tu cifra de hoy."
            case .saludConectada: texto = "Conectado a Apple Salud. Esperando el sueño y la HRV de tu reloj."
            case .saludSinConectar: texto = "Conecta Apple Salud o haz tu check-in."
            }
        }
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Cómo llegas hoy").papel(.etiqueta).foregroundStyle(Theme.Color.muted)
                Text("Sin cifra todavía").papel(.seccion).foregroundStyle(Theme.Color.foreground)
                Text(texto).papel(.cuerpo).foregroundStyle(Theme.Color.muted)
            }
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            if conFilaDeCheckin {
                filaDeSalida("Hacer el check-in de hoy", accion: acciones.hacerCheckin)
            } else if motivo == .saludSinConectar {
                filaDeSalida("Conectar Apple Salud") { acciones.abrirPestana(.perfil) }
            }
        }
        .tarjetaDia()
    }

    // MARK: - En frío

    private var esqueleto: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            SkeletonBar(width: 150, height: 15, radius: 5)
            HStack(spacing: Theme.Spacing.l) {
                SkeletonBar(width: Self.diametroDelAnillo, height: Self.diametroDelAnillo, radius: Self.diametroDelAnillo / 2)
                SkeletonBar(height: 20, radius: 6).frame(maxWidth: 190)
                Spacer(minLength: 0)
            }
            HStack(spacing: Theme.Spacing.s) {
                ForEach(0..<4, id: \.self) { _ in SkeletonBar(height: 38, radius: 6) }
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando cómo llegas hoy")
    }

    // MARK: - Una fila de salida

    /// La fila de abajo de la tarjeta: 48 pt de toque, texto del acento como enlace, con su hilo arriba.
    private func filaDeSalida(_ titulo: String, accion: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            Hairline()
            Button(action: accion) {
                HStack {
                    Text(titulo).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.accentText)
                    Spacer(minLength: Theme.Spacing.m)
                    IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.accentText)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .frame(minHeight: Theme.Size.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.99))
        }
    }
}

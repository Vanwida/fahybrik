import SwiftUI

// LO DE HOY — lo primero que se ve al abrir la app (P13).
//
// «Hoy · desde 55 min», debajo la estructura REAL del plan en filas de dato (la que
// escribió el coach, no «N bloques»), y abajo, fijo, el botón «Empezar». Las filas las
// decide `EntradaBrief` (puro, con tests); esta vista solo las pinta.
//
// Solo el plan del coach tiene «Empezar». Sin su detalle (que viaja del iPhone), o
// para una sesión que la muñeca no puede correr (el test de salto es con la cámara
// del móvil), el brief dice por qué en vez de ofrecer un plan de solo título contra
// la asignación (28-sep). Un día de descanso es honesto: sin botón, solo la frase.
//
// Antes de salir, una sesión de correr en la calle dice cómo va el GPS («Buscando GPS» ▸ «GPS listo», con su
// háptico): la muñeca lo pide con el brief a la vista y lo suelta al empezar (`WatchGpsPrevio`). En cinta no hay GPS
// que decir. Si el plan no dice dónde se corre (M3: calle, cinta o pista), «Empezar» pregunta UNA vez y la respuesta
// vale para toda la sesión (`EntradaDondeView`). Sin pulso fijado antes de empezar (nadie lo mide todavía) ni cue del
// coach salvo donde el plan lo guarda por serie (ver DECISIONS 2026-09-29 y 2026-09-30).
struct EntradaHoyView: View {
    let payload: WatchTodayPayload
    /// Lo que la muñeca puede hacer con la sesión de hoy (`WatchSessionPlan`).
    let sessionPlan: WatchSessionPlan
    /// Empezar, con el entorno que el atleta eligió si el plan no lo decía (`nil` = lo dice el plan, o no es de correr).
    let onStart: (Vivo.Entorno?) -> Void

    /// Lo que el brief sabe de correr antes de salir; se recalcula si llega otro plan.
    @State private var salida = Vivo.SalidaDeCorrer.ninguna
    @State private var preguntando = false
    private let gps = WatchGpsPrevio.shared

    private var plan: WorkoutPlan? { sessionPlan.runnable }
    private var esDescanso: Bool { payload.dayKind == WatchDayKind.rest }

    var body: some View {
        if esDescanso {
            EntradaDescansoView()
        } else if preguntando {
            EntradaDondeView(alElegir: { entorno in
                preguntando = false
                onStart(entorno)
            }, alVolver: { preguntando = false })
        } else {
            sesion
                .task(id: plan?.id) { salida = Vivo.salidaDe(plan) }
                // El GPS se pide con el brief a la vista y solo para la calle; al salir, lo pide la sesión.
                .task(id: salida.usaGps) { if salida.usaGps { gps.activar() } else { gps.soltar() } }
                .onDisappear { gps.soltar() }
        }
    }

    /// «Empezar»: pregunta dónde se corre si el plan no lo dice; si no, sale.
    private func empezar() {
        if salida.preguntar { preguntando = true } else { onStart(nil) }
    }

    private var sesion: some View {
        // El safe de arriba lo lee el GeometryReader y lo respeta el contenido: la hora del
        // sistema ocupa su franja, pero el ScrollView le añade otra encima y sobra un tercio
        // de pantalla en blanco.
        GeometryReader { geo in
            ScrollView {
                VStack(alignment: .leading, spacing: EntradaTipo.huecoFilas) {
                EntradaContexto(partes: EntradaBrief.contexto(minutos: payload.estDurationMinutes))
                if let badge = payload.doublesBadgeText {
                    EntradaDobles(texto: badge)
                }
                if let plan {
                    ForEach(Array(EntradaBrief.filas(plan).enumerated()), id: \.offset) { _, fila in
                        EntradaFilaView(fila: fila)
                    }
                } else {
                    sinPlan
                }
                EntradaVersion()
                }
                .padding(.horizontal, EntradaTipo.lado)
                .padding(.top, geo.safeAreaInsets.top)
                .padding(.bottom, EntradaTipo.safeAbajo)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if plan != nil { barra }
            }
            .ignoresSafeArea(.container, edges: [.top, .bottom])
        }
        .background(WatchTheme.bg.ignoresSafeArea())
    }

    /// Por qué no hay «Empezar», dicho con el nombre de la sesión delante.
    @ViewBuilder
    private var sinPlan: some View {
        Text(payload.title ?? "Sesión")
            .font(.entrada(EntradaTipo.linea))
            .foregroundStyle(WatchTheme.ink)
            .lineLimit(3)
            .minimumScaleFactor(EntradaTipo.escalaSuelo)
            .frame(maxWidth: .infinity, alignment: .leading)
        if let motivo = EntradaBrief.motivo(sessionPlan) {
            Text(motivo)
                .font(.entrada(EntradaTipo.nota, .medium))
                .foregroundStyle(WatchTheme.dim)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// El botón fijo abajo (la barra de watchOS): las filas pasan por debajo con un fundido. Encima, cómo va el GPS
    /// si la sesión sale a la calle.
    private var barra: some View {
        VStack(spacing: EntradaTipo.hueco) {
            if salida.usaGps { EntradaGpsFila(estado: gps.estado) }
            EntradaBoton(titulo: "Empezar", dobleToque: true, etiquetaAccesible: "Empezar entreno", accion: empezar)
        }
            .padding(.horizontal, EntradaTipo.lado)
            .padding(.top, EntradaTipo.fundido)
            .padding(.bottom, EntradaTipo.safeAbajo)
            // Las filas pasan por debajo con un fundido, y bajo el botón el fondo es liso
            // hasta el borde: nada se ve por el hueco de las esquinas redondeadas.
            .background {
                VStack(spacing: 0) {
                    LinearGradient(colors: [.clear, WatchTheme.bg], startPoint: .top, endPoint: .bottom)
                        .frame(height: EntradaTipo.fundido)
                    WatchTheme.bg
                }
                .ignoresSafeArea()
            }
    }
}

// MARK: - El GPS

/// «Buscando GPS» / «GPS listo»: lo que dice la barra de abajo de una sesión que sale a la calle. Nada de un «listo»
/// supuesto: lo dice CoreLocation (`WatchGpsPrevio`).
struct EntradaGpsFila: View {
    let estado: Vivo.EstadoGps

    var body: some View {
        let listo = estado == .listo
        Label(listo ? "GPS listo" : "Buscando GPS", systemImage: listo ? "checkmark.circle" : "location")
            .font(.entrada(EntradaTipo.nota, listo ? .semibold : .medium))
            .foregroundStyle(listo ? WatchTheme.ink : WatchTheme.dim)
            .lineLimit(1)
            .minimumScaleFactor(EntradaTipo.escalaSuelo)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(listo ? "GPS listo" : "Buscando GPS")
    }
}

// MARK: - Una fila

/// Una fila del brief: la marca a la izquierda (naranja el trabajo, gris lo demás), el
/// titular, su detalle y, donde el plan lo trae, la nota del coach.
struct EntradaFilaView: View {
    let fila: EntradaFila

    @Environment(\.isLuminanceReduced) private var atenuado

    private static let prefijoCue = "Coach · "

    var body: some View {
        HStack(alignment: .top, spacing: EntradaTipo.huecoFilas) {
            RoundedRectangle(cornerRadius: EntradaTipo.marcaRadio, style: .continuous)
                .fill(fila.esTrabajo ? WatchTheme.orange : WatchTheme.dim)
                .opacity(fila.esTrabajo ? 1 : EntradaTipo.marcaApagada)
                .frame(width: EntradaTipo.marcaAncho)
            VStack(alignment: .leading, spacing: 0) {
                EntradaLinea(
                    texto: fila.linea,
                    tono: fila.esTrabajo ? entradaTinta(atenuado: atenuado) : WatchTheme.dim
                )
                EntradaPartes(partes: fila.partes)
                if let cue = fila.cue {
                    Text("\(Text(Self.prefijoCue).foregroundStyle(WatchTheme.dim))\(cue)")
                        .font(.entrada(EntradaTipo.nota, .medium))
                        .foregroundStyle(entradaTinta(atenuado: atenuado))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(etiqueta)
    }

    /// La marca no se lee con VoiceOver: se dice con palabras.
    private var etiqueta: String {
        var partes = [fila.linea] + fila.partes
        if let cue = fila.cue { partes.append("\(Self.prefijoCue)\(cue)") }
        let texto = partes.joined(separator: ", ")
        return fila.esTrabajo ? "Parte principal, \(texto)" : texto
    }
}

// MARK: - Las líneas de una fila

/// El titular de una fila: 16 pt si cabe en una línea, 15 (el suelo) si solo cabe así y,
/// si ni así, 16 en dos líneas. Nunca por debajo de 15 pt, nunca cortada.
struct EntradaLinea: View {
    let texto: String
    let tono: Color

    var body: some View {
        ViewThatFits(in: .horizontal) {
            linea(EntradaTipo.linea).lineLimit(1)
            linea(EntradaTipo.suelo).lineLimit(1)
            linea(EntradaTipo.linea)
        }
    }

    private func linea(_ cuerpo: CGFloat) -> some View {
        Text(texto)
            .font(.entrada(cuerpo))
            .foregroundStyle(tono)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// El detalle de una fila: los datos en una línea si caben; si no, uno por línea. Así
/// una línea se parte ENTRE datos («r 2′» no se separa de su «r») y no queda un «·»
/// colgando al final ni al principio.
struct EntradaPartes: View {
    let partes: [String]

    var body: some View {
        if !partes.isEmpty {
            ViewThatFits(in: .horizontal) {
                celda(partes.joined(separator: " · ")).lineLimit(1)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(partes.enumerated()), id: \.offset) { _, parte in
                        celda(parte)
                    }
                }
            }
        }
    }

    private func celda(_ texto: String) -> some View {
        Text(texto)
            .font(.entrada(EntradaTipo.nota, .medium))
            .foregroundStyle(WatchTheme.dim)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Dobles

/// «DOBLES · con {nombre}»: una sola definición, la leen el brief y el hecho, para que
/// una sesión de dobles se lea como tal en los dos extremos. Una nota con su icono, sin
/// pastilla ni relleno.
struct EntradaDobles: View {
    let texto: String

    var body: some View {
        Label {
            Text(texto)
                .font(.entrada(EntradaTipo.nota, .medium))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "person.2.fill")
        }
        .foregroundStyle(WatchTheme.dim)
        .frame(maxWidth: .infinity, alignment: .center)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(texto)
    }
}

// MARK: - Día de descanso

/// Un día de descanso es honesto: ninguna sesión, ningún botón, solo la frase.
struct EntradaDescansoView: View {
    var body: some View {
        EntradaPagina(espacio: EntradaTipo.hueco) {
            EntradaContexto(partes: ["Hoy"])
            Text("Descanso")
                .font(.entrada(EntradaTipo.segundo))
                .foregroundStyle(WatchTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(EntradaTipo.escalaSuelo)
            Text("Hoy descansas. Disfruta la recuperación.")
                .font(.entrada(EntradaTipo.nota, .medium))
                .foregroundStyle(WatchTheme.dim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

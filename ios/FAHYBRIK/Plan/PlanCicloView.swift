import SwiftUI

// EL CICLO — el camino hacia tu objetivo.
//
// De dónde vienes, en qué punto estás y qué hay marcado por delante. No enseña
// ningún entreno: enseña la ESTRUCTURA que el coach ha publicado, en orden, con
// el cursor de hoy dentro y la carrera cerrando por abajo.
//
// ---------------------------------------------------------------------------
// LA ESPINA ES EL SUJETO DE ESTA PANTALLA
// ---------------------------------------------------------------------------
//
// El ciclo se pinta con `EspinaDelPlan`, la MISMA pieza que dibuja el camino en
// la nota del coach. No es un parecido: es el mismo componente. Un camino
// redibujado por pantalla son dos caminos distintos a los dos meses, y el atleta
// que ve «S5-S8 · Base 1» en la nota de su coach tiene que ver exactamente eso
// aquí (docs/DECISIONS.md, 9-ago-2026).
//
// Lo que decide QUÉ dice cada parada está en `CicloDelPlan.swift` y es puro; lo
// que cuelga de cada parada —las marcas de semana, lo que hay en el calendario,
// la declaración del hueco, la cuenta atrás— está en `PlanCicloAtoms.swift`.
//
// ---------------------------------------------------------------------------
// QUÉ DESAPARECIÓ DE LA v1, Y ES DELIBERADO (Alex, 11-ago-2026)
// ---------------------------------------------------------------------------
//
// La v1 (6-ago) era una lista de cumplimiento semana a semana más un adelanto de
// la próxima semana. Las dos cosas se van:
//
//   · El cumplimiento es PASADO, y esta pantalla responde adónde vas. El
//     porcentaje semana a semana además obligaba a pintar una barra sin listón —
//     dónde está el listón de una semana buena es MÉTODO del coach, no mecanismo
//     nuestro (HARD RULE Nº0).
//   · «La próxima semana» ya la responde la pestaña Plan deslizando el carril: dos
//     sitios para la misma pregunta es lo que se arregló el 6-ago, no algo que
//     reintroducir aquí.
//
// Y no dibuja ninguna rampa de carga prevista: lo planificado se pinta con
// seguridad (qué tramos hay, cuánto duran, qué está en el calendario); lo MEDIDO
// del futuro no existe todavía. Las marcas de semana son POSICIÓN, no cantidad.
//
// ALTURA (contrato §6.1): la pantalla es `llena` — el cromo, el sujeto y la
// acción son fijos, y TODO el sobrante entra EN LAS PARADAS del camino. Sin un
// solo tramo publicado no hay camino que repartir: degrada a `centra`.
struct PlanCicloView: View {
    let bearer: String?
    let onClose: () -> Void

    @Environment(AppDataStore.self) private var store

    @State private var cargando = true
    @State private var falloDeCarga = false

    /// El sujeto sale del CAMINO, no de props: pedirle a quien abre la pantalla
    /// que le pase el nombre del bloque era tener dos fuentes para el mismo
    /// hecho, y la de aquí es la que trae la estructura entera.
    private var ciclo: CicloDelPlan? {
        store.planCiclo.value.flatMap { CicloDelPlan($0) }
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            contenido
        }
        .task { await cargar() }
    }

    // MARK: - Los cuatro estados (§5)

    @ViewBuilder
    private var contenido: some View {
        if cargando, store.planCiclo.value == nil {
            esqueleto
        } else if falloDeCarga, store.planCiclo.value == nil {
            estadoCentrado {
                RedesignEmptyState(
                    symbol: "wifi.exclamationmark",
                    title: "No pudimos cargar tu ciclo",
                    message: "Revisa tu conexión e inténtalo de nuevo.",
                    exit: .action(title: "Reintentar") {
                        Haptics.light()
                        cargando = true
                        Task { await cargar(force: true) }
                    }
                )
            }
        } else if let ciclo {
            pantalla(ciclo)
        } else {
            // Sin estructura publicada no hay camino que repartir: degrada a
            // Vacío y se centra, con la salida declarada. Este atleta puede que
            // nunca haya tenido plan, así que tampoco se finge un pasado.
            estadoCentrado {
                RedesignEmptyState(
                    // El mismo símbolo con el que se entra al ciclo desde el
                    // Plan: la puerta y lo que hay detrás se dicen igual.
                    symbol: "square.stack.3d.up",
                    title: "Aún no tienes plan",
                    message: "Cuando tu coach publique tu primera etapa, aquí verás por dónde vas y cuánto queda.",
                    exit: .explained(note: LoPublicaElCoach.frase)
                )
            }
        }
    }

    // MARK: - La pantalla con datos

    private func pantalla(_ ciclo: CicloDelPlan) -> some View {
        FillingScreen {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                cromo(nivel: ciclo.nivelDeLoPublicado)
                CuerpoDelCiclo(ciclo: ciclo)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.s)
        }
        .refreshable { await cargar(force: true) }
        .anchoredAction {
            // La acción NO pesa como el sujeto (§10.5): el sujeto es lo que
            // miras, la acción es lo que tocas. Volver a la semana es volver a la
            // pestaña Plan, que es exactamente lo que hay detrás de esta.
            SecondaryButton(title: "VER LA SEMANA") { onClose() }
        }
    }

    // MARK: - Cromo superior

    /// La línea de arriba: dónde estás, el nivel que declara lo publicado y la
    /// salida. El nivel sale UNA vez aquí en lugar de repetirse en cada parada.
    private func cromo(nivel: String?) -> some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            LabelText(text: "Tu plan", color: Theme.Color.muted, size: 12)
                .lineLimit(1)
            Spacer(minLength: Theme.Spacing.s)
            if let nivel, !nivel.isEmpty {
                Text(nivel)
                    .scaledFont(12, weight: .semibold, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
                    .lineLimit(1)
                    .accessibilityLabel("Nivel \(nivel)")
            }
            botonCerrar
        }
        .frame(minHeight: 36)
    }

    private var botonCerrar: some View {
        Button {
            Haptics.light()
            onClose()
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Cerrar")
    }

    // MARK: - Los estados sin datos

    /// Envuelve un estado sin datos con el cromo persistente: la salida no puede
    /// desaparecer solo porque no haya camino que enseñar.
    private func estadoCentrado<Content: View>(@ViewBuilder _ content: @escaping () -> Content) -> some View {
        CenteredScreen {
            cromo(nivel: nil)
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.s)
        } content: {
            content()
        }
        .refreshable { await cargar(force: true) }
    }

    /// El esqueleto de la carga en frío: la MISMA silueta que la pantalla real
    /// —cromo, banda del sujeto, paradas— para que al llegar el dato nada salte
    /// de sitio. Nunca un vacío mientras todavía no se sabe si está vacío.
    private var esqueleto: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            cromo(nivel: nil)
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SkeletonBar(width: 220, height: 30)
                SkeletonBar(width: 160, height: 13)
            }
            .frame(minHeight: CuerpoDelCiclo.bandaSujeto, alignment: .center)
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                ForEach(0..<4, id: \.self) { _ in
                    HStack(alignment: .top, spacing: Theme.Spacing.m) {
                        SkeletonBar(width: 9, height: 9, radius: Theme.Radius.pill)
                            .padding(.top, 8)
                        VStack(alignment: .leading, spacing: 5) {
                            SkeletonBar(width: 44, height: 10)
                            SkeletonBar(width: 150, height: 14)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tu ciclo")
    }

    // MARK: - Carga (cache-first + SWR, como el resto de la app)

    private func cargar(force: Bool = false) async {
        guard bearer != nil else {
            cargando = false
            falloDeCarga = true
            return
        }
        // El ciclo vive en el store (cache-first): si el Plan ya lo calentó, esta
        // pantalla abre pintada en vez de girar.
        await store.refreshPlanCiclo(force: force)
        falloDeCarga = store.planCiclo.loadFailed
        cargando = false
    }
}

// MARK: - El cuerpo: el sujeto y el camino

/// EL SUJETO Y LA ESPINA — lo que se dibuja dentro del scroll.
///
/// Vive aparte de la pantalla por la misma razón que `ListaComunicados`: es lo que
/// de verdad se mira, y así se puede dibujar en una prueba (el `ImageRenderer` no
/// pinta un `ScrollView`) sin montar una copia del montaje.
struct CuerpoDelCiclo: View {
    let ciclo: CicloDelPlan

    /// La banda del sujeto (§10.3). Ciclo, semana y día se abren una desde otra,
    /// así que su sujeto cae a la MISMA altura: si en una está arriba y en la
    /// siguiente 60 pt más abajo, el atleta reencuadra cada vez que baja un nivel.
    static let bandaSujeto: CGFloat = 104

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            sujeto
            EspinaDelPlan(tramos: ciclo.tramosDeLaEspina, semanasTotales: ciclo.semanasTotales)
                .frame(maxHeight: .infinity, alignment: .top)
            // La secuencia SÍ declara qué pasa al acabar: entonces no hay
            // agujero, hay una regla, y se dice en una línea bajo el camino.
            if !ciclo.hayHueco, let politica = ciclo.politica {
                Text(politica.frase)
                    .scaledFont(12, weight: .medium, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    // Cae bajo el texto de las paradas, no bajo el raíl.
                    .padding(.leading, GeometriaEspina.sangria)
            }
        }
    }

    // MARK: El sujeto

    @ViewBuilder
    private var sujeto: some View {
        if let tramo = ciclo.tramoActual, let semana = ciclo.semanaEnTramo {
            bandaDelSujeto(
                titulo: tramo.title,
                cifra: CifraDelPlan(cifra: "\(semana)", sufijo: "de \(tramo.weekCount)"),
                // La escala del ciclo solo se dice cuando NO coincide con la de la
                // etapa: con una única etapa publicada las dos cuentas son la
                // misma y repetirla sería ruido.
                pie: ciclo.tramos.count > 1 && ciclo.semanaDelCiclo != nil
                    ? "Semana \(ciclo.semanaDelCiclo!) de \(ciclo.semanasTotales) del ciclo"
                    : nil,
                voz: vozDelSujeto(tramo: tramo, semana: semana)
            )
        } else {
            // Hoy no cae en ninguna etapa. No hay cifra que inventar: el sujeto es
            // el hecho, no un contador puesto a cero.
            bandaDelSujeto(
                titulo: "Sin etapa activa",
                cifra: nil,
                pie: "Hoy no cae dentro de ninguna de tus etapas.",
                voz: "Sin etapa activa. Hoy no cae dentro de ninguna de tus etapas."
            )
        }
    }

    private func bandaDelSujeto(
        titulo: String,
        cifra: CifraDelPlan?,
        pie: String?,
        voz: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                // Un título largo baja un escalón antes que partirse en tres
                // líneas: el sujeto se lee de un vistazo o no es el sujeto.
                Text(titulo)
                    .scaledFont(titulo.count > 24 ? 28 : 38, weight: .heavy,
                                relativeTo: .title, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                cifra
            }
            if let pie {
                Text(pie)
                    .scaledFont(13, weight: .medium, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(minHeight: Self.bandaSujeto, alignment: .center)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(voz)
    }

    private func vozDelSujeto(tramo: TramoDelPlan, semana: Int) -> String {
        var partes = ["\(tramo.title), semana \(semana) de \(tramo.weekCount)"]
        if ciclo.tramos.count > 1, let delCiclo = ciclo.semanaDelCiclo {
            partes.append("semana \(delCiclo) de \(ciclo.semanasTotales) del ciclo")
        }
        return partes.joined(separator: ", ")
    }
}

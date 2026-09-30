import SwiftUI

// LAS PIEZAS DEL CONSTRUCTOR DE ENTRENO LIBRE — una sola familia para los tres caminos.
//
// Correr (y los ergos), funcional y fuerza son tres formularios distintos, pero para el atleta son UNA
// cosa: «monto mi entreno». Antes cada camino dibujaba su barra de arriba, su título, su botón de añadir,
// su campo de nombre y su pie a su manera (tres barras casi iguales a 15 pt y etiquetas de 11); ahora
// los tres se montan con estas piezas y se ven iguales por construcción.
//
// La piel es la de «El día» (CONTRATO-UI §11): papeles tipográficos con suelo de 15 pt, el cromo de
// botones redondos, radios por papel, y el acento del club SOLO en lo que significa algo — la opción
// elegida, el paso en que estás, lo que añade. Sin un color clavado: todo sale de `Theme.Color`.
//
// Se quedan en la carpeta del libre y no en `Theme/Dia/` porque sólo las usa este flujo (y la hoja de
// «¿Qué hiciste?», que es su espejo después del entreno). Si otra pantalla necesita un contador o un
// selector segmentado de este corte, se suben al kit desde aquí.

// MARK: - La cabecera

/// El botón redondo de la esquina: cerrar el flujo o volver al paso anterior.
enum SalidaConstructorLibre {
    case cerrar, atras

    fileprivate var simbolo: String { self == .cerrar ? GlifoDia.cerrar.simbolo : "chevron.left" }
    fileprivate var etiqueta: String { self == .cerrar ? "Cerrar" : "Atrás" }
}

/// El cromo fijo del constructor: el botón de salir a la izquierda y, a la derecha, en qué paso estás.
/// No scrollea: salir tiene que estar siempre a mano.
struct CromoConstructorLibre: View {
    let salida: SalidaConstructorLibre
    /// «Paso n de m». `nil` en los caminos de una sola pantalla (fuerza).
    var paso: (n: Int, de: Int)?
    let alSalir: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            BotonCromoDia(etiqueta: salida.etiqueta, accion: { Haptics.light(); alSalir() }) {
                Image(systemName: salida.simbolo)
                    .font(.system(size: 18, weight: .bold))
                    .accessibilityHidden(true)
            }
            Spacer(minLength: 0)
            if let paso {
                HStack(spacing: Theme.Spacing.s) {
                    Text("Paso \(paso.n) de \(paso.de)")
                        .papel(.notaFuerte)
                        .foregroundStyle(Theme.Color.muted)
                    RegletaDia(n: paso.n, de: paso.de, anchoSegmento: 14)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Paso \(paso.n) de \(paso.de)")
            }
        }
        .padding(.horizontal, Theme.Spacing.pantalla - (Theme.Size.toque - 38) / 2)
        .padding(.vertical, Theme.Spacing.xs)
    }
}

/// El título de cada paso: la etiqueta en el acento del club (dónde estás del flujo), el título a 30 pt
/// y, si hace falta, una línea de apoyo. La misma voz con que abre la semana del Plan.
struct TituloPasoLibre: View {
    let etiqueta: String
    let titulo: String
    var apoyo: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(etiqueta)
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.accentText)
                .lineLimit(2)
            Text(titulo)
                .papel(.saludo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let apoyo {
                Text(apoyo)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// El lienzo de un paso: el cromo fijo arriba, el contenido con scroll y el pie anclado (si lo hay).
struct PantallaConstructorLibre<Contenido: View, Pie: View>: View {
    let salida: SalidaConstructorLibre
    var paso: (n: Int, de: Int)?
    let alSalir: () -> Void
    @ViewBuilder let contenido: () -> Contenido
    @ViewBuilder let pie: () -> Pie

    var body: some View {
        VStack(spacing: 0) {
            CromoConstructorLibre(salida: salida, paso: paso, alSalir: alSalir)
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) { contenido() }
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.top, Theme.Spacing.s)
                    .padding(.bottom, Theme.Spacing.xxl)
            }
            .scrollDismissesKeyboard(.interactively)
            pie()
        }
        .background(Theme.Color.background.ignoresSafeArea())
    }
}

extension PantallaConstructorLibre where Pie == EmptyView {
    init(
        salida: SalidaConstructorLibre,
        paso: (n: Int, de: Int)? = nil,
        alSalir: @escaping () -> Void,
        @ViewBuilder contenido: @escaping () -> Contenido
    ) {
        self.init(salida: salida, paso: paso, alSalir: alSalir, contenido: contenido, pie: { EmptyView() })
    }
}

// MARK: - El pie

/// El pie anclado del paso final: el día en que se programa y las dos salidas — «Guardar» (lo deja en tu
/// plan) y «Continuar» (lo empiezas ya). Continuar es la acción de la pantalla: la pastilla de tinta
/// invertida del Plan, a todo el ancho que quede; Guardar es la secundaria, contorneada.
struct PieConstructorLibre: View {
    @Binding var diaISO: String
    let guardando: Bool
    let alGuardar: () -> Void
    let alContinuar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            ProgramarDiaPicker(selectedISO: $diaISO)
            ViewThatFits(in: .horizontal) {
                // «Guardar» a su ancho y «Continuar» con lo que sobre: la acción manda.
                HStack(spacing: Theme.Spacing.m) { guardar.fixedSize(horizontal: true, vertical: false); continuar }
                VStack(spacing: Theme.Spacing.s) { continuar; guardar }
            }
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.m)
        .background(Theme.Color.background)
        .overlay(alignment: .top) { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
    }

    private var guardar: some View {
        BotonSecundarioLibre(titulo: guardando ? "Guardando" : "Guardar",
                             etiqueta: guardando ? "Guardando" : "Guardar en tu plan",
                             deshabilitado: guardando, accion: alGuardar)
    }

    private var continuar: some View {
        BotonPrincipalLibre(titulo: "Continuar", deshabilitado: guardando, accion: alContinuar)
    }
}

/// La acción de una pantalla del flujo: pastilla de tinta invertida a todo el ancho que quede, la misma
/// que cierra el sujeto del Plan. La comparten el pie del constructor y la hoja de compartir.
struct BotonPrincipalLibre: View {
    let titulo: String
    var glifo: GlifoDia? = .flecha
    var deshabilitado = false
    let accion: () -> Void

    var body: some View {
        Button { Haptics.medium(); accion() } label: {
            HStack(spacing: Theme.Spacing.m - 2) {
                Text(titulo).papel(.accion)
                if let glifo { IconoDia(glifo, tam: 20, peso: .bold) }
            }
            .foregroundStyle(Theme.Color.background)
            .padding(.horizontal, 22)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.accion)
            .background(Theme.Color.foreground, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(deshabilitado)
        .accessibilityLabel(titulo)
    }
}

/// La salida que no es la acción: contorneada, sobre la cara de tarjeta.
struct BotonSecundarioLibre: View {
    let titulo: String
    /// Lo que lee VoiceOver si dice más que el título («Guardar en tu plan»).
    var etiqueta: String?
    var deshabilitado = false
    let accion: () -> Void

    var body: some View {
        Button { Haptics.light(); accion() } label: {
            Text(titulo)
                .papel(.accion)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, minHeight: Theme.Size.accion)
                .background(Theme.Color.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .disabled(deshabilitado)
        .accessibilityLabel(etiqueta ?? titulo)
    }
}

/// Lo que se le dice al atleta si «Guardar» no llega al servidor. Antes el fallo era un zumbido y nada
/// más: el atleta no sabía si su entreno estaba en el plan o no.
enum AvisoConstructorLibre {
    static let noGuardado = AvisoDia.Contenido(
        tono: .fallo,
        texto: "No se ha podido guardar. Revisa la conexión y vuelve a intentarlo."
    )
}

// MARK: - Las piezas del formulario

/// El rótulo de un control («Distancia», «Medida»). Minúsculas, 15 pt, en el gris de apoyo.
struct RotuloControlLibre: View {
    let texto: String
    init(_ texto: String) { self.texto = texto }

    var body: some View {
        Text(texto)
            .papel(.rotulo)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// El nombre del entreno: el único texto libre del constructor (el resto son contadores y opciones).
struct CampoNombreLibre: View {
    let sugerido: String
    @Binding var texto: String
    let maximo: Int

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            RotuloControlLibre("Nombre")
            TextField(sugerido, text: $texto)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.l)
                .frame(minHeight: Theme.Size.accion)
                .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous).strokeBorder(Theme.Color.hairline, lineWidth: 1))
                .onChange(of: texto) { _, nuevo in
                    if nuevo.count > maximo { texto = String(nuevo.prefix(maximo)) }
                }
                .accessibilityLabel("Nombre del entreno")
        }
    }
}

/// «Añadir…»: la fila punteada que abre el catálogo o suma un tramo. Punteada porque es un hueco que
/// se rellena, no un contenido; el acento va en el texto porque es lo que añade.
struct BotonAnadirLibre: View {
    let titulo: String
    var habilitado = true
    /// Lo que lee VoiceOver cuando no se puede añadir más («Máximo de ejercicios alcanzado»).
    var etiquetaAlLimite: String?
    let accion: () -> Void

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        Button { Haptics.light(); accion() } label: {
            HStack(spacing: Theme.Spacing.m) {
                IconoDia(.mas, tam: 18, peso: .bold)
                Text(titulo).papel(.cuerpoFuerte)
                Spacer(minLength: 0)
            }
            .foregroundStyle(habilitado ? Theme.Color.accentText : Theme.Color.faint)
            .padding(.horizontal, Theme.Spacing.l)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.accion)
            .overlay(forma.strokeBorder(Theme.Color.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
            .contentShape(forma)
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!habilitado)
        .accessibilityLabel(habilitado ? titulo : (etiquetaAlLimite ?? titulo))
    }
}

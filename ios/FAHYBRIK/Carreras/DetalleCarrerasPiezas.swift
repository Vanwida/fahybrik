import SwiftUI

// LAS PIEZAS DE LOS DETALLES de «Carreras» — lo que comparten las pantallas que se empujan desde la
// pestaña (el detalle de una carrera, el de una estación, predicho contra real). Son de esta zona: el
// orquestador decide si alguna sube al kit (`AtrasCarreras` y el marco son hermanos de
// `AnaliticasAtras`/`AnaliticasPantalla`; hoy cada pestaña tiene el suyo).
//
// Un detalle es el arquetipo «Detalle» del CONTRATO-UI §6.2: el sujeto es el dato que te trajo, la
// altura es `llena` (el sobrante entra en el sujeto, no en una cola) y el hueco se gana con lo que da
// sentido al dato, nunca con aire. La barra de navegación va oculta: la vuelta la dibuja la pantalla,
// fija arriba (fuera del scroll), y el gesto de borde del sistema sigue funcionando.

/// «‹ Carreras»: la vuelta de un detalle, a la izquierda y fija.
struct AtrasCarreras: View {
    var texto = "Carreras"
    let accion: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            HStack(spacing: 2) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 20, weight: .bold))
                    .accessibilityHidden(true)
                Text(texto).papel(.cuerpoFuerte)
            }
            .foregroundStyle(Theme.Color.accentText)
            .padding(.leading, Theme.Spacing.xs)
            .padding(.trailing, Theme.Spacing.m + 2)
            .frame(minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .accessibilityLabel("Volver a \(texto)")
    }
}

/// El marco de un detalle: la vuelta arriba y el cuerpo en un `FillingScreen` con el margen del día.
/// El cuerpo recibe todo el alto visible: el hijo que declare `maxHeight: .infinity` (el sujeto) se
/// queda el sobrante y, si el contenido desborda, scrollea.
struct MarcoDeDetalleCarreras<Contenido: View>: View {
    var atras = "Carreras"
    let contenido: Contenido

    @Environment(\.dismiss) private var dismiss

    init(atras: String = "Carreras", @ViewBuilder contenido: () -> Contenido) {
        self.atras = atras
        self.contenido = contenido()
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                AtrasCarreras(texto: atras) { dismiss() }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.xs)
            FillingScreen {
                VStack(alignment: .leading, spacing: 22) { contenido }
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.top, Theme.Spacing.xs)
                    .padding(.bottom, Theme.Spacing.xxl)
                    .frame(maxHeight: .infinity, alignment: .top)
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// La cabecera de un detalle: la etiqueta (en el acento cuando es lo principal), el título de la
/// pantalla y sus líneas de apoyo. No es un sujeto: dice DE QUÉ es la pantalla; el sujeto va debajo.
struct CabeceraDetalleCarreras<Pie: View>: View {
    let etiqueta: String?
    var etiquetaEnAcento = true
    let titulo: String
    var lineas: [String] = []
    let pie: Pie

    init(
        etiqueta: String?,
        etiquetaEnAcento: Bool = true,
        titulo: String,
        lineas: [String] = [],
        @ViewBuilder pie: () -> Pie
    ) {
        self.etiqueta = etiqueta
        self.etiquetaEnAcento = etiquetaEnAcento
        self.titulo = titulo
        self.lineas = lineas
        self.pie = pie()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                if let etiqueta {
                    Text(etiqueta)
                        .papel(.etiqueta)
                        .foregroundStyle(etiquetaEnAcento ? Theme.Color.accentText : Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(titulo)
                    .papel(.saludo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
            if !lineas.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(lineas, id: \.self) { linea in
                        Text(linea)
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            pie
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension CabeceraDetalleCarreras where Pie == EmptyView {
    init(etiqueta: String?, etiquetaEnAcento: Bool = true, titulo: String, lineas: [String] = []) {
        self.init(etiqueta: etiqueta, etiquetaEnAcento: etiquetaEnAcento, titulo: titulo, lineas: lineas, pie: { EmptyView() })
    }
}

/// Una frase con su marca delante: «↘ Vas 1:50 por delante de tu objetivo». El color va en la MARCA
/// (una flecha, que además dice el sentido con su forma); la frase, en la tinta del tema.
struct FraseConMarcaCarreras: View {
    let frase: String
    let marca: TextoPredicho.Marca?
    var papel: Theme.Typography.Papel = .notaFuerte

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            if let marca {
                IconoDia(marca == .ok ? .baja : .sube, tam: 16, peso: .bold)
                    .foregroundStyle(marca == .ok ? Theme.Color.ok : Theme.Color.warning)
                    .padding(.top, 2)
            }
            Text(frase)
                .papel(papel)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Una nota de contexto en tarjeta plana: un kicker con su glifo y una frase. Lo que explica el dato
/// («después de la carrera», «la misma estrategia que la simulación»), no lo que lo es.
struct NotaDeDetalleCarreras<Glifo: View>: View {
    let titulo: String
    let texto: String
    let glifo: Glifo

    init(_ titulo: String, texto: String, @ViewBuilder glifo: () -> Glifo) {
        self.titulo = titulo
        self.texto = texto
        self.glifo = glifo()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(spacing: Theme.Spacing.s) {
                glifo
                Text(titulo).papel(.kicker)
            }
            .foregroundStyle(Theme.Color.foreground)
            Text(texto)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia()
        .accessibilityElement(children: .combine)
    }
}

/// El sujeto de un detalle mientras llega su dato: el MISMO cascarón que tendrá (tono neutro), con las
/// barras donde irán el kicker, la cifra y la frase. Nada salta al llegar.
struct EsqueletoSujetoCarreras: View {
    let voz: String

    var body: some View {
        SujetoDia(tono: .neutro) {
            SkeletonBar(width: 140, height: 15, radius: 5)
            SkeletonBar(width: 170, height: 44, radius: 10)
            SkeletonBar(height: 15, radius: 5).frame(maxWidth: 260)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(voz)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

/// Una barra de título de sección con su nota debajo: `TituloSeccionDia` + la frase que dice cómo leer
/// lo que sigue.
struct SeccionDeDetalleCarreras<Contenido: View>: View {
    let titulo: String
    var nota: String?
    let contenido: Contenido

    init(_ titulo: String, nota: String? = nil, @ViewBuilder contenido: () -> Contenido) {
        self.titulo = titulo
        self.nota = nota
        self.contenido = contenido()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
            VStack(alignment: .leading, spacing: 2) {
                TituloSeccionDia(titulo)
                if let nota {
                    Text(nota)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            contenido
        }
    }
}

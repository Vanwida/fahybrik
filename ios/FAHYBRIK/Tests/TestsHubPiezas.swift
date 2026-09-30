import SwiftUI

// LAS PIEZAS DEL HUB DE TESTS — una fila de zona, una tarjeta de test con sus marcas y el esqueleto de
// ambas. Todas pintan una lectura ya resuelta (`TestsHubLectura`): ninguna decide nada.

/// Relleno interior de las tarjetas de esta pantalla.
private let rellenoDeTarjeta = Theme.Spacing.l + 2

// MARK: - Una zona

/// Una modalidad con su umbral: «Correr · 3:55/km · UMBRAL». Sin umbral guardado, la fila no lo inventa.
struct FilaZonaTests: View {
    let fila: ZonaFila

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text(fila.modalidad)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                if let fecha = fila.fecha {
                    Text(fecha)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            Spacer(minLength: Theme.Spacing.s)
            if let umbral = fila.umbral {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(umbral)
                        .papel(.cifra)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("umbral")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .padding(.horizontal, rellenoDeTarjeta)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(fila.etiquetaAccesible)
    }
}

/// Las zonas actuales: lo que calibran los tests.
struct ZonasDeTests: View {
    let zonas: ZonasTests

    var body: some View {
        switch zonas {
        case .cargando:
            VStack(spacing: 0) {
                filaEsqueleto
                Hairline()
                filaEsqueleto
            }
            .tarjetaDia(alAncho: true)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Cargando tus zonas")
        case .sinZonas:
            Text("Aún sin zonas. Tu primer test de ritmo las fija al momento.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(rellenoDeTarjeta)
                .tarjetaDia(alAncho: true)
        case .filas(let filas):
            ListaDia {
                ForEach(filas) { FilaZonaTests(fila: $0) }
            }
        }
    }

    /// El esqueleto de una fila de zona, con su misma forma: título a la izquierda, cifra a la derecha.
    private var filaEsqueleto: some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                SkeletonBar(width: 110, height: 17, radius: 6)
                SkeletonBar(width: 84, height: 15, radius: 5)
            }
            Spacer(minLength: Theme.Spacing.s)
            SkeletonBar(width: 76, height: 22, radius: 7)
        }
        .padding(.horizontal, rellenoDeTarjeta)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque)
    }
}

// MARK: - Una marca

/// Una serie de marcas: la cifra con su unidad, el cambio contra la anterior y la curva.
struct FilaMarcaTests: View {
    let serie: SerieMarca

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                if let etiqueta = serie.etiqueta {
                    Text(etiqueta)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
                HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.xs + 2) {
                    Text(serie.cifra)
                        .papel(.dato)
                        .foregroundStyle(Theme.Color.foreground)
                    if !serie.unidad.isEmpty {
                        Text(serie.unidad)
                            .papel(.notaFuerte)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
            Spacer(minLength: Theme.Spacing.s)
            VStack(alignment: .trailing, spacing: Theme.Spacing.s) {
                BenchmarkSparkline(values: serie.valores)
                    .frame(width: 84, height: 32)
                if let delta = serie.delta {
                    BenchmarkDeltaChip(unit: serie.unit, delta: delta)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(serie.etiquetaAccesible)
    }
}

// MARK: - Un test

extension EstadoFicha {
    /// El glifo de la ficha de un test: la forma dice el estado (el color solo no basta).
    func glifo(esSalto: Bool) -> GlifoDia {
        switch self {
        case .hecho: return .check
        case .faltaResultado: return .lapiz
        case .hoy: return esSalto ? .video : .cronometro
        case .programado: return esSalto ? .video : .calendario
        }
    }

    var tonoDeFicha: FichaDia<IconoDia>.Tono {
        switch self {
        case .hecho, .programado: return .normal
        case .faltaResultado: return .aviso
        case .hoy: return .realce
        }
    }
}

/// La tarjeta de un test de la batería: quién es y en qué estado, sus marcas y su acción.
struct TarjetaTest: View {
    let ficha: FichaTest
    let alEjecutar: (AccionTest) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                cabecera
                if let preparacion = ficha.preparacion {
                    Text(preparacion)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                marcas
                if ficha.falloAlPreparar {
                    AvisoEnLineaDia("No se pudo preparar el test. Inténtalo de nuevo.")
                }
            }
            .padding(rellenoDeTarjeta)
            Hairline()
            boton
        }
        .tarjetaDia(realce: ficha.estado.pideUnActo, alAncho: true)
        .accessibilityElement(children: .contain)
    }

    private var cabecera: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.m) {
            FichaDia(ficha.estado.glifo(esSalto: ficha.esSalto), tono: ficha.estado.tonoDeFicha)
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(ficha.nombre)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                pastilla
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var pastilla: some View {
        switch ficha.estado {
        case .hecho: InfoPill(text: "Hecho", estilo: .velo, glifo: .check)
        case .faltaResultado: InfoPill(text: "Falta el resultado", estilo: .acento, glifo: .lapiz)
        case .hoy: InfoPill(text: "Hoy", estilo: .acento, glifo: .calendario)
        case .programado(let fecha): InfoPill(text: fecha, estilo: .neutro, glifo: .calendario)
        }
    }

    @ViewBuilder
    private var marcas: some View {
        switch ficha.marcas {
        case .series(let series):
            VStack(spacing: Theme.Spacing.m) {
                ForEach(series) { FilaMarcaTests(serie: $0) }
            }
        case .ultima(let texto):
            HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.s) {
                Text(texto).papel(.cifra).foregroundStyle(Theme.Color.foreground)
                Text("último resultado").papel(.nota).foregroundStyle(Theme.Color.muted)
            }
        case .primera:
            Text("Sin marcas todavía. Tu primera vez fija la referencia.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// La acción de la tarjeta: una fila de 48 pt con su filete, al estilo de las filas de las listas del
    /// día. La acción global (la que ancla la pantalla) es la pastilla; ésta no compite con ella.
    private var boton: some View {
        let accion = ficha.accion
        let preparando: Bool = {
            if case .probarme(let preparando, _) = accion { return preparando }
            return false
        }()
        return BotonTextoDia(
            accion.titulo,
            tono: .acento,
            desactivado: !accion.habilitada,
            accion: { alEjecutar(accion) },
            icono: { IconoDia(accion.glifo, tam: 20, peso: .bold) },
            derecha: {
                if preparando { ProgressView().controlSize(.small) } else { IconoDia(.chevron, tam: 18) }
            }
        )
        .accessibilityLabel("\(accion.titulo), \(ficha.nombre)")
    }
}

extension AccionTest {
    /// El glifo de la acción: qué va a pasar al tocar.
    var glifo: GlifoDia {
        switch self {
        case .verResultado: return .chevron
        case .anadirResultado: return .lapiz
        case .continuarSalto: return .video
        case .continuarVivo, .probarme: return .cronometro
        }
    }
}

// MARK: - El esqueleto del hub

/// Lo que se ve mientras llega la batería: la MISMA forma que lo que llega (un sujeto, las zonas y dos
/// tarjetas), para que nada salte al aparecer el dato.
struct TestsHubEsqueleto: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            SujetoDia(tono: .neutro) {
                SkeletonBar(width: 130, height: 15, radius: 5).frame(minHeight: 32)
                SkeletonBar(width: 120, height: 44, radius: 10)
                SkeletonBar(height: 17, radius: 6).frame(maxWidth: 280)
                SkeletonBar(height: 17, radius: 6).frame(maxWidth: 200)
            } abajo: {
                SkeletonBar(height: 6, radius: 3)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SkeletonBar(width: 150, height: 24, radius: 8)
                ZonasDeTests(zonas: .cargando)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SkeletonBar(width: 130, height: 24, radius: 8)
                tarjetaEsqueleto
                tarjetaEsqueleto
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tus tests")
    }

    private var tarjetaEsqueleto: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(spacing: Theme.Spacing.m) {
                    SkeletonBar(width: FichaDia<IconoDia>.lado, height: FichaDia<IconoDia>.lado, radius: Theme.Radius.l)
                    VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                        SkeletonBar(width: 140, height: 17, radius: 6)
                        SkeletonBar(width: 90, height: 32, radius: 16)
                    }
                }
                SkeletonBar(height: 15, radius: 5).frame(maxWidth: 240)
            }
            .padding(rellenoDeTarjeta)
            Hairline()
            SkeletonBar(width: 120, height: 17, radius: 6)
                .padding(.horizontal, rellenoDeTarjeta)
                .frame(minHeight: Theme.Size.toque)
        }
        .tarjetaDia(alAncho: true)
    }
}

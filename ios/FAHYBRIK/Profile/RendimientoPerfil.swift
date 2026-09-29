import Foundation

// RENDIMIENTO — las cinco filas, resueltas SIN pintar nada.
//
// Las cifras del atleta en Perfil (tests, marcas, VO₂ máx, zonas de pulso y 1RM). Esta sección eran
// CINCO PUERTAS CON LA ETIQUETA DE LO QUE HAY DENTRO y ni un número; hoy son cinco teselas con la
// cifra a 32 pt (`PerfilRendimiento.swift`), y aquí están todas las decisiones que importan: qué es
// un contador y qué un valor medido, cuándo un hueco se declara y cuándo se calla, qué es «no hay
// dato» y qué «todavía no lo sé», y —lo que antes no existía— qué es «no pudimos cargarlo».
// Espejo de `web/components/design-twin/kit-perfil/rendimiento.ts`, con los mismos tests.
//
// Las reglas que gobiernan cada fila (docs/CONTRATO-UI.md):
//
//   §4      el dato pesa más que su etiqueta — 32 pt contra 15.
//   §6.2bis un CONTADOR se pinta en cero («0 de 4 calibrados» es información, y es cuando más falta
//           hace); un VALOR MEDIDO no existe hasta que se mide, y ahí va la invitación con el acto
//           que lo llena. Un hueco que el atleta NO puede llenar (lo programa su coach) no ofrece
//           salida: se dice quién lo hace.
//   §7      lo que no se sabe no se pinta. Mientras una fuente no ha contestado la fila no dice ni
//           cifra ni invitación; si FALLÓ, lo dice con su salida (antes el esqueleto no se iba nunca).

// MARK: - Lo que una fila sabe

/// Una fila resuelta: cómo se pinta, y si el atleta tiene ALGO ahí.
///
/// Son dos cosas distintas y confundirlas hace mentir al encabezado. Un contador se pinta también en
/// cero — pero un cero NO es un logro, y contarlo como «fila con dato» le diría a un atleta que no ha
/// medido nada que ya tiene dos de cinco.
struct FilaRendimiento: Equatable, Identifiable {
    enum Clave: CaseIterable, Hashable {
        case tests, marcas, vo2, zonas, fuerza
    }

    /// «n de m» de un contador, para la regleta.
    struct Avance: Equatable {
        let n: Int
        let de: Int
    }

    let clave: Clave
    let etiqueta: String
    let estado: EstadoDelDato
    /// El atleta tiene algo aquí: un test calibrado, un récord, una medida.
    let logrado: Bool
    /// La batería está programada y sin cerrar: la única fila que pide un acto.
    let pideActo: Bool
    /// Solo en contadores.
    let avance: Avance?
    /// El verbo de la salida cuando el atleta PUEDE llenar el hueco; nil cuando no.
    let salida: String?

    var id: Clave { clave }
}

/// Un hueco declarado nunca es un logro ni pide un acto por sí mismo.
private extension FilaRendimiento {
    init(_ clave: Clave, _ etiqueta: String, _ estado: EstadoDelDato) {
        self.init(clave: clave, etiqueta: etiqueta, estado: estado, logrado: false, pideActo: false, avance: nil, salida: nil)
    }
}

// MARK: - De las fuentes a las filas

enum RendimientoEstados {

    /// Las filas que SE PINTAN, en su orden. Con coach son cinco; sin coach, tres: no se le enseñan
    /// ni tests ni zonas (las calibra su coach) y un contador que las incluyera prometería dos huecos
    /// que en su app no existen.
    ///
    /// Coherencia con la lectura: en frío TODAS son `cargando` (los valores de relleno no se leen) y
    /// con la identidad caída las zonas —que viajan dentro de ella— no pueden contestar.
    static func filas(_ l: LecturaPerfil) -> [FilaRendimiento] {
        let r = l.rendimiento
        let enFrio = l.cargando
        let filaTests = fila(.tests, "Tests", fuente: r.bateria, enFrio: enFrio, resuelve: tests)
        let filaMarcas = fila(.marcas, "Marcas", fuente: r.marcas, enFrio: enFrio, resuelve: marcas)
        let filaVo2 = fila(.vo2, "VO₂ máx", fuente: r.vo2, enFrio: enFrio, resuelve: vo2)
        let filaZonas = fila(.zonas, "Zonas de \(Vocab.fc)", fuente: l.errorCarga ? .sinRespuesta : r.zonas, enFrio: enFrio, resuelve: zonas)
        let filaFuerza = fila(.fuerza, "Fuerza", fuente: r.fuerza, enFrio: enFrio, resuelve: fuerza)
        return l.conCoach ? [filaTests, filaMarcas, filaVo2, filaZonas, filaFuerza] : [filaMarcas, filaVo2, filaFuerza]
    }

    /// «3 de 5 con dato»: cuántas de las filas VISIBLES tienen algo del atleta. Se calla mientras una
    /// fuente esté en el aire o haya fallado: un recuento con una pieza desconocida sería un número
    /// que miente o que cambia solo bajo el pulgar.
    static func linea(_ filas: [FilaRendimiento]) -> String? {
        let sabidas = filas.allSatisfy { fila in
            switch fila.estado {
            case .cargando, .sinRespuesta: return false
            case .valor, .vacio: return true
            }
        }
        guard sabidas else { return nil }
        return "\(filas.filter(\.logrado).count) de \(filas.count) con dato"
    }

    /// Si NINGUNA fuente contestó (sin red en frío), la sección no son tres o cinco teselas de error:
    /// es una sola frase que dice por qué y dónde está la salida.
    static func sinRespuesta(_ filas: [FilaRendimiento]) -> Bool {
        !filas.isEmpty && filas.allSatisfy { $0.estado == .sinRespuesta }
    }

    // MARK: Cada fuente

    /// Lo que una fila sabe de su fuente. `contesto` se resuelve con `resuelve`; lo que no ha
    /// contestado nunca se convierte en cifra ni en invitación.
    private static func fila<V>(
        _ clave: FilaRendimiento.Clave,
        _ etiqueta: String,
        fuente: FuenteDelDato<V>,
        enFrio: Bool,
        resuelve: (FilaRendimiento.Clave, String, V) -> FilaRendimiento
    ) -> FilaRendimiento {
        if enFrio { return FilaRendimiento(clave, etiqueta, .cargando) }
        switch fuente {
        case .cargando: return FilaRendimiento(clave, etiqueta, .cargando)
        case .sinRespuesta: return FilaRendimiento(clave, etiqueta, .sinRespuesta)
        case let .contesto(valor): return resuelve(clave, etiqueta, valor)
        }
    }

    /// CONTADOR — se pinta también en cero: «0 de 4 calibrados» es información, y es justo cuando más
    /// falta hace. Pero un cero no es un logro: la batería cuenta como suya en cuanto hay un test
    /// cerrado o uno a medias.
    private static func tests(_ clave: FilaRendimiento.Clave, _ etiqueta: String, _ bateria: BateriaPerfil?) -> FilaRendimiento {
        // Sin batería programada no hay contador que enseñar Y no hay acto que el atleta pueda hacer:
        // los tests los programa su coach. Se dice, y no se pinta un «0 de 0», que es el estado roto
        // que el propio modelo avisa.
        guard let b = bateria, b.total > 0 else {
            return FilaRendimiento(clave, etiqueta, .vacio(invitacion: "Tu coach los programa y aparecen aquí"))
        }
        let base = b.completados == 1 ? "calibrado" : "calibrados"
        return FilaRendimiento(
            clave: clave,
            etiqueta: etiqueta,
            estado: .valor(
                "\(b.completados)",
                sufijo: "de \(b.total)",
                pie: b.aMedias > 0 ? TextosPerfil.unir(base, "\(b.aMedias) sin resultado") : base
            ),
            logrado: b.completados > 0 || b.aMedias > 0,
            pideActo: b.completados < b.total,
            avance: .init(n: b.completados, de: b.total),
            salida: nil
        )
    }

    /// CONTADOR — cuántas pruebas del catálogo tienen ya un récord.
    private static func marcas(_ clave: FilaRendimiento.Clave, _ etiqueta: String, _ m: MarcasPerfil) -> FilaRendimiento {
        guard m.catalogo > 0 else {
            return FilaRendimiento(clave, etiqueta, .vacio(invitacion: "Aún no hay marcas que probar"))
        }
        return FilaRendimiento(
            clave: clave,
            etiqueta: etiqueta,
            estado: .valor("\(m.conRecord)", sufijo: "de \(m.catalogo)", pie: "con récord"),
            logrado: m.conRecord > 0,
            pideActo: false,
            avance: .init(n: m.conRecord, de: m.catalogo),
            salida: nil
        )
    }

    /// VALOR MEDIDO — no existe hasta que algo lo mide.
    private static func vo2(_ clave: FilaRendimiento.Clave, _ etiqueta: String, _ v: Vo2Perfil?) -> FilaRendimiento {
        guard let v else {
            return FilaRendimiento(
                clave: clave, etiqueta: etiqueta,
                estado: .vacio(invitacion: "Lo trae tu reloj, o el Cooper de 12 min"),
                logrado: false, pideActo: false, avance: nil, salida: "Cómo medirlo"
            )
        }
        return FilaRendimiento(
            clave: clave,
            etiqueta: etiqueta,
            estado: .valor(
                Formato.esDecimal(v.valor),
                pie: TextosPerfil.unir("ml/kg/min", v.fuente == .reloj ? "tu reloj" : "tu Cooper")
            ),
            logrado: true,
            pideActo: false,
            avance: nil,
            salida: nil
        )
    }

    /// VALOR MEDIDO — sin ancla no hay zonas, y no se inventa ninguna. La invitación dice los DOS
    /// actos que las calculan (MyZonesView): la fecha de nacimiento da una primera estimación; el test
    /// de umbral, las de verdad.
    private static func zonas(_ clave: FilaRendimiento.Clave, _ etiqueta: String, _ z: ZonasPerfil?) -> FilaRendimiento {
        guard let z else {
            return FilaRendimiento(
                clave: clave, etiqueta: etiqueta,
                estado: .vacio(invitacion: "Tu edad o un test de umbral las calculan"),
                logrado: false, pideActo: false, avance: nil, salida: "Cómo tenerlas"
            )
        }
        // SIEMPRE el origen que escribe el servidor: un umbral inferido no puede leerse como medido.
        return FilaRendimiento(
            clave: clave,
            etiqueta: etiqueta,
            estado: .valor("\(z.umbralPpm)", sufijo: Vocab.ppm, pie: z.origen),
            logrado: true,
            pideActo: false,
            avance: nil,
            salida: nil
        )
    }

    /// VALOR MEDIDO — el levantamiento más pesado abre la fila y el pie dice CUÁL es: sin eso,
    /// «245 kg» en una fila que se llama «Fuerza» no dice de qué levantamiento habla.
    private static func fuerza(_ clave: FilaRendimiento.Clave, _ etiqueta: String, _ lista: [LevantamientoPerfil]) -> FilaRendimiento {
        guard let primero = lista.first else {
            return FilaRendimiento(
                clave: clave, etiqueta: etiqueta,
                estado: .vacio(invitacion: "Un test de peso y repeticiones calcula tu 1RM"),
                logrado: false, pideActo: false, avance: nil, salida: "Registrar un test"
            )
        }
        // En un empate gana el primero, como en la web.
        let masPesado = lista.dropFirst().reduce(primero) { $1.kg > $0.kg ? $1 : $0 }
        let carga = Formato.carga(masPesado.kg)
        let cuantos = lista.count == 1 ? "1 levantamiento" : "\(lista.count) levantamientos"
        return FilaRendimiento(
            clave: clave,
            etiqueta: etiqueta,
            estado: .valor(carga.cifra, sufijo: carga.unidad, pie: TextosPerfil.unir(masPesado.etiqueta.lowercased(), cuantos)),
            logrado: true,
            pideActo: false,
            avance: nil,
            salida: nil
        )
    }
}

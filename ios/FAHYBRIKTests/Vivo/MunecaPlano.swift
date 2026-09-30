import Foundation
@testable import FAHYBRIK

// EL «PLANO» DEL CUADRO DE LA MUÑECA — el cuadro en líneas de texto, en el
// MISMO formato que escribe el kit web (`web/tests/design-twin/muneca-correr-vectores.ts`).
// Los vectores de oro traen el plano que pinta el kit; aquí se saca el del
// Swift, y el examen compara línea a línea. Si cambias un formato aquí,
// cámbialo allí (y regenera los vectores).

enum MunecaPlano {

    /// Un número a 3 decimales, sin ceros de más ni «-0» (igual que `n3` del kit).
    static func n3(_ x: Double) -> String {
        let r = (x * 1000).rounded() / 1000
        if r == 0 { return "0" }
        return r == r.rounded() ? String(Int(r)) : "\(r)"
    }

    /// Une con «|»: lo que no hay se escribe «-».
    static func un(_ partes: [String?]) -> String { partes.map { $0 ?? "-" }.joined(separator: "|") }

    private static func num(_ x: Double?) -> String? { x.map(n3) }

    private static func hex(_ c: UInt32) -> String { String(format: "#%06X", c) }

    private static func zona(_ z: Vivo.ZonaVista?) -> String? { z.map { "Z\($0.n)\(hex($0.color))" } }

    private static func linea(_ clave: String, _ l: Vivo.LineaDeDato?) -> [String] {
        guard let l else { return [] }
        let v = l.vista
        let aviso = v.aviso.map { "\($0.marca) \($0.texto)" }
        return ["\(clave)=" + un([v.etiqueta, v.valor, v.unidad, v.glifo ? "pulso" : nil, v.tendencia?.rawValue, zona(v.zona), aviso, n3(l.cuerpoValor)])]
    }

    private static func contexto(_ c: Vivo.LineaTexto) -> String { "ctx=" + un([c.texto, n3(c.cuerpo)]) }

    private static func heroe(_ h: Vivo.HeroeMuneca) -> String {
        let v = h.vista
        return "heroe=" + un([v.clase.rawValue, v.texto, v.unidad, v.etiqueta, zona(v.zona), n3(h.talla.cuerpo), n3(h.talla.cuerpoUnidad)])
    }

    private static func banda(_ b: Vivo.BandaVista?) -> [String] {
        guard let b else { return [] }
        let palabra = b.palabra.map { "\($0.marca ?? "")\($0.texto)" }
        let zs = b.zonas.map { "\($0.colores.map(hex).joined(separator: ","))@\($0.objetivo.0)-\($0.objetivo.1)" }
        return ["banda=" + un([b.eje.rawValue, n3(b.desde), n3(b.hasta), num(b.marca), b.veredicto?.rawValue, b.rotulo, palabra, zs])]
    }

    private static func nota(_ clave: String, _ n: Vivo.NotaVista?) -> [String] {
        guard let n else { return [] }
        return ["\(clave)=" + un([(n.prefijo.map { "\($0) " } ?? "") + n.texto, String(n.lineas)])]
    }

    /// La cara de la página Paso, en el formato del kit.
    static func plano(_ cara: Vivo.CaraMuneca, tinte: Vivo.TinteVista?) -> [String] {
        switch cara {
        case let .paso(c):
            return ["cara=paso", contexto(c.contexto)]
                + nota("nota", c.nota)
                + [heroe(c.heroe)]
                + banda(c.banda)
                + (c.instruccion.map { ["instr=" + un([$0.texto, n3($0.cuerpo)])] } ?? [])
                + linea("segundo", c.segundo) + linea("tercero", c.tercero)
                + ["tinte=" + (tinte.map { hex($0.color) } ?? "-")]
        case let .recupera(c):
            return ["cara=recupera", contexto(c.contexto), heroe(c.heroe)] + nota("luego", c.luego) + linea("pulso", c.pulso)
        case let .descanso(c):
            return ["cara=descanso", contexto(c.contexto), heroe(c.heroe)] + nota("viene", c.viene) + linea("pulso", c.pulso)
        case .completada:
            return ["cara=completada"]
        default:
            // Serie, «colócate» y anotar (fuerza y ergo) no entran en los vectores de correr.
            return ["cara=\(cara)"]
        }
    }

    /// La cuenta atrás o el GO.
    static func plano(_ c: Vivo.CaraCuenta) -> [String] {
        [contexto(c.contexto)] + (c.que.map { ["que=" + un([$0.texto, n3($0.cuerpo)])] } ?? []) + [heroe(c.numero)]
    }

    /// Una fila de la página Datos: valor, unidad y la zona si es el pulso.
    static func plano(_ f: Vivo.FilaDatoVista) -> String { un([f.valor, f.unidad, f.zona.map { "Z\($0.n)" }]) }

    /// Una fila de la página Vueltas.
    static func plano(_ f: Vivo.FilaSplit) -> String {
        un([f.n, f.valor, f.detalle, f.juicio.map { "\($0.texto)#\($0.fuera)" }])
    }

    static func plano(_ f: Vivo.FilaLista) -> String { "\(f.estado.rawValue)|\(f.linea)|\(f.detalle ?? "-")" }
}

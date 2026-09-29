import Foundation

// CÓMO SE NOMBRA UN DÍA RESPECTO A HOY — el vocabulario de fechas del Plan.
//
// Puro y sin SwiftUI: entra un ISO «YYYY-MM-DD» y el ISO de hoy, sale castellano. Las dos
// fechas entran por parámetro (nunca `Date()` por dentro) porque «Ayer» y «Mañana» dependen
// de qué día es, y un derivado que lo lee del reloj no se puede comprobar.
//
// Se apoya en `FechaES` (Formato.swift) para leer y escribir el ISO y para los meses; aquí solo
// vive lo que el Plan añade: la distancia entre dos días, el nombre de un día contra hoy y el
// rango de una semana. Espejo de `web/components/design-twin/kit-plan/fechas.ts`.
//
// El prefijo «Hoy», «Ayer» o «Mañana» es un HECHO, no una plantilla (CONTRATO-UI §7): un día
// que no es hoy no puede llevar «Hoy», y uno a tres días de distancia no puede llamarse «Ayer».

enum FechasDelPlan {

    /// Días de calendario de `a` a `b` (negativo = `b` ya pasó respecto a `a`). Nil si algún ISO no se lee.
    static func diasEntre(_ a: String, _ b: String) -> Int? {
        FechaES.fecha(a).flatMap { FechaES.diasHasta(b, desde: $0) }
    }

    /// 1 = lunes … 7 = domingo (el `day_of_week` del cable). Nil si el ISO no se lee.
    static func diaSemana(de iso: String) -> Int? {
        guard let fecha = FechaES.fecha(iso) else { return nil }
        // `weekday` de Gregoriano: 1 = domingo … 7 = sábado.
        let w = Calendar(identifier: .gregorian).component(.weekday, from: fecha)
        return (w + 5) % 7 + 1
    }

    /// El día del mes de un ISO («2026-10-01» → 1). Cero si no se lee, para que quien lo pinte no invente un día.
    static func numeroDelMes(_ iso: String) -> Int {
        SemanaDelPlan.diaDelMesDe(iso)
    }

    /// «Jueves 1»: el nombre del día y su número. Nil si el ISO no se lee.
    static func nombreConNumero(_ iso: String) -> String? {
        diaSemana(de: iso).map { "\(SemanaDelPlan.nombreDeDia($0)) \(numeroDelMes(iso))" }
    }

    /// «Ayer» · «Mañana» · «Sábado 3»: cómo se nombra un día respecto a hoy, sin mentir sobre la distancia.
    static func rotulo(de iso: String, hoy: String) -> String {
        switch diasEntre(hoy, iso) {
        case 0: return "Hoy"
        case -1: return "Ayer"
        case 1: return "Mañana"
        default: return nombreConNumero(iso) ?? ""
        }
    }

    /// «Hoy · Jueves 1» / «Ayer · Miércoles 30» / «Mañana · Viernes 2» / «Sábado 3». El prefijo es un HECHO.
    static func etiqueta(de iso: String, hoy: String) -> String {
        let nombre = nombreConNumero(iso) ?? ""
        switch diasEntre(hoy, iso) {
        case 0: return "Hoy · \(nombre)"
        case -1: return "Ayer · \(nombre)"
        case 1: return "Mañana · \(nombre)"
        default: return nombre
        }
    }

    /// «Del 28 sep al 4 oct»: el rango de una semana, siempre un hecho (viene del cable). Nil si no se leen.
    static func rango(desde: String, hasta: String) -> String? {
        guard let a = FechaES.corta(desde), let b = FechaES.corta(hasta) else { return nil }
        return "Del \(a) al \(b)"
    }

    /// «Faltan 4 días» · «Falta 1 día»: lo que queda para que empiece un plan ya programado. Nil si ya empezó (nunca un cero).
    static func faltanParaEmpezar(hoy: String, inicio: String) -> String? {
        guard let n = diasEntre(hoy, inicio), n > 0 else { return nil }
        return n == 1 ? "Falta 1 día" : "Faltan \(n) días"
    }

    /// «mañana» o «del viernes»: el complemento de «Ver lo de …».
    static func cuandoDeSiguiente(_ iso: String, hoy: String) -> String {
        if diasEntre(hoy, iso) == 1 { return "mañana" }
        return "del \((diaSemana(de: iso).map(SemanaDelPlan.nombreDeDia) ?? "día").lowercased())"
    }
}

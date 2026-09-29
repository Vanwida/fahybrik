import Foundation

// LO QUE PASA CON EL HISTORIAL CUANDO EL ATLETA IMPORTA O DESHACE — las dos reglas de
// `kit-carreras/acciones.ts` que la app SÍ ejecuta, puras y probadas.
//
// El resto de ese fichero (un solo principal, fijar una carrera nueva pasa la anterior a
// secundaria, quitar…) son reglas del SERVIDOR que el doble simula: en la app las hace el servidor
// y `racesMutated()` trae el resultado. Estas dos, en cambio, se aplican en local ANTES de esa
// respuesta (para que el historial cambie al instante) y por eso tienen que ser exactas:
//   · importar es idempotente por carrera — re-importar refresca, no duplica: un upsert por `raceId`;
//   · «No soy yo» borra TODO lo importado y deja los objetivos vencidos sin resultado: esos no vienen
//     de ninguna importación (y sustituir el historial entero por lo importado, como se hacía, los
//     borraba hasta que llegaba la respuesta del servidor).
enum AccionesCarreras {

    /// Las de `nuevas` pisan a las que ya estaban con el mismo `raceId`; el resto se conserva.
    static func unirPorId(_ actuales: [ImportedRace], _ nuevas: [ImportedRace]) -> [ImportedRace] {
        let ids = Set(nuevas.map(\.race_id))
        return actuales.filter { !ids.contains($0.race_id) } + nuevas
    }

    /// Lo que queda tras «No soy yo»: solo lo que no tiene resultado (los objetivos vencidos).
    static func sinImportadas(_ pasadas: [ImportedRace]) -> [ImportedRace] {
        pasadas.filter { $0.result_time_seconds == nil }
    }
}

#!/usr/bin/env python3
"""Genera tests/Vectores.mc: los vectores de oro del plan compacto para el reloj.

    python3 tools/generar-vectores.py

Cada fichero de web/tests/design-twin/fixtures/garmin-plan/*.json trae el plan en
base64 (lo que baja por la red) y el plan YA decodificado por el códec de
referencia (TypeScript). Aquí se calcula, del plan de referencia, una FIRMA: un
número que resume todo lo que el reloj tiene que haber leído (cabecera, zonas,
reglas, vocabulario, método y cada campo de cada paso). El test del simulador
decodifica el base64 con el código de Monkey C, calcula la MISMA firma con
`plan/Firma.mc` y compara. Si un campo se lee mal, la firma cambia.

El orden de la firma es el de `Firma.mc`: cámbialos juntos.
"""
import json
import os
import glob

import formato as F

MOD = 1000003


def mezclar(h, x):
    return (h * 31 + (x % MOD)) % MOD


class Firma:
    def __init__(self):
        self.h = 7

    def n(self, x):
        self.h = mezclar(self.h, int(x))

    def opc(self, x):
        self.n(0 if x is None else int(x) + 1)

    def texto(self, s):
        for ch in s:
            self.h = mezclar(self.h, ord(ch))
        self.n(len(s))

    def texto_opc(self, s):
        if s is None:
            self.n(0)
        else:
            self.n(1)
            self.texto(s)


def deci(v):
    return int(round(v * 10))


def centi(v):
    return int(round(v * 100))


def firma_de(meta, plan, T):
    f = Firma()
    f.traza = []
    idx = lambda tabla, x: T[tabla].index(x)
    idxo = lambda tabla, x: 0 if x is None else T[tabla].index(x) + 1

    f.n(meta["asignacionId"])
    f.n(meta["huella"])
    f.n(meta["fitSport"])
    f.n(meta["fitSubSport"])
    f.n(idxo("ENTORNOS", meta.get("entorno")))
    f.n(meta["duracionEstS"])

    f.traza.append(f.h)
    z = plan.get("zonas")
    if z is None:
        f.n(0)
    else:
        f.n(len(z["techos"]))
        for t in z["techos"]:
            f.n(t)
        f.n(idx("PROCEDENCIAS", z["procedencia"]))
        nombres = z.get("nombres")
        f.n(0 if not nombres else len(nombres))
        for s in nombres or []:
            f.texto(s)

    f.traza.append(f.h)
    bandas = plan.get("bandasRitmo", [])
    f.n(len(bandas))
    for b in bandas:
        f.n(idx("UNIDADES_RITMO", b["unidad"]))
        f.n(idx("PROCEDENCIAS", b["procedencia"]))
        f.n(len(b["zonas"]))
        for zz in b["zonas"]:
            f.n(zz["rapidoS"])
            f.opc(zz["lentoS"])

    f.traza.append(f.h)
    r = plan["reglas"]
    for k in ("ritmo", "ppm", "split500", "vatios", "cadencia"):
        f.n(r["holgura"][k])
    for k in ("cadenciaS", "confirmacionS", "graciaZonaS", "preavisoS", "preavisoM", "preavisoMinimoS"):
        f.n(r[k])
    f.n(1 if r["avisarEnCalentamiento"] else 0)
    f.n(1 if r["avisarEnRecuperacion"] else 0)

    f.traza.append(f.h)
    v = plan["vocabulario"]
    f.n(len(v["clases"]))
    # En el cable las clases van por orden de código; el JSON de referencia las trae en otro orden.
    for clase, nc in sorted(v["clases"].items(), key=lambda kv: idx("CLASES", kv[0])):
        f.n(idx("CLASES", clase))
        f.texto(nc["nombre"])
        f.n(1 if nc["femenino"] else 0)
    for nom in T["FORMATOS_NOMBRADOS"]:
        f.texto(v["formatos"][nom])
    for s in v["rpe"]:
        f.texto(s)

    f.traza.append(f.h)
    m = plan["metodo"]
    f.n(m["resumen"]["paresMinimos"])
    f.n(centi(m["resumen"]["umbralHecho"]))
    f.n(m["resumen"]["guardarQuietoS"])
    f.n(m["anotar"]["repsDeMas"])
    for eje in ("rpe", "rir"):
        for k in ("min", "max", "paso"):
            f.n(deci(m["anotar"][eje][k]))
    f.n(centi(m["anotar"]["kgMax"]))

    f.traza.append(f.h)
    f.texto_opc(plan.get("pareja"))

    pasos = plan["pasos"]
    f.n(len(pasos))
    f.traza.append(f.h)
    for p in pasos:
        f.n(idx("CLASES", p["clase"]))
        f.n(idx("ROLES", p["rol"]))
        f.n(idx("FASES", p["fase"]))
        f.n(1 if p["cierre"] == "atleta" else 0)
        me = p["medida"]
        f.n(idx("TIPOS_MEDIDA", me["tipo"]))
        f.opc(me["prescrito"])
        f.n(idx("QUIEN_MIDE", me["mide"]))
        f.n(len(p["objetivos"]))
        for o in p["objetivos"]:
            esc = centi if o["eje"] == "kg" else deci
            f.n(idx("EJES", o["eje"]))
            f.n(idx("PAPELES", o["papel"]))
            f.n(idxo("SENTIDOS_AVISO", o.get("avisa")))
            f.n(idxo("ESCALAS_OBJETIVO", o.get("escala")))
            f.opc(None if o["min"] is None else esc(o["min"]))
            f.opc(None if o["max"] is None else esc(o["max"]))
            f.texto_opc(o.get("palabra"))
        f.n(idxo("MODOS_RECUPERA", p.get("modoRecupera")))
        f.n(idxo("ENTORNOS", p.get("entorno")))
        maq = p.get("maquina")
        f.n(0 if not maq else idx("MAQUINAS", maq["tipo"]) + 1)
        f.n(idxo("ROXZONAS", p.get("roxzone")))
        f.opc(maq.get("damper") if maq else None)
        pos = p.get("posicion")
        for c in T["CONTADORES"]:
            if pos and c in pos:
                f.n(pos[c]["n"] + 1)
                f.n(pos[c]["de"])
            else:
                f.n(0)
        slot = pos.get("slot") if pos else None
        if slot:
            f.n(ord(slot[0]) - 64)
            f.n(int(slot[1:]))
        else:
            f.n(0)
        f.opc(p.get("bloque"))
        f.texto_opc(p.get("nombre"))
        c = p.get("carga")
        if c:
            f.n(1)
            f.n(centi(c["kg"]))
            f.n(c.get("implementos", 0))
        else:
            f.n(0)
        t = p.get("tempo")
        if t:
            f.n(1)
            for k in ("excentrica", "pausaAbajo", "concentrica", "pausaArriba"):
                f.n(t[k])
        else:
            f.n(0)
        f.texto_opc(p.get("cue"))
        f.opc(p.get("vueltaAutoM"))
        g = p.get("grupo")
        f.n(0 if not g else g["id"] + 1)
        f.n(0 if not g else g["veces"])
        f.n(idxo("FORMATOS_WOD", p["wod"]["formato"] if p.get("wod") else None))
        f.n(1 if p.get("fuerza") else 0)
        f.n(idxo("TURNOS_DOBLES", p["dobles"]["turno"] if p.get("dobles") else None))
        f.traza.append(f.h)
    firma_de.traza = f.traza
    return f.h


# ¿Es una sesión que la v1 sabe guiar (solo correr)? Misma regla que `Sesion.soportada()`.
CLASES_CORRER = {
    "calentamiento", "vuelta-calma", "rodaje", "tirada", "tempo", "series", "progresivo", "fartlek",
    "cuestas", "strides", "carrera", "test", "recuperacion", "descanso", "descanso-tandas", "movilidad",
}


def soportada(plan):
    for p in plan["pasos"]:
        if p["clase"] not in CLASES_CORRER:
            return False
        if p.get("wod") or p.get("fuerza") or p.get("dobles") or p.get("maquina") or p.get("roxzone"):
            return False
    return True


def main():
    T = {t: F.tabla(t) for t in F.TABLAS}
    casos = []
    for ruta in sorted(glob.glob(os.path.join(F.FIXTURES, "*.json"))):
        d = json.load(open(ruta, encoding="utf-8"))
        if "base64" not in d or "meta" not in d or "plan" not in d:
            print(f"salto {os.path.basename(ruta)}: no es un vector de plan")
            continue
        casos.append((os.path.basename(ruta)[:-5], d["base64"], firma_de(d["meta"], d["plan"], T), len(d["plan"]["pasos"]), d["meta"]["asignacionId"], soportada(d["plan"])))
    filas = ",\n".join(
        f'        ["{c}", "{b}", {h}, {n}, {a}, {"true" if s else "false"}]' for c, b, h, n, a, s in casos
    )
    pruebas = "\n".join(
        f'(:test)\nfunction vector_{c.replace("-", "_")}(logger as Test.Logger) as Lang.Boolean {{\n    return ComprobarPlan.vector(Vectores.TODOS[{i}], logger);\n}}\n'
        for i, (c, *_r) in enumerate(casos)
    )
    salida = f"""//
// GENERADO por tools/generar-vectores.py. NO EDITAR A MANO.
// {len(casos)} vectores de oro de web/tests/design-twin/fixtures/garmin-plan/.
// Cada fila: [caso, base64, firma esperada, nº de pasos, asignacionId, ¿soportada en v1?].
//
using Toybox.Lang;
using Toybox.Test;

(:test)
module Vectores {{
    const TODOS = [
{filas}
    ];
}}

{pruebas}"""
    ruta = os.path.join(F.RAIZ, "tests", "Vectores.mc")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    open(ruta, "w", encoding="utf-8").write(salida)
    print(f"{len(casos)} vectores → {ruta}")


if __name__ == "__main__":
    main()

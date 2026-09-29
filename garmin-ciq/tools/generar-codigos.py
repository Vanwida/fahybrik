#!/usr/bin/env python3
"""Genera source/plan/Codigos.mc desde formato.ts (la ABI del plan compacto).

    python3 tools/generar-codigos.py

Un código que el reloj y el servidor entienden distinto es un plan mal leído en la
muñeca: por eso la tabla NO se escribe a mano. Si formato.ts crece (solo se añade
al final y sube VERSION_ESQUEMA), se regenera y el reloj rechaza la versión que no
conoce.
"""
import os

import formato as F

# Prefijo de cada enum: `Cod.CLASE_SERIES`, `Cod.EJE_RITMO`…
PREFIJOS = {
    "CLASES": "CLASE",
    "ROLES": "ROL",
    "FASES": "FASE",
    "TIPOS_MEDIDA": "MEDIDA",
    "QUIEN_MIDE": "MIDE",
    "EJES": "EJE",
    "PAPELES": "PAPEL",
    "SENTIDOS_AVISO": "AVISA",
    "MODOS_RECUPERA": "RECUPERA",
    "ENTORNOS": "ENTORNO",
    "MAQUINAS": "MAQUINA",
    "ROXZONAS": "ROXZONA",
    "FORMATOS_WOD": "WOD",
    "TIPOS_CARGA": "CARGA",
    "EJES_ESFUERZO": "ESFUERZO",
    "POR_LADO": "LADO",
    "TURNOS_DOBLES": "TURNO",
    "PROCEDENCIAS": "PROC",
    "UNIDADES_RITMO": "UNIDAD",
    "ESCALAS_OBJETIVO": "ESCALA",
    "TIPOS_ALTERNA": "ALTERNA",
    "FORMATOS_NOMBRADOS": "FORMATO",
    "BANDERAS_PASO": "BANDERA",
    "CONTADORES": "CONTADOR",
}


def ident(texto):
    return texto.upper().replace("-", "_")


def main():
    salida = [
        "//",
        "// GENERADO por tools/generar-codigos.py desde formato.ts. NO EDITAR A MANO.",
        "//",
        "// La ABI del plan compacto (docs/garmin-reloj/plan-compacto.md): el orden de cada",
        "// tabla ES el código que viaja por el cable. Solo se añade al final.",
        "//",
        "using Toybox.Lang;",
        "",
        "module Cod {",
    ]
    for c in F.CONSTANTES:
        salida.append(f"    const {c} = {F.entero(c)};")
    salida.append("")
    for t in F.ANCHOS:
        salida.append(f"    const {t} = {F.anchos(t)!r};")
    banderas = F.tabla("BANDERAS_PASO")
    salida.append(f"    const ANCHOS_BANDERAS_PASO = {[2] + [1] * len(banderas)!r};")
    salida.append("")
    for t in F.TABLAS:
        items = F.tabla(t)
        p = PREFIJOS[t]
        salida.append(f"    const N_{p} = {len(items)};")
        salida.append("    enum {")
        salida.extend(f"        {p}_{ident(x)} = {i}," for i, x in enumerate(items))
        salida.append("    }")
        salida.append("")
    salida.append("}")
    ruta = os.path.join(F.RAIZ, "source", "plan", "Codigos.mc")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    open(ruta, "w", encoding="utf-8").write("\n".join(salida) + "\n")
    print(f"escrito {ruta}")


if __name__ == "__main__":
    main()

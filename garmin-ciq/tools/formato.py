"""Lee las tablas del contrato de cable (formato.ts) para que el reloj y el servidor
hablen del MISMO formato sin copiarlo a mano.

`formato.ts` es la única fuente de la ABI del plan compacto (docs/garmin-reloj/
plan-compacto.md). Aquí se extraen sus tablas de códigos, los anchos de bits de los
campos empaquetados y las constantes. Lo usan `generar-codigos.py` y
`generar-vectores.py`.
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORMATO_TS = os.path.join(RAIZ, "..", "web", "components", "design-twin", "kit-garmin", "plan-compacto", "formato.ts")
FIXTURES = os.path.join(RAIZ, "..", "web", "tests", "design-twin", "fixtures", "garmin-plan")


def _fuente():
    return open(FORMATO_TS, encoding="utf-8").read()


def tabla(nombre):
    """Una tabla `export const NOMBRE = [ 'a', 'b' ] as const ...` → lista de cadenas."""
    m = re.search(r"export const " + nombre + r"\s*=\s*\[(.*?)\]\s*as const", _fuente(), re.S)
    if not m:
        raise SystemExit(f"formato.ts: no encuentro la tabla {nombre}")
    return re.findall(r"'([^']*)'", m.group(1))


def anchos(nombre):
    """`export const ANCHOS_X = [2, 2, 1] as const;` → [2, 2, 1]."""
    m = re.search(r"export const " + nombre + r"\s*=\s*\[([\d,\s]+)\]\s*as const", _fuente())
    if not m:
        raise SystemExit(f"formato.ts: no encuentro {nombre}")
    return [int(x) for x in re.findall(r"\d+", m.group(1))]


def entero(nombre):
    m = re.search(r"export const " + nombre + r"\s*=\s*([\d ]+)(?:;|\s*/)", _fuente())
    if not m:
        raise SystemExit(f"formato.ts: no encuentro la constante {nombre}")
    return int(m.group(1).replace(" ", ""))


TABLAS = [
    "CLASES",
    "ROLES",
    "FASES",
    "TIPOS_MEDIDA",
    "QUIEN_MIDE",
    "EJES",
    "PAPELES",
    "SENTIDOS_AVISO",
    "MODOS_RECUPERA",
    "ENTORNOS",
    "MAQUINAS",
    "ROXZONAS",
    "FORMATOS_WOD",
    "TIPOS_CARGA",
    "EJES_ESFUERZO",
    "POR_LADO",
    "TURNOS_DOBLES",
    "PROCEDENCIAS",
    "UNIDADES_RITMO",
    "ESCALAS_OBJETIVO",
    "TIPOS_ALTERNA",
    "FORMATOS_NOMBRADOS",
    "BANDERAS_PASO",
    "CONTADORES",
]

ANCHOS = [
    "ANCHOS_ROL_FASE",
    "ANCHOS_MEDIDA",
    "ANCHOS_OBJETIVO",
    "ANCHOS_EXTRAS",
    "ANCHOS_TAREA",
    "ANCHOS_FICHA",
    "ANCHOS_POSICION",
    "ANCHOS_FLAGS_REGLAS",
]

CONSTANTES = ["VERSION_ESQUEMA", "NUM_PALABRAS_RPE", "MAX_OBJETIVOS", "MAX_PASOS"]

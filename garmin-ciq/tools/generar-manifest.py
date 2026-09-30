#!/usr/bin/env python3
"""Reescribe la lista de relojes de manifest.xml desde el SDK instalado.

Los ids NO se escriben a mano: salen de los `compiler.json` que el SDK deja en
`~/Library/Application Support/Garmin/ConnectIQ/Devices/` (los mismos que lee
`monkeyc`). Un id que el SDK no conoce rompe el paquete de la Store; con esto
es imposible.

Criterio (docs/garmin-reloj/modelo.md §3, nivel A):
  · memoria de un watch-app >= 512 KB
  · API de Connect IQ >= 5.2
  · familia de 5 botones de la lista `FAMILIAS_NIVEL_A` (dato, editable aquí)

Uso:  python3 tools/generar-manifest.py            # reescribe manifest.xml
      python3 tools/generar-manifest.py --lista    # solo imprime los ids
"""
import glob
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_DISPOSITIVOS = os.path.expanduser("~/Library/Application Support/Garmin/ConnectIQ/Devices")

MEMORIA_MINIMA_BYTES = 512 * 1024
API_MINIMA = (5, 2, 0)

# Familias del nivel A: prefijos de id. Los Venu y vivoactive (2-3 botones) son
# el nivel B y quedan fuera hasta que tengan su gramática.
FAMILIAS_NIVEL_A = [
    ("Forerunner", r"^fr(165|170|255|265|570|955|965|970)"),
    ("fenix", r"^fenix(7|8|e)"),
    ("epix", r"^epix2"),
    ("Instinct 3 AMOLED", r"^instinct3amoled"),
    ("Enduro", r"^enduro3"),
]


def version(texto):
    return tuple(int(x) for x in texto.split("."))


def candidatos():
    salida = []
    for ruta in sorted(glob.glob(os.path.join(DIR_DISPOSITIVOS, "*", "compiler.json"))):
        d = json.load(open(ruta))
        ident = d["deviceId"]
        familia = next((n for n, p in FAMILIAS_NIVEL_A if re.match(p, ident)), None)
        if familia is None:
            continue
        memoria = next(a["memoryLimit"] for a in d["appTypes"] if a["type"] == "watchApp")
        api = version(d["partNumbers"][0]["connectIQVersion"])
        if memoria >= MEMORIA_MINIMA_BYTES and api >= API_MINIMA:
            salida.append((familia, ident))
    return salida


def bloque(dispositivos):
    lineas = ["        <iq:products>"]
    actual = None
    for familia, ident in dispositivos:
        if familia != actual:
            lineas.append(f"            <!-- {familia} -->")
            actual = familia
        lineas.append(f'            <iq:product id="{ident}"/>')
    lineas.append("        </iq:products>")
    return "\n".join(lineas)


def main():
    dispositivos = candidatos()
    if "--lista" in sys.argv:
        print("\n".join(i for _, i in dispositivos))
        return
    ruta = os.path.join(RAIZ, "manifest.xml")
    texto = open(ruta).read()
    nuevo, n = re.subn(r"        <iq:products>.*?</iq:products>", lambda _: bloque(dispositivos), texto, flags=re.S)
    if n != 1:
        sys.exit("manifest.xml: no encuentro exactamente un bloque <iq:products>")
    open(ruta, "w").write(nuevo)
    print(f"{len(dispositivos)} relojes escritos en manifest.xml")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Dibuja los PNG de `docs/mocks/reloj-correr*.png` — la interfaz de correr en la muñeca.

Por qué existe un renderizador y no un HTML suelto: la card pidió PNG, y un PNG
no se puede corregir. Aquí las medidas no se escriben a ojo — salen de las mismas
constantes que hace cumplir `web/components/design-twin/kit-watch/modelo.ts`
(lienzo 208×248 pt, útil 188×212, CAP_EM 0,70, avance mono 0,60, techo del sujeto
150 pt y suelo 43 pt), así que si una etiqueta crece y deja de caber en la muñeca,
se ve aquí antes de llegar a la captura.

    python3 docs/mocks/tools/reloj-correr.py

Requiere `google-chrome` en el PATH. Escribe en `docs/mocks/`.
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import sys
import tempfile
import time

# ---------------------------------------------------------------------------
# Tokens — espejo literal de ios/FAHYBRIKWatch/WatchTheme.swift
# ---------------------------------------------------------------------------

BG = "#000000"
SURFACE_RAISED = "#1F1F1F"
INK = "#FFFFFF"
# El gris secundario de WatchTheme (#8A8A8E) vale sobre negro y NO vale sobre un
# lienzo teñido: sobre el verde de la Z3 al 45 % se queda en 2,29:1 y la unidad y
# las versales dejan de leerse — el mismo «no se lee de un vistazo» que motivó el
# relleno fuerte. Un gris fijo no puede vivir sobre un fondo que cambia de color,
# así que el cromo pasa a ser BLANCO con alfa: mantiene 5,5:1 contra las cinco
# zonas y 10,5:1 sobre negro, sin dejar de pesar menos que el dato (§4).
DIM = "rgba(255,255,255,0.70)"
ORANGE = "#F06A2A"       # la acción
ORANGE_SOFT = "#FF8A4C"  # el aro: pasa el 3:1 contra las cinco zonas, el de marca no
ZONE_GREEN = "#2FD14F"   # Z3 «medio» — la única zona que sale en estas láminas
ZONE_RED = "#FF4D4D"
REST_BG = "#0D1B0F"

# ---------------------------------------------------------------------------
# El lienzo y su presupuesto — kit-watch/modelo.ts
# ---------------------------------------------------------------------------

LIENZO_W, LIENZO_H, LIENZO_R = 208, 248, 56
SAFE_TOP, SAFE_BOTTOM, SAFE_SIDE = 24, 12, 10
ANCHO_UTIL = LIENZO_W - 2 * SAFE_SIDE          # 188
ALTO_UTIL = LIENZO_H - SAFE_TOP - SAFE_BOTTOM  # 212

FILA = {"contexto": 14, "segundo": 26, "accion": 15, "nota": 13, "puntos": 14}
AIRE = 10
CAP_EM = 0.70
AVANCE_MONO = 0.60
UNIDAD_EM = 0.30
DECIMAL_EM = 0.42
SUJETO_TECHO = 150
SUJETO_SUELO = 43
SUJETO_GLIFOS_MAX = 5

VERSALES_CUERPO = 10
VERSALES_TRACKING = 1.1
AVANCE_VERSAL = 0.72
SEGUNDO_BASE = 22

# EL RELLENO DE ZONA — plano y fuerte, no una banda que se desvanece.
#
# La primera versión de estas láminas bajó el tinte del 38 % del kit al 22 %
# porque «no se leía como un tinte ambiente». Diagnóstico equivocado: lo que no
# dejaba leer la zona era el DEGRADADO, que iba a negro puro arriba y abajo y
# dejaba el color vivo sólo en una franja estrecha del centro — justo donde va el
# numeral, que lo tapa. Bajar el porcentaje encima de eso apagó el único sitio
# donde el color aún existía. Se corrige por la raíz: relleno PLANO al 45 % y el
# negro reducido a una viñeta.
#
# Por qué 45 y no más: el techo NO es de gusto, lo pone el ámbar de la Z4. El aro
# del bisel (#FF8A4C) tiene que mantener 3:1 contra el lienzo porque es un
# elemento gráfico que hay que entender, y sobre ámbar al 45 % se queda en 3,09:1
# — al 55 % cae a 2,30 y el aro desaparece. Con ese mismo 45 %, el numeral blanco
# va de 7,9:1 (verde) a 12,3:1 (azul), y las cinco zonas quedan a un vistazo:
# Z2 #133173 · Z3 #159438 · Z4 #73511D · Z5 #732222 · Z1 #3E3E40.
TINTE_MAX = 45

# La viñeta: oscurece las esquinas (donde la curva del bisel se come el lienzo) y
# las dos bandas de versales, y deja el cuerpo de la pantalla PLANO. Es lo que
# queda del degradado de antes: contraste donde hace falta, sin apagar el color.
DEGRADADO = (
    "radial-gradient(128% 96% at 50% 46%,rgba(0,0,0,0) 54%,rgba(0,0,0,0.34) 100%),"
    "linear-gradient(180deg,rgba(0,0,0,0.34) 0%,rgba(0,0,0,0) 13%,"
    "rgba(0,0,0,0) 86%,rgba(0,0,0,0.30) 100%)"
)

AVANCE_SANS = {":": 0.32, ".": 0.30, ",": 0.30, " ": 0.28, "·": 0.34,
               "×": 0.60, "—": 0.62, "-": 0.35, "/": 0.40, "~": 0.60}

# La corrección de estas láminas: el estimador del kit está calibrado para SF Pro
# y aquí se dibuja con Inter, que a cuerpo 22 avanza un 10 % más («4:10 /km» mide
# 95,9 px medidos contra 87,1 estimados). Sin esto, la comprobación de ancho da
# luz verde a una línea que en la captura sale recortada por los dos lados.
CAL_SANS = 1.10

# Y donde hay MEDIDA, manda la medida: estos anchos salen de medir cada cadena en
# el navegador con el estilo exacto con que se dibuja (`getBoundingClientRect`),
# no de estimarla. Es lo que separa «cabe con 7 pt de margen» de «no cabe por 1»,
# que con el estimador conservador son la misma respuesta.
MEDIDO_VERSALES = {
    "sin umbral · no hay zona": 167.4, "rodaje · te quedan": 126.5,
    "serie 3 de 5 · te quedan": 153.8, "recupera · viene la 4": 139.8,
    "sin señal · buscando": 140.4, "toca · empezar ya": 120.4, "la sesión": 62.7,
    "rodaje · 27:15": 89.6, "en pausa · te quedan": 138.4, "ritmo medio": 80.7,
    "en objetivo": 78.7, "ritmo": 38.6, "luego": 39.8, "tiempo": 45.7,
    "distancia": 65.0, "pulso": 39.2,
}
MEDIDO_SANS22 = {"4:10 /km": 95.9, "5:12 /km": 95.9, "1200 m": 82.9, "Z3 medio": 101.3}

FALLOS: list[str] = []


def _fallo(msg: str) -> None:
    FALLOS.append(msg)
    print(f"  ¡NO CABE!  {msg}", file=sys.stderr)


# ---------------------------------------------------------------------------
# La aritmética del sujeto — la misma que comprueba kit-watch.test.ts
# ---------------------------------------------------------------------------

def partir_decimal(texto: str) -> tuple[str, str]:
    i = texto.find(",")
    return (texto, "") if i < 0 else (texto[:i], texto[i:])


def ancho_en_glifos(texto: str, unidad: str = "") -> float:
    entero, decimal = partir_decimal(texto)
    return len(entero) + len(decimal) * DECIMAL_EM + len(unidad) * UNIDAD_EM


def alto_por_ancho(texto: str, unidad: str = "") -> float:
    return (ANCHO_UTIL / (max(1.0, ancho_en_glifos(texto, unidad)) * AVANCE_MONO)) * CAP_EM


def alto_por_presupuesto(segundo: bool, accion: bool, nota: bool, puntos: bool) -> float:
    ocupado = (FILA["contexto"] + (FILA["segundo"] if segundo else 0)
               + (FILA["accion"] if accion else 0) + (FILA["nota"] if nota else 0)
               + (FILA["puntos"] if puntos else 0))
    return min(SUJETO_TECHO, ALTO_UTIL - ocupado - 2 * AIRE)


def alto_sujeto(texto: str, unidad: str = "", *, segundo=False, accion=False,
                nota=False, puntos=True) -> float:
    """La altura de cifra que de verdad alcanza un sujeto. En la muñeca gana el ancho."""
    alto = min(alto_por_presupuesto(segundo, accion, nota, puntos),
               alto_por_ancho(texto, unidad))
    entero, _ = partir_decimal(texto)
    if len(entero) > SUJETO_GLIFOS_MAX:
        _fallo(f"«{texto}» tiene {len(entero)} cifras enteras (máx {SUJETO_GLIFOS_MAX})")
    if alto < SUJETO_SUELO:
        _fallo(f"«{texto}{unidad}» se queda en {alto:.0f} pt (suelo {SUJETO_SUELO})")
    return alto


def ancho_versales(texto: str) -> float:
    if texto in MEDIDO_VERSALES:
        return MEDIDO_VERSALES[texto]
    em = 0.0
    for ch in texto:
        em += AVANCE_SANS.get(ch, 0.60 if ch.isdigit() else AVANCE_VERSAL)
    return em * VERSALES_CUERPO + len(texto) * VERSALES_TRACKING


def ancho_sans(texto: str, cuerpo: float) -> float:
    if cuerpo == SEGUNDO_BASE and texto in MEDIDO_SANS22:
        return MEDIDO_SANS22[texto]
    if texto in MEDIDO_SANS22:
        return MEDIDO_SANS22[texto] * cuerpo / SEGUNDO_BASE
    em = 0.0
    for ch in texto:
        em += AVANCE_SANS.get(ch, 0.60 if ch.isdigit() else 0.58)
    return em * cuerpo * CAL_SANS


# ---------------------------------------------------------------------------
# Piezas del lienzo
# ---------------------------------------------------------------------------

def versales(texto: str, *, tono: str = DIM, arriba: int = 0) -> str:
    """Una línea de versales que NO se sale del reloj: se comprueba, no se supone."""
    ancho = ancho_versales(texto)
    ajuste = 1.0 if ancho <= ANCHO_UTIL else max(0.82, ANCHO_UTIL / ancho)
    if ancho * 0.82 > ANCHO_UTIL:
        _fallo(f"versales «{texto}» miden {ancho:.0f} pt sobre {ANCHO_UTIL}")
    return (f'<span style="font-family:var(--sans);font-size:{VERSALES_CUERPO * ajuste:.2f}px;'
            f'font-weight:800;letter-spacing:{VERSALES_TRACKING * ajuste:.2f}px;'
            f'text-transform:uppercase;color:{tono};white-space:nowrap;'
            f'margin-top:{arriba}px;flex:0 0 auto">{texto}</span>')


def numeral(texto: str, unidad: str = "", *, alto: float, color: str = INK,
            opacidad: float = 1.0) -> str:
    """El sujeto: mono de cifra rachada, RECTO (a 100 pt la cursiva se come el ancho)."""
    cuerpo = alto / CAP_EM
    entero, decimal = partir_decimal(texto)
    # La unidad se separa con un hueco explícito y CONTADO. Un espacio en el
    # texto no vale: el HTML lo colapsa contra el span de al lado y `,76km` sale
    # pegado — que es justo el fallo que una captura pequeña no delata.
    hueco_unidad = max(2.0, 0.07 * cuerpo) if unidad else 0.0
    ancho = ancho_en_glifos(texto, unidad) * AVANCE_MONO * cuerpo + hueco_unidad
    ajuste = 1.0 if ancho <= ANCHO_UTIL else ANCHO_UTIL / ancho
    base = (f'font-family:var(--mono);font-weight:800;font-variant-numeric:tabular-nums;'
            f'color:{color}')
    piezas = [f'<span style="{base};font-size:{cuerpo * ajuste:.2f}px;line-height:0.8">{entero}</span>']
    if decimal:
        piezas.append(f'<span style="{base};font-size:{cuerpo * DECIMAL_EM * ajuste:.2f}px;'
                      f'line-height:1">{decimal}</span>')
    if unidad:
        piezas.append(f'<span style="font-family:var(--mono);font-weight:800;color:{DIM};'
                      f'margin-left:{hueco_unidad:.1f}px;'
                      f'font-size:{cuerpo * UNIDAD_EM * ajuste:.2f}px;line-height:1">{unidad}</span>')
    return (f'<div style="display:flex;align-items:baseline;flex:0 0 auto;'
            f'opacity:{opacidad}">{"".join(piezas)}</div>')


def segundo_nivel(valor: str, *, etiqueta: str = "", color: str = INK,
                  tono_etiqueta: str = DIM, opacidad: float = 1.0) -> str:
    """El segundo nivel — y no hay tercero.

    El ancho se comprueba con las medidas REALES de la fuente (ver CAL_SANS): la
    estimación calibrada para SF Pro se queda un 10 % corta con Inter, y ahí es
    donde se colaba una línea recortada por los dos lados.
    """
    ancho = (ancho_sans(valor, SEGUNDO_BASE)
             + (ancho_versales(etiqueta) + 6 if etiqueta else 0))
    if ancho > ANCHO_UTIL:
        _fallo(f"el segundo nivel «{etiqueta} {valor}» mide {ancho:.0f} pt sobre {ANCHO_UTIL}")
    trozos = []
    if etiqueta:
        trozos.append(versales(etiqueta, tono=tono_etiqueta))
    trozos.append(f'<span style="font-family:var(--sans);font-size:{SEGUNDO_BASE}px;'
                  f'line-height:1.1;font-weight:800;font-variant-numeric:tabular-nums;'
                  f'color:{color};white-space:nowrap">{valor}</span>')
    return (f'<div style="display:flex;align-items:baseline;gap:6px;flex:0 0 auto;'
            f'opacity:{opacidad}">{"".join(trozos)}</div>')


def puntos(total: int, activa: int) -> str:
    bolas = "".join(
        f'<span style="width:6px;height:6px;border-radius:50%;'
        f'background:{INK if n == activa else "rgba(255,255,255,0.28)"}"></span>'
        for n in range(total)
    )
    return (f'<div style="flex:0 0 auto;height:{FILA["puntos"]}px;display:flex;'
            f'align-items:center;justify-content:center;gap:3px;width:100%">{bolas}</div>')


# --- el bisel: el progreso trazado sobre el borde, a coste cero de altura ----

INSET, GROSOR = 4, 5
RADIO = LIENZO_R - INSET
PERIMETRO = (2 * (LIENZO_W - 2 * INSET - 2 * RADIO)
             + 2 * (LIENZO_H - 2 * INSET - 2 * RADIO)
             + 2 * math.pi * RADIO)
TRAZADO = " ".join([
    f"M {LIENZO_W / 2} {INSET}",
    f"H {LIENZO_W - INSET - RADIO}",
    f"A {RADIO} {RADIO} 0 0 1 {LIENZO_W - INSET} {INSET + RADIO}",
    f"V {LIENZO_H - INSET - RADIO}",
    f"A {RADIO} {RADIO} 0 0 1 {LIENZO_W - INSET - RADIO} {LIENZO_H - INSET}",
    f"H {INSET + RADIO}",
    f"A {RADIO} {RADIO} 0 0 1 {INSET} {LIENZO_H - INSET - RADIO}",
    f"V {INSET + RADIO}",
    f"A {RADIO} {RADIO} 0 0 1 {INSET + RADIO} {INSET}",
    "Z",
])
VIA = "rgba(255,255,255,0.12)"


def _svg(cuerpo: str) -> str:
    return (f'<svg viewBox="0 0 {LIENZO_W} {LIENZO_H}" preserveAspectRatio="none" '
            f'style="position:absolute;inset:0;width:100%;height:100%">{cuerpo}</svg>')


def aro_continuo(queda: float, *, color: str = ORANGE_SOFT) -> str:
    q = min(1.0, max(0.0, queda))
    return _svg(
        f'<path d="{TRAZADO}" fill="none" stroke="{VIA}" stroke-width="{GROSOR}"/>'
        f'<path d="{TRAZADO}" fill="none" stroke="{color}" stroke-width="{GROSOR}" '
        f'stroke-linecap="round" stroke-dasharray="{PERIMETRO:.2f}" '
        f'stroke-dashoffset="{PERIMETRO * (1 - q):.2f}"/>'
    )


def aro_vacio() -> str:
    """Sólo el carril: no se sabe cuánto queda, y no se insinúa un progreso.

    Antes esto era un aro naranja al 22 % de alfa, que sobre negro se leía como
    «apagado» y sobre un lienzo teñido no se lee de ninguna manera: un traslúcido
    calibrado contra el negro deja de significar nada en cuanto el fondo tiene
    color. El carril dice lo mismo y no depende del fondo.
    """
    return _svg(f'<path d="{TRAZADO}" fill="none" stroke="{VIA}" stroke-width="{GROSOR}"/>')


def aro_segmentado(total: int, hechas: int, fraccion: float) -> str:
    hueco, paso = 7, PERIMETRO / total
    largo = paso - hueco
    avance = min(1.0, max(0.0, fraccion))
    partes = []
    for i in range(total):
        inicio = i * paso + hueco / 2
        visible = largo if i < hechas else (largo * avance if i == hechas else 0)
        partes.append(f'<path d="{TRAZADO}" fill="none" stroke="{VIA}" stroke-width="{GROSOR}" '
                      f'stroke-dasharray="{largo:.2f} {PERIMETRO:.2f}" '
                      f'stroke-dashoffset="{-inicio:.2f}"/>')
        if visible > 0:
            partes.append(f'<path d="{TRAZADO}" fill="none" stroke="{ORANGE_SOFT}" '
                          f'stroke-width="{GROSOR}" stroke-linecap="butt" '
                          f'stroke-dasharray="{visible:.2f} {PERIMETRO:.2f}" '
                          f'stroke-dashoffset="{-inicio:.2f}"/>')
    return _svg("".join(partes))


# ---------------------------------------------------------------------------
# El reloj: marco + lienzo
# ---------------------------------------------------------------------------

def reloj(cuerpo: str, *, aro: str = "", tinte: str | None = None,
          fondo: str = "", escala: float = 1.0) -> str:
    """El marco del Apple Watch alrededor del lienzo lógico (208 × 248 pt)."""
    fondo = fondo or (f'color-mix(in srgb,{tinte} {TINTE_MAX}%,{BG})' if tinte else BG)
    marco_w, marco_h = LIENZO_W + 28, LIENZO_H + 28
    return f"""
<div style="width:{marco_w * escala:.1f}px;height:{marco_h * escala:.1f}px;flex:0 0 auto">
 <div style="width:{marco_w}px;height:{marco_h}px;transform:scale({escala});transform-origin:top left;
             padding:14px;box-sizing:border-box;background:#0a0a0b;border-radius:{LIENZO_R + 14}px;
             box-shadow:inset 0 0 0 1.5px rgba(255,255,255,0.16),inset 0 0 0 5px #000,
                        0 24px 60px rgba(0,0,0,0.55);position:relative">
  <div style="position:absolute;right:-4px;top:{marco_h * 0.30:.0f}px;width:7px;height:34px;
              border-radius:4px;background:linear-gradient(90deg,#3a3a3d,#17171a)"></div>
  <div style="position:absolute;right:-3px;top:{marco_h * 0.52:.0f}px;width:5px;height:22px;
              border-radius:3px;background:#26262a"></div>
  <div style="position:relative;width:{LIENZO_W}px;height:{LIENZO_H}px;border-radius:{LIENZO_R}px;
              overflow:hidden;background:{BG}">
   <div style="position:absolute;inset:0;background:{fondo}"></div>
   <div style="position:absolute;inset:0;background:{DEGRADADO}"></div>
   {aro}
   <div style="position:absolute;inset:0;box-sizing:border-box;
               padding:{SAFE_TOP}px {SAFE_SIDE}px {SAFE_BOTTOM}px {SAFE_SIDE}px">
    <div style="height:100%;display:flex;flex-direction:column;align-items:center;
                text-align:center;color:{INK}">{cuerpo}</div>
   </div>
  </div>
 </div>
</div>"""


# ---------------------------------------------------------------------------
# LAS TRES PÁGINAS
# ---------------------------------------------------------------------------
#
# El escenario: rodaje de 10 km, ejecución 145 del atleta 66 (10.000 m a 312 s/km
# = 5:12/km, FC media 150). Reproducción a los 5.240 m, que es el punto que ese
# fichero de datos ya usa. De ahí sale TODO lo que se lee en estas capturas:
#
#   te quedan  10.000 − 5.240 = 4.760 m → 4,76 km
#   tiempo     5,24 km × 312 s/km = 1.635 s → 27:15
#   ritmo      312 s/km → 5:12/km
#   pulso      150 ppm
#   zona       150 / 168 = 0,893 → Z3 (0,89–0,94) «medio»
#
# El umbral de 168 ppm es el único número que NO es una medida de nadie: es el
# escenario `ANCLA_MEDIDA` de datos-reloj.ts, y hace falta para que exista una
# zona. Hoy `max_hr_bpm` es NULL en los 8 atletas y no hay un solo `lthr_bpm`,
# así que el estado real de hoy es el de la hoja de estados: ppm crudos, sin
# zona y sin tinte.

CUBIERTO_M, TOTAL_M = 5_240, 10_000
QUEDA = 1 - CUBIERTO_M / TOTAL_M   # 0,476 del rodaje


ALTO_FILA_DATOS = 24  # altura de cifra de una fila del panel


def pagina_datos(*, con_zona: bool = True, activa: int = 0) -> str:
    """LA SESIÓN — la única página sin sujeto, y eso es lo que es: el panel.

    Cuatro filas de 24 pt de cifra. Medido en el navegador, la página entera ocupa
    195,5 pt de los 212 — y 206,7 en el caso peor, que es cuando además hay que
    escribir al pie que no hay umbral. Cada fila sigue pesando más que su etiqueta (§4).
    """
    filas = [
        ("tiempo", "27:15", "", ""),
        ("distancia", "5,24", "km", ""),
        ("ritmo medio", "5:12", "/km", ""),
        ("pulso", "150", "ppm", "Z3 medio" if con_zona else ""),
    ]
    cuerpo_fila = ALTO_FILA_DATOS / CAP_EM
    html = []
    for etiqueta, valor, unidad, chip in filas:
        ancho = (ancho_en_glifos(valor, unidad) * AVANCE_MONO * cuerpo_fila
                 + max(2.0, 0.07 * cuerpo_fila))
        if chip:
            ancho += ancho_sans(chip, 11.5) + 8
        if ancho > ANCHO_UTIL:
            _fallo(f"la fila «{etiqueta}» mide {ancho:.0f} pt sobre {ANCHO_UTIL}")
        marca = ""
        if chip:
            # El nombre de la zona va en BLANCO, no en el color de la zona: el
            # lienzo ya ES ese color, así que escribirlo encima de sí mismo lo
            # borra (verde sobre verde = 3,9:1 y de la misma tinta). El color lo
            # dice el fondo; la etiqueta dice las palabras.
            marca = (f'<span style="font-family:var(--sans);font-size:11.5px;font-weight:800;'
                     f'letter-spacing:0.3px;color:{INK};margin-left:8px;'
                     f'padding-bottom:2px">{chip}</span>')
        html.append(
            f'<div style="width:100%;display:flex;flex-direction:column;align-items:flex-start">'
            f'{versales(etiqueta)}'
            f'<div style="display:flex;align-items:baseline;margin-top:1px">'
            f'{numeral(valor, unidad, alto=ALTO_FILA_DATOS)}{marca}</div></div>'
        )
    nota = "" if con_zona else versales("sin umbral · no hay zona", arriba=2)
    return (versales("la sesión", tono="rgba(255,255,255,0.85)")
            + f'<div style="flex:1;width:100%;display:flex;flex-direction:column;'
              f'justify-content:space-evenly;padding:2px 0">{"".join(html)}</div>'
            + nota + puntos(3, activa))


def pagina_vivo(*, contexto: str = "rodaje · te quedan", sujeto: str = "4,76",
                unidad: str = "km", ritmo: str = "5:12 /km", nota: str = "",
                juicio: str = "", opacidad: float = 1.0, activa: int = 1) -> str:
    """Lo que FALTA de la pieza que tienes delante. Cero controles: corriendo no se toca.

    El JUICIO ocupa el hueco de la etiqueta, no una tercera línea ni un apéndice
    del valor: sin objetivo la etiqueta dice «ritmo» y con objetivo dice cómo vas.
    Así sigue habiendo un solo segundo nivel — «ritmo 4:10 /km · En objetivo» mide
    195 pt y se recortaba.

    Y el veredicto es una PALABRA, no un color: mientras el lienzo lleve la zona de
    pulso, en esta pantalla no puede hablar en color nada más. Un «en objetivo»
    verde sobre un lienzo verde no se lee, y con la zona en ámbar o en rojo el
    mismo verde diría dos cosas a la vez.
    """
    alto = alto_sujeto(sujeto, unidad, segundo=bool(ritmo), nota=bool(nota), puntos=True)
    seg = ""
    if ritmo:
        seg = segundo_nivel(ritmo, etiqueta=juicio or "ritmo", color=INK,
                            tono_etiqueta=INK if juicio else DIM, opacidad=opacidad)
    return (versales(contexto, tono="rgba(255,255,255,0.85)")
            + '<span style="flex:1"></span>'
            + numeral(sujeto, unidad, alto=alto, opacidad=opacidad)
            + '<span style="flex:1"></span>' + seg
            + (versales(nota, arriba=3) if nota else "")
            + puntos(3, activa))


def _boton(texto: str, *, alto: int, fondo: str, color: str, borde: str = "") -> str:
    return (f'<div style="width:100%;height:{alto}px;border-radius:18px;background:{fondo};'
            f'{borde}display:flex;align-items:center;justify-content:center;box-sizing:border-box">'
            f'<span style="font-family:var(--sans);font-size:15px;font-weight:800;color:{color};'
            f'letter-spacing:0.2px">{texto}</span></div>')


def pagina_controles(*, pausado: bool = False, activa: int = 2) -> str:
    """La única página con botones: es la única a la que se llega para tocar."""
    altos = (60, 52, 46)
    if sum(altos) + 16 > ALTO_UTIL - FILA["contexto"] - FILA["puntos"]:
        _fallo(f"los tres botones piden {sum(altos) + 16} pt y hay "
               f"{ALTO_UTIL - FILA['contexto'] - FILA['puntos']}")
    botones = [
        _boton("Reanudar" if pausado else "Pausar", alto=altos[0], fondo=ORANGE, color="#160800"),
        _boton("Nuevo tramo", alto=altos[1], fondo=SURFACE_RAISED, color=INK),
        # Los tres botones son OPACOS. El rojo traslúcido de la primera versión
        # (14 % sobre negro) dejaba pasar el lienzo: sobre la zona en verde el
        # botón salía oliva y su texto rojo se quedaba en 1,32:1. Estos dos hexes
        # son exactamente lo que aquel traslúcido daba sobre negro, así que el
        # botón se ve igual que antes y ahora no depende de la zona.
        _boton("Terminar", alto=altos[2], fondo="#240B0B", color=ZONE_RED,
               borde="box-shadow:inset 0 0 0 1.5px #732323;"),
    ]
    return (versales("en pausa · 27:15" if pausado else "rodaje · 27:15",
                     tono="rgba(255,255,255,0.85)")
            + f'<div style="flex:1;width:100%;display:flex;flex-direction:column;'
              f'justify-content:center;gap:8px">{"".join(botones)}</div>'
            + puntos(3, activa))


def pagina_confirmar() -> str:
    """¿Terminar y guardar? — la misma pregunta que ya hace la app hoy."""
    return (versales("rodaje · 27:15", tono="rgba(255,255,255,0.85)")
            + '<span style="flex:1"></span>'
            + '<div style="font-family:var(--sans);font-size:17px;font-weight:800;line-height:1.15;'
              'padding:0 4px">¿Terminar<br/>y guardar?</div>'
            + '<span style="flex:1"></span>'
            + f'<div style="width:100%;display:flex;flex-direction:column;gap:8px">'
              f'{_boton("Terminar", alto=48, fondo=ZONE_RED, color="#2A0000")}'
              f'{_boton("Seguir", alto=44, fondo=SURFACE_RAISED, color=INK)}</div>'
            + '<span style="height:6px"></span>')


def pagina_recupera() -> str:
    """El descanso es el ÚNICO momento de una carrera con mando: aquí sí se anuncia."""
    alto = alto_sujeto("1:12", segundo=True, accion=True, puntos=True)
    return (versales("recupera · viene la 4", tono="rgba(255,255,255,0.85)")
            + '<span style="flex:1"></span>'
            + numeral("1:12", alto=alto, color=ZONE_GREEN)
            + '<span style="flex:1"></span>'
            + segundo_nivel("1200 m", etiqueta="luego")
            + versales("toca · empezar ya", tono=INK, arriba=4)
            + puntos(3, 1))


# ---------------------------------------------------------------------------
# Cromo de las láminas
# ---------------------------------------------------------------------------

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
:root{--sans:'Inter','Liberation Sans',sans-serif;--mono:'JetBrains Mono','DejaVu Sans Mono',monospace}
body{background:#08080a;font-family:var(--sans);color:#e9e9ec;-webkit-font-smoothing:antialiased}
.h1{font-size:30px;font-weight:900;font-style:italic;letter-spacing:-0.4px;color:#fff}
.sub{font-size:15px;line-height:1.45;color:#9a9aa2;max-width:900px}
.cap{font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#F06A2A}
.pg{font-size:13px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#fff}
.txt{font-size:13px;line-height:1.5;color:#9a9aa2}
.pie{font-size:12px;line-height:1.6;color:#77777f;max-width:1040px}
.gesto{font-size:12px;font-weight:700;letter-spacing:0.6px;color:#5c5c64;white-space:nowrap}
.regla{border-left:3px solid #F06A2A;padding-left:14px;font-size:15px;line-height:1.5;color:#d8d8de;max-width:900px}
b{color:#e9e9ec}
.nota{font-size:12px;line-height:1.55;color:#8a8a92}
"""


def documento(cuerpo: str, ancho: int) -> str:
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>'
            f'<body><div style="width:{ancho}px;padding:34px 34px 30px">{cuerpo}</div></body></html>')


def render(html: str, salida: str, ancho: int, alto: int, escala: int = 3) -> None:
    chrome = shutil.which("google-chrome") or shutil.which("chromium")
    if not chrome:
        sys.exit("falta google-chrome en el PATH")
    if os.path.exists(salida):
        os.remove(salida)
    with tempfile.TemporaryDirectory() as tmp:
        pagina = os.path.join(tmp, "m.html")
        with open(pagina, "w", encoding="utf-8") as f:
            f.write(html)
        # Chrome escribe el PNG y NO sale (headless en este contenedor se queda
        # colgado con el bus de D-Bus caído). Así que no se le espera: se espera
        # al FICHERO, que es lo único que importa, y luego se le mata.
        proc = subprocess.Popen(
            [chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
             "--disable-dev-shm-usage", "--hide-scrollbars", "--virtual-time-budget=1500",
             f"--force-device-scale-factor={escala}", f"--window-size={ancho},{alto}",
             f"--screenshot={salida}", f"--user-data-dir={tmp}/prof", f"file://{pagina}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        estable, tamano = 0, -1
        for _ in range(300):  # 30 s
            time.sleep(0.1)
            actual = os.path.getsize(salida) if os.path.exists(salida) else -1
            estable = estable + 1 if actual == tamano and actual > 0 else 0
            tamano = actual
            if estable >= 5:
                break
        proc.kill()
        proc.wait(timeout=10)
    if not os.path.exists(salida):
        sys.exit(f"chrome no escribió {salida}")
    print(f"  ✓ {salida}  ({os.path.getsize(salida) // 1024} kB)")


# ---------------------------------------------------------------------------
# Las cinco láminas
# ---------------------------------------------------------------------------

ARO_RODAJE = aro_continuo(QUEDA)


def tira_zonas() -> str:
    """Las cinco zonas con el relleno de verdad, para poder juzgar de un vistazo.

    Está aquí porque el criterio de la card es que Z2/Z3/Z4 se distingan corriendo,
    y las láminas enseñan sólo la Z3 del escenario: sin la tira no hay forma de
    comprobarlo. Es una leyenda, no una pantalla.
    """
    zonas = [(1, "#8A8A8E", "muy suave"), (2, "#2A6CFF", "suave"), (3, ZONE_GREEN, "medio"),
             (4, "#FFB340", "fuerte"), (5, ZONE_RED, "máximo")]
    chips = []
    for n, hue, nombre in zonas:
        relleno = f"color-mix(in srgb,{hue} {TINTE_MAX}%,{BG})"
        chips.append(
            f'<div style="width:108px">'
            f'<div style="height:52px;border-radius:14px;background:{relleno};'
            f'display:flex;align-items:center;justify-content:center;gap:7px">'
            f'<span style="font-family:var(--mono);font-size:19px;font-weight:800;color:#fff">'
            f'Z{n}</span>'
            f'<span style="width:16px;height:3px;border-radius:2px;background:{ORANGE_SOFT}"></span>'
            f'</div>'
            f'<div class="gesto" style="margin-top:5px;text-align:center">{nombre}</div></div>'
        )
    return (f'<div style="display:flex;align-items:flex-start;gap:10px">{"".join(chips)}</div>')


def lamina_hoja() -> tuple[str, int, int]:
    esc = 1.5
    cols = []
    for nombre, pagina, linea in [
        ("Datos", pagina_datos(activa=0),
         "La sesión entera, cuatro cifras de un vistazo. Es la única página sin sujeto, "
         "y eso <b>es</b> lo que es: el panel al que se va a buscar un número."),
        ("Vivo · por defecto", pagina_vivo(),
         "Lo que <b>falta</b> de la pieza que tienes delante, en la unidad en que esa pieza "
         "se mide. Ni un control: corriendo no se toca."),
        ("Controles", pagina_controles(),
         "La única página con botones, porque es la única a la que se llega habiendo "
         "decidido dejar de mirar y tocar."),
    ]:
        cols.append(
            f'<div style="width:{(LIENZO_W + 28) * esc:.0f}px;display:flex;flex-direction:column;'
            f'align-items:center;gap:12px">'
            f'{reloj(pagina, aro=ARO_RODAJE, tinte=ZONE_GREEN, escala=esc)}'
            f'<div class="pg">{nombre}</div>'
            f'<div class="txt" style="text-align:center">{linea}</div></div>'
        )
    flecha = (f'<div style="display:flex;align-items:center;'
              f'height:{(LIENZO_H + 28) * esc:.0f}px"><div class="gesto">◀ desliza ▶</div></div>')
    return (documento(f"""
<div class="cap">Card 105 · propuesta de diseño</div>
<div class="h1" style="margin-top:8px">Correr, en la muñeca</div>
<div class="sub" style="margin-top:10px">
 Una sola interfaz de tres páginas, del mismo corte que la app de Entreno del Apple Watch:
 se desliza en horizontal y <b>el vivo es el centro</b>, así que ni los datos ni los controles
 están nunca a más de un gesto — y volver al esfuerzo tampoco.
</div>
<div class="regla" style="margin-top:18px">
 El sujeto es <b>lo que falta</b> de la pieza que tienes delante, medido en la unidad en que
 esa pieza se mide. Si no falta nada medible, el sujeto cae al reloj de esa pieza.
</div>
<div style="margin-top:26px;display:flex;align-items:flex-start;gap:22px">
 {cols[0]}{flecha}{cols[1]}{flecha}{cols[2]}
</div>
<div style="margin-top:26px;display:flex;gap:34px;align-items:flex-start">
 <div>{tira_zonas()}</div>
 <div class="pie" style="max-width:640px">
  <b>El relleno es la zona, plano y al 45 %.</b> El tope no es de gusto: lo pone el ámbar de la
  Z4, porque el aro naranja tiene que mantener 3:1 contra el lienzo y ahí se queda en 3,09
  (al 55 % cae a 2,30 y el aro desaparece). Con ese mismo 45 % el numeral blanco va de 7,9:1
  sobre el verde a 12,3:1 sobre el azul. Del degradado de antes queda una <b>viñeta</b>: negro
  en las esquinas, donde la curva del bisel se come el lienzo, y en las dos bandas de versales.
  <br/><br/>
  Y mientras el lienzo lleve la zona, <b>en esta pantalla no habla en color nada más</b>: el
  veredicto del ritmo es una palabra, porque un «en objetivo» verde sobre un lienzo verde no se
  lee y sobre uno ámbar diría dos cosas a la vez.
 </div>
</div>
<div class="pie" style="margin-top:22px">
 <b>De dónde salen los números.</b> Rodaje de 10 km a los 5.240 m: ejecución 145 del atleta 66
 (10.000 m a 5:12/km, FC media 150 ppm). El tiempo y los metros que faltan se derivan de ahí.
 <b>La zona es la única excepción</b>, y va marcada: sale de un umbral <i>medido</i> de 168 ppm
 (150 / 168 = 0,89 → Z3), y hoy no lo tiene ningún atleta — <code>max_hr_bpm</code> es NULL en
 los 8 y no existe un solo <code>lthr_bpm</code>. Sin umbral no hay zona y el lienzo no se tiñe:
 esa es la página de datos de hoy, y está en la lámina de estados.
 <br/><br/>
 <b>El aro</b> del bisel es lo que queda del rodaje; cuesta cero altura de contenido.
 Lienzo real 208 × 248 pt, útil 188 × 212 — las medidas de estas capturas salen de las mismas
 constantes que hace cumplir <code>kit-watch/modelo.ts</code>, no del ojo.
</div>""", 1420), 1420, 1090)


def lamina_pagina(titulo: str, bajada: str, pagina: str, notas: list[tuple[str, str]],
                  *, tinte: str | None = ZONE_GREEN, aro: str = "") -> tuple[str, int, int]:
    filas = "".join(
        f'<div style="display:flex;gap:12px;align-items:baseline;margin-top:12px">'
        f'<div class="cap" style="min-width:132px;color:#F06A2A">{k}</div>'
        f'<div class="txt" style="flex:1">{v}</div></div>'
        for k, v in notas
    )
    return (documento(f"""
<div class="cap">Card 105 · correr en la muñeca</div>
<div class="h1" style="margin-top:8px">{titulo}</div>
<div class="sub" style="margin-top:10px">{bajada}</div>
<div style="margin-top:22px;display:flex;gap:44px;align-items:flex-start">
 {reloj(pagina, aro=aro or ARO_RODAJE, tinte=tinte, escala=2.0)}
 <div style="flex:1;padding-top:2px">{filas}</div>
</div>""", 1180), 1180, 800)


def lamina_estados() -> tuple[str, int, int]:
    esc = 1.25
    marcos = [
        ("Sin señal", pagina_vivo(contexto="rodaje · llevas", sujeto="0:48", unidad="",
                                  ritmo="", nota="sin señal · buscando"),
         "El GPS no ha fijado: no hay metros ni ritmo que pintar, así que el sujeto cae al reloj "
         "de la pieza. No se inventa un ritmo ni se pinta un cero que parezca dato.",
         ZONE_GREEN, "", aro_vacio()),
        ("Sin umbral — <b>el estado de hoy</b>", pagina_datos(con_zona=False, activa=0),
         "Ningún atleta tiene umbral medido, así que no hay zona: el pulso va en ppm crudos, "
         "lo dice al pie y <b>el lienzo no se tiñe</b>. El color es un dato.",
         None, "", ARO_RODAJE),
        ("En pausa", pagina_vivo(opacidad=0.42, contexto="en pausa · te quedan"),
         "El dato no desaparece, se apaga: sigues sabiendo dónde lo dejaste. El aro se queda "
         "donde estaba y los controles de al lado ofrecen «Reanudar».",
         ZONE_GREEN, "", ARO_RODAJE),
        ("Terminar, confirmado", pagina_confirmar(),
         "Terminar es la única acción destructiva de la interfaz y va abajo, en rojo y "
         "confirmada — con la misma pregunta que ya hace la app.",
         ZONE_GREEN, "", ARO_RODAJE),
        ("La misma interfaz con serie prescrita", pagina_vivo(
            contexto="serie 3 de 5 · te quedan", sujeto="500", unidad="m",
            ritmo="4:10 /km", juicio="en objetivo"),
         "Cuando el coach escribe la estructura, cambia el <b>contenido</b>, no la interfaz: "
         "el bisel se trocea en las 5 series, el sujeto son los metros que faltan de esta y la "
         "etiqueta del ritmo pasa a decir cómo vas contra el suyo. Y <b>«Nuevo tramo» "
         "desaparece</b> de los controles: el corte ya lo escribió el coach.",
         ZONE_GREEN, "", aro_segmentado(5, 2, 700 / 1200)),
        ("Recupera", pagina_recupera(),
         "El descanso es el único tramo de una carrera en el que se puede mirar y tocar: es "
         "aquí, y sólo aquí, donde el vivo anuncia un gesto. El aro sigue siendo naranja "
         "—el aro es la estructura— y el fondo es el único apagado de la interfaz en marcha: "
         "en el descanso la zona deja de mandar. Es <code>restBg</code>, no un tinte de zona.",
         None, REST_BG, aro_continuo(72 / 90)),
    ]
    celdas = "".join(
        f'<div style="width:{(LIENZO_W + 28) * esc + 30:.0f}px">'
        f'{reloj(p, aro=aro, tinte=t, fondo=f, escala=esc)}'
        f'<div class="pg" style="margin-top:12px">{n}</div>'
        f'<div class="nota" style="margin-top:6px">{d}</div></div>'
        for n, p, d, t, f, aro in marcos
    )
    return (documento(f"""
<div class="cap">Card 105 · correr en la muñeca</div>
<div class="h1" style="margin-top:8px">Los estados de las tres páginas</div>
<div class="sub" style="margin-top:10px">
 La interfaz no cambia: cambia lo que hay que decir. Se diseña primero para el caso mínimo —
 sin umbral, sin señal, sin nada — porque es el que ve todo el mundo el primer día.
</div>
<div style="margin-top:26px;display:flex;flex-wrap:wrap;gap:36px 44px">{celdas}</div>""", 1250),
        1250, 1215)


def main() -> None:
    raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    laminas = [
        ("reloj-correr.png", lamina_hoja(), 2),
        ("reloj-correr-vivo.png", lamina_pagina(
            "La página del esfuerzo",
            "El centro de la interfaz y la que está puesta mientras corres. Un solo número, "
            "a sangre, y una sola línea debajo.",
            pagina_vivo(),
            [("El sujeto", "<b>4,76 km</b> es lo que falta del rodaje, no lo que llevas. "
                           "La ambigüedad entre cubierto y restante ya se pagó una vez: por eso "
                           "la banda de arriba lo dice con palabras. Y lleva los dos decimales "
                           "de la medida, no uno: 5,24 + 4,76 = 10,00, y si el que falta "
                           "redondeara, la suma dejaría de dar."),
             ("Segundo nivel", "El ritmo, y no hay tercero. Es lo único que un corredor puede "
                               "accionar en marcha; el resto está a un gesto."),
             ("Cero controles", "Corriendo no se toca: el reloj no pide nada. La pantalla sigue "
                                "siendo un blanco entero para el gesto latente, pero no se gasta "
                                "una línea en anunciarlo — y esos 15 pt vuelven al número."),
             ("El aro", "Lo que queda del rodaje, trazado sobre el borde. Es el sitio más barato "
                        "del reloj: ahí no cabe texto."),
             ("El relleno", "Tu zona de pulso <b>es</b> el lienzo: relleno plano al 45 %, no un "
                            "degradado que se va a negro. Del negro queda una viñeta en las "
                            "esquinas y en las bandas de versales. Sin umbral no hay relleno y el "
                            "fondo es negro de verdad — las dos cosas, en la lámina de "
                            "estados.")]), 3),
        ("reloj-correr-datos.png", lamina_pagina(
            "La página de los datos",
            "Cuatro cifras de la sesión de un vistazo: es la respuesta a «¿cómo va la carrera?», "
            "que no es la misma pregunta que «¿cuánto me falta?».",
            pagina_datos(),
            [("Su alcance", "Todo lo de aquí es <b>de la sesión</b>, y lo dice arriba. La página "
                            "del vivo habla de la <i>pieza</i>: dos páginas, dos alcances, cada "
                            "uno declarado. Un tiempo restante junto a una distancia cubierta en "
                            "la misma caja ya confundió a un atleta de verdad."),
             ("Sin sujeto", "Es la única página de la interfaz sin un número que gobierne, y eso "
                            "es su definición. Una página que intenta ser panel y sujeto a la vez "
                            "es la «letra pequeña alrededor» que hay que quitar."),
             ("La zona", "No es una fila aparte: es lo que <i>significa</i> tu pulso, así que va "
                         "con él y con su color. Sin umbral medido no existe — y hoy no lo tiene "
                         "nadie: ver la lámina de estados."),
             ("El precio", "Cuatro cifras en una página bajan cada número de ~70 pt a 24 pt "
                           "(≈3,5 mm de alto). Se lee de un vistazo con el brazo levantado, no a "
                           "tres metros: para eso está la página de al lado. El doble ya había "
                           "resuelto esto partiéndolo en cuatro páginas de un dato cada una; "
                           "esta es la otra respuesta, y es la que pide la card.")]), 3),
        ("reloj-correr-controles.png", lamina_pagina(
            "La página de los controles",
            "Pausar, nuevo tramo y terminar. Es la única página con botones de la interfaz.",
            pagina_controles(),
            [("Por qué aquí", "Se llega habiendo decidido dejar de mirar y tocar. En las otras dos "
                              "un botón le quitaría 52 pt al dato — el 21 % del lienzo — para "
                              "ofrecer algo que corriendo no se usa."),
             ("Pausar", "La más frecuente y la más urgente: arriba, la más grande y en el naranja "
                        "de la acción. Al volver dice «Reanudar»."),
             ("Nuevo tramo", "<b>Es lo que no existe todavía.</b> Cierra lo que llevas medido y "
                             "empieza de cero, sin tocar la prescripción: produce un parcial con "
                             "sus metros, su tiempo y su ritmo. Sólo aparece cuando los cortes son "
                             "del atleta; si el coach escribió la estructura, el corte ya está "
                             "escrito y el botón no está."),
             ("Terminar", "Abajo, en rojo y confirmada: es la única destructiva. Un desliz de más "
                          "no puede acabar una carrera."),
             ("El reloj no se va", "La banda de arriba mantiene el crono de la sesión: se decide "
                                   "sin perder de vista la carrera."),
             ("El cuarto botón", "Si la sesión tiene bloque siguiente, aquí aparece «Siguiente "
                                 "bloque» —&nbsp;que ya existe hoy&nbsp;— y la página rueda con "
                                 "la corona: es la única de la interfaz donde eso vale, porque a "
                                 "esta se llega parado. Y por lo mismo <b>el mapa de bloques deja "
                                 "de ser una página del vivo</b>: saltar de bloque es una "
                                 "decisión, y las decisiones viven aquí.")]), 3),
        ("reloj-correr-estados.png", lamina_estados(), 2),
    ]
    for nombre, (html, w, h), escala in laminas:
        render(html, os.path.abspath(os.path.join(raiz, nombre)), w, h, escala)
    if FALLOS:
        sys.exit(f"\n{len(FALLOS)} medida(s) fuera del lienzo — arréglalas antes de entregar")
    print("\nlas cinco láminas caben en la muñeca")


if __name__ == "__main__":
    main()

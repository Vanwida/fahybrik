#!/usr/bin/env python3
"""
Build weeks 6,7,8,9 (macrociclo TRANSFORMACIÓN, base/balanced profile) of the
HYROX 12-week plan into the FAHYBRIK DB, copying the week-1 build pattern
(program_week_templates 51 + templates 76-81 + template_segments) exactly, with
the unified prescription model (@fahybrid/shared/domain/prescription).

Source: docs/Plantilla_HYROX_12sem (1) 2.xlsx — sheets Semana 6-9 (base only).
Zero free text in prescription_json. CAPA1 -> coach_notes; CAPA2 -> segments.

Idempotent: deletes prior rows for these week names / exercise slugs before insert.
No git commit. Run: python3 infra/scripts/build_weeks_6_9_transformacion.py
"""
import json, os, re, subprocess

COACH_ID = 4
SRC = "Plantilla_HYROX_12sem"

# ── pace helpers ─────────────────────────────────────────────────────────────
def kmh_to_s_per_km(kmh): return round(3600.0 / kmh, 2)
def mmss(m, s=0): return m * 60 + s

# ── exercise slugs already in catalog (REUSE — check-before-create) ──────────
EX = {
    "run": "run", "walk": "walk", "row": "row", "ski": "ski-erg",
    "bike": "bike-erg", "ab": "assault-bike", "back_squat": "back-squat",
    "front_squat": "front-squat", "bench": "bench-press", "ohp": "overhead-press",
    "power_clean": "power-clean", "box_jump": "box-jump", "depth_jump": "depth-jump",
    "burpee": "burpee", "bbj": "hyrox-burpee-broad-jump", "sled_push": "hyrox-sled-push",
    "sled_pull": "hyrox-sled-pull", "sled_drag": "sled-drag-backwards",
    "farmer": "hyrox-farmer-carry", "sb_lunge": "hyrox-sandbag-lunges",
    "walking_lunge": "walking-lunge", "reverse_lunge": "reverse-lunge",
    "wall_ball": "hyrox-wall-balls", "situp": "sit-up", "hip_mob": "mobility-hip-flow-15min",
    "foam": "foam-roll-lower-15min", "run_drills": "run-technique-drills",
    # new (created below) — deterministic w6..w9 slugs + needs-review source
    "high_box": "w6-high-box-jump", "situp_shoot": "w6-sit-up-shoot",
    "breathing": "w6-breathing-work", "prehab_prev": "w7-prehab-preventatives",
    "burpee_plate": "w9-burpee-to-plate",
}

NEW_EXERCISES = [
    # slug, name, category, equipment[], source(week)-tagged needs-review
    ("w6-high-box-jump", "High Box Jump", "plyometric", ["box"],
     "Maximal-height box jump for reactive power. Distinct from standard Box Jump (sub-maximal).", "w6"),
    ("w6-sit-up-shoot", "Sit-up Shoot", "core", ["wall_ball"],
     "Sit-up with explosive overhead ball/plate shoot at the top. HYROX core conditioning.", "w6"),
    ("w6-breathing-work", "Breathing Work", "mobility", [],
     "Diaphragmatic / respiratory recovery work. Down-regulation and CO2 tolerance.", "w6"),
    ("w7-prehab-preventatives", "Prehab / Preventatives", "mobility", ["band"],
     "Injury-prevention circuit: banded prehab, eccentric loading, stability. Pairs with plyo days.", "w7"),
    ("w9-burpee-to-plate", "Burpee to Plate", "plyometric", ["plate"],
     "Burpee with jump onto/over a bumper plate. Used as inter-set conditioning filler.", "w9"),
]

# ── prescription_json builders (unified model) ───────────────────────────────
def p_steady(total_s=None, target=None, modality=None, note=None):
    p = {"scheme": "steady"}
    if total_s is not None: p["total_s"] = total_s
    if target: p["target"] = target
    if modality: p["modality"] = modality
    if note: p["note"] = note
    return p

def p_interval(rounds=None, work_s=None, rest_s=None, target=None, modality=None):
    p = {"scheme": "interval"}
    if rounds is not None: p["rounds"] = rounds
    if work_s is not None: p["work_s"] = work_s
    if rest_s is not None: p["rest_s"] = rest_s
    if target: p["target"] = target
    if modality: p["modality"] = modality
    return p

def p_sets(sets, modality=None):
    p = {"scheme": "sets", "sets": sets}
    if modality: p["modality"] = modality
    return p

def p_rounds(rounds, sets=None, modality=None, target=None):
    p = {"scheme": "rounds", "rounds": rounds}
    if sets: p["sets"] = sets
    if target: p["target"] = target
    if modality: p["modality"] = modality
    return p

def p_emom(rounds, work_s=None, rest_s=None, modality=None):
    p = {"scheme": "emom", "rounds": rounds}
    if work_s is not None: p["work_s"] = work_s
    if rest_s is not None: p["rest_s"] = rest_s
    if modality: p["modality"] = modality
    return p

def p_amrap(total_s=None, modality=None):
    p = {"scheme": "amrap"}
    if total_s is not None: p["total_s"] = total_s
    if modality: p["modality"] = modality
    return p

# target builders
def t_pct(v=None, mn=None, mx=None):
    t = {"kind": "percent_rm"}
    if v is not None: t["value"] = v
    if mn is not None: t["min"] = mn
    if mx is not None: t["max"] = mx
    return t
def t_kg(v): return {"kind": "kg", "value": v}
def t_rpe(v=None, mn=None, mx=None):
    t = {"kind": "rpe"}
    if v is not None: t["value"] = v
    if mn is not None: t["min"] = mn
    if mx is not None: t["max"] = mx
    return t
def t_zone(v=None, mn=None, mx=None):
    t = {"kind": "hr_zone"}
    if v is not None: t["value"] = v
    if mn is not None: t["min"] = mn
    if mx is not None: t["max"] = mx
    return t
def t_pace_km(v=None, mn=None, mx=None):
    t = {"kind": "pace", "unit": "per_km"}
    if v is not None: t["value_s"] = v
    if mn is not None: t["min_s"] = mn
    if mx is not None: t["max_s"] = mx
    return t
def t_pace_500(v): return {"kind": "pace", "unit": "per_500m", "value_s": v}
def t_bw(): return {"kind": "bodyweight"}
def t_cal(v): return {"kind": "calories", "value": v}

# set builders (per-set measure+target)
def s_reps(n, target=None, rest_s=None, tempo=None, modality=None, note=None):
    d = {"measure": {"kind": "reps", "value": n}}
    if target: d["target"] = target
    if rest_s is not None: d["rest_s"] = rest_s
    if tempo: d["tempo"] = tempo
    if modality: d["modality"] = modality
    if note: d["note"] = note
    return d
def s_dist(m, target=None, rest_s=None, modality=None, note=None):
    d = {"measure": {"kind": "distance", "meters": m}}
    if target: d["target"] = target
    if rest_s is not None: d["rest_s"] = rest_s
    if modality: d["modality"] = modality
    if note: d["note"] = note
    return d
def s_dur(sec, target=None, rest_s=None, modality=None, note=None):
    d = {"measure": {"kind": "duration", "seconds": sec}}
    if target: d["target"] = target
    if rest_s is not None: d["rest_s"] = rest_s
    if modality: d["modality"] = modality
    if note: d["note"] = note
    return d
def s_cal(n, target=None, rest_s=None, modality=None, note=None):
    d = {"measure": {"kind": "calories", "value": n}}
    if target: d["target"] = target
    if rest_s is not None: d["rest_s"] = rest_s
    if modality: d["modality"] = modality
    if note: d["note"] = note
    return d

# ── SEGMENT spec helper ──────────────────────────────────────────────────────
def seg(ex_key, block_pos, block_format, block_title, notes, presc, params=None):
    return {
        "ex": ex_key, "block_position": block_pos, "block_format": block_format,
        "block_title": block_title, "notes": notes, "presc": presc,
        "params": params or {},
    }

# Common pace refs (W9 gives explicit km/h)
PACE_17 = kmh_to_s_per_km(17)   # 211.76 s/km — threshold ref
PACE_11 = kmh_to_s_per_km(11)   # 327.27 s/km — recovery jog
PACE_350 = mmss(3, 50)          # 230 s/km — WOD run pace W9

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  WEEK DEFINITIONS                                                          ║
# ╚══════════════════════════════════════════════════════════════════════════╝
WEEKS = {}

# ───────────────────────────── SEMANA 6 — Carga ─────────────────────────────
WEEKS[6] = {
    "pwt_name": "Semana 6 — Transformación",
    "atr": "TRANS",
    "micro": "Carga (entra trabajo específico)",
    "focus": ("Microciclo de Carga del macrociclo ATR TRANSFORMACIÓN — entra el trabajo "
              "específico HYROX. Lunes media-simulación HYROX a intensidad (ritmos del test 30'); "
              "martes intervalos mixtos run+ergo+estaciones (densidad); miércoles EMOM largo "
              "específico (transiciones); jueves descanso; viernes series medias a ritmo objetivo "
              "(5×800m); sábado fuerza-potencia + ergómetro; domingo bike Z1 regenerativo."),
    "coach_notes_week": ("Semana 6 importada de Plantilla_HYROX_12sem (Transformación). Más "
                         "intensidad, menos volumen; entra específico HYROX. Capa 1 en coach_notes "
                         "de cada template; capa 2 (sesión Pablo, RPE/%RM/ritmos) en los segmentos."),
    "days": [
        # ── LUNES — Half simulation ──
        {"day": "monday", "dow": 1, "mg": 7, "format": "hyrox_sim",
         "name": "Media simulación HYROX a intensidad",
         "warmup": "Activación específica + movilidad pre-simulación",
         "cooldown": "Movilidad y vuelta a la calma",
         "capa1": ("CAPA1 — Simulación parcial DEKA/HYROX a intensidad (estímulo específico). "
                   "Foco en técnica de transición y ritmo de carrera objetivo. Usar ritmos de "
                   "competición del test 30'."),
         "meta": {"maps_to_block": "g7-half-simulation", "uses_result": "ritmo_umbral_30min"},
         "segs": [
            seg("run", 0, "simulation", "Half simulation",
                "Formato HYROX reducido a intensidad alta — técnica de transición, ritmo objetivo de carrera (ref. test 30').",
                p_steady(target=t_rpe(mn=8, mx=9), modality="run"),
                {"effort": "high"}),
         ]},
        # ── MARTES — Intervalos mixtos ──
        {"day": "tuesday", "dow": 2, "mg": 6, "format": "intervals",
         "name": "Intervalos mixtos run+ergo+estaciones",
         "warmup": "10' easy run + movilidad",
         "cooldown": "5' easy + movilidad",
         "capa1": ("CAPA1 — Intervalos mixtos run+ergo+estaciones (densidad). Mucha intensidad por ronda."),
         "meta": {"maps_to_block": "g6-intervalos-mixtos-densidad"},
         "segs": [
            seg("run", 0, "intervals", "Bloque 1 · run + burpee DB",
                "2 rounds: 250m run + 40\" max weighted burpee DB 20kg.",
                p_rounds(2, sets=[
                    s_dist(250, target=t_rpe(v=8), modality="run"),
                    s_dur(40, target=t_kg(20), modality="functional", note="max weighted burpee DB 20kg"),
                ], modality="functional"),
                {"sets": 2}),
            seg("reverse_lunge", 1, "intervals", "Bloque 2 · lunge + row",
                "2 rounds: 10 reverse lunge SB 20kg + 30\" row.",
                p_rounds(2, sets=[
                    s_reps(10, target=t_kg(20), modality="functional", note="reverse lunge sandbag 20kg"),
                    s_dur(30, target=t_zone(v=3), modality="row"),
                ], modality="functional"),
                {"sets": 2, "reps": 10}),
            seg("run", 2, "intervals", "Bloque 3 · run + AB",
                "2 rounds: 250m run + 1' AB Z3.",
                p_rounds(2, sets=[
                    s_dist(250, target=t_rpe(v=8), modality="run"),
                    s_dur(60, target=t_zone(v=3), modality="bike", note="Assault Bike Z3"),
                ], modality="run"),
                {"sets": 2}),
         ]},
        # ── MIÉRCOLES — EMOM 16 específico ──
        {"day": "wednesday", "dow": 3, "mg": 7, "format": "emom",
         "name": "EMOM 16' específico HYROX",
         "warmup": "Movilidad + activación transiciones",
         "cooldown": "Movilidad",
         "capa1": ("CAPA1 — EMOM largo específico HYROX (transiciones). EMOM 16' rotando estaciones "
                   "+ bloque 2 run + sit-up shoot + sled pull/drag."),
         "meta": {"maps_to_block": "g7-emom-16-especifico"},
         "segs": [
            seg("run", 0, "emom", "EMOM 16' (8 estaciones x2)",
                "EMOM 16': 1.100m run 2.30\" ski 3.100m run 4.farmer carry DB 17,5kg 5.100m run 6.30\" ski 7.100m run 8.rest.",
                p_emom(16, work_s=60, modality="functional"),
                {"rounds": 16, "time_seconds": 60}),
            seg("ski", 0, "emom", "EMOM 16' (8 estaciones x2)",
                "Min 2 y 6: 30\" ski.",
                p_emom(2, work_s=30, modality="ski"),
                {"time_seconds": 30}),
            seg("farmer", 0, "emom", "EMOM 16' (8 estaciones x2)",
                "Min 4: farmer carry DB 17,5kg.",
                p_emom(2, work_s=60, modality="functional"),
                {"time_seconds": 60}),
            seg("situp_shoot", 1, "intervals", "Bloque 2 · run + sit-up shoot + sled",
                "Bloque 2: run + sit-up shoot + sled pull/drag (transiciones).",
                p_amrap(modality="functional"),
                {}),
            seg("sled_pull", 1, "intervals", "Bloque 2 · run + sit-up shoot + sled",
                "Sled pull/drag dentro del bloque 2 de transiciones.",
                p_amrap(modality="strength"),
                {}),
         ]},
        # JUEVES — rest (no template)
        # ── VIERNES — Series medias ──
        {"day": "friday", "dow": 5, "mg": 4, "format": "intervals",
         "name": "Series medias a ritmo objetivo · 5×800m",
         "warmup": "4k easy run + 5 strides 30\"",
         "cooldown": "1km cool down",
         "capa1": ("CAPA1 — Carrera de calidad: series medias a ritmo objetivo HYROX (5×800m / 90\" rest)."),
         "meta": {"maps_to_block": "g4-series-medias-800", "uses_result": "ritmo_umbral_30min"},
         "segs": [
            seg("run", 0, "tempo", "Calentamiento",
                "4k easy run.", p_steady(target=t_rpe(v=4), modality="run"),
                {"distance_meters": 4000}),
            seg("run", 0, "intervals", "Calentamiento",
                "5 strides 30\".", p_interval(rounds=5, work_s=30, modality="run"),
                {"rounds": 5, "time_seconds": 30}),
            seg("run", 1, "intervals", "Series · 5×800m",
                "5×800m a ritmo objetivo HYROX / 90\" rest. (Ritmo objetivo derivado del test 30'; sin número literal en plan.)",
                p_interval(rounds=5, rest_s=90, modality="run",
                           target=t_rpe(mn=8, mx=9)),
                {"rounds": 5, "rest_seconds": 90, "distance_meters": 800}),
            seg("run", 2, "tempo", "Vuelta a la calma",
                "1km cool down.", p_steady(target=t_rpe(v=3), modality="run"),
                {"distance_meters": 1000}),
         ]},
        # ── SÁBADO — Fuerza-potencia + ergómetro ──
        {"day": "saturday", "dow": 6, "mg": 2, "format": "strength_block",
         "name": "Fuerza-potencia + SkiErg + Core",
         "warmup": "Movilidad + activación + técnica clean ligera",
         "cooldown": "Movilidad",
         "capa1": ("CAPA1 — Fuerza-potencia + ergómetro. Power clean + high box jump por rondas, "
                   "skierg 3×3' RPE8, core."),
         "meta": {"maps_to_block": ["g2-power-clean-high-box", "g3-ski-3x3-rpe8"]},
         "segs": [
            seg("power_clean", 0, "strength_block", "A · Power Clean + High Box Jump",
                "4 rounds c/2': 3 Power Clean 65-75% + 5 high box jump.",
                p_rounds(4, sets=[
                    s_reps(3, target=t_pct(mn=65, mx=75), rest_s=120, modality="strength"),
                ], modality="strength"),
                {"sets": 4, "reps": 3, "rest_seconds": 120}),
            seg("high_box", 0, "strength_block", "A · Power Clean + High Box Jump",
                "5 high box jump por ronda (superset con power clean).",
                p_rounds(4, sets=[s_reps(5, target=t_bw(), modality="strength")], modality="strength"),
                {"sets": 4, "reps": 5}),
            seg("ski", 1, "intervals", "B · SkiErg",
                "Skierg 3×3' RPE8 / 45\" rest.",
                p_interval(rounds=3, work_s=180, rest_s=45, target=t_rpe(v=8), modality="ski"),
                {"rounds": 3, "time_seconds": 180, "rest_seconds": 45}),
            seg("situp", 2, "circuit", "C · Core",
                "Core (sit-up / estabilidad). Volumen moderado de cierre.",
                p_amrap(modality="core"),
                {}),
         ]},
        # ── DOMINGO — Bike regenerativo ──
        {"day": "sunday", "dow": 7, "mg": 5, "format": "tempo",
         "name": "Bike Z1 regenerativo + movilidad",
         "warmup": "",
         "cooldown": "Movilidad",
         "capa1": ("CAPA1 — Bike Z1 regenerativo. 1h Z1 RPE1-2 + movilidad."),
         "meta": {"maps_to_block": "g5-bike-z1-regen"},
         "segs": [
            seg("bike", 0, "tempo", "Bike regenerativo",
                "1h Z1 RPE1-2.",
                p_steady(total_s=3600, target=t_zone(v=1), modality="bike"),
                {"time_seconds": 3600}),
            seg("hip_mob", 1, "tempo", "Movilidad",
                "Movilidad.", p_steady(modality="mobility"),
                {}),
         ]},
    ],
}

# ───────────────────────────── SEMANA 7 — Carga (sled pesado) ───────────────
WEEKS[7] = {
    "pwt_name": "Semana 7 — Transformación",
    "atr": "TRANS",
    "micro": "Carga (sled pesado + series objetivo)",
    "focus": ("Microciclo de Carga del macrociclo ATR TRANSFORMACIÓN con sled pesado y series a "
              "ritmo objetivo. Lunes carrera Z2 mantenimiento + movilidad (menor carga); martes "
              "fartlek cinta Z5; miércoles WOD estaciones max-effort por tiempo (sled/lunge/wall ball, "
              "TC 60'); jueves ergómetros Z2 recuperación activa; viernes series largas sled+ergo+carrera; "
              "sábado fuerza piernas potencia + chipper; domingo bike Z1 regenerativo."),
    "coach_notes_week": ("Semana 7 importada de Plantilla_HYROX_12sem (Transformación). Sled pesado "
                         "(170/150kg) y series específicas. Capa 1 en coach_notes; capa 2 en segmentos."),
    "days": [
        # LUNES — Carrera Z2 + movilidad
        {"day": "monday", "dow": 1, "mg": 5, "format": "tempo",
         "name": "Carrera Z2 mantenimiento + movilidad",
         "warmup": "Activación suave",
         "cooldown": "30' movilidad y foam",
         "capa1": "CAPA1 — Carrera Z2 de mantenimiento + movilidad. Día de menor carga dentro de la semana.",
         "meta": {"maps_to_block": "g5-carrera-z2-mantenimiento"},
         "segs": [
            seg("run", 0, "tempo", "Carrera Z2",
                "1h10' Z2 RPE3-4.",
                p_steady(total_s=4200, target=t_rpe(mn=3, mx=4), modality="run"),
                {"time_seconds": 4200}),
            seg("foam", 1, "tempo", "Movilidad + foam",
                "30' movilidad y foam.",
                p_steady(total_s=1800, modality="mobility"),
                {"time_seconds": 1800}),
         ]},
        # MARTES — Fartlek cinta Z5
        {"day": "tuesday", "dow": 2, "mg": 4, "format": "intervals",
         "name": "Fartlek cinta Z5",
         "warmup": "Warm up 8' + 2' inclinación 7",
         "cooldown": "Cool down trotando",
         "capa1": "CAPA1 — Fartlek en cinta de alta intensidad (Z5). 12×(1' Z5 / 50\" Z1-2), inclinación 1. No andar en el descanso.",
         "meta": {"maps_to_block": "g4-fartlek-cinta-z5"},
         "segs": [
            seg("run", 0, "tempo", "Calentamiento",
                "Warm up 8'.", p_steady(total_s=480, target=t_rpe(v=5), modality="run"),
                {"time_seconds": 480}),
            seg("run", 0, "tempo", "Calentamiento",
                "2' inclinación 7.", p_steady(total_s=120, modality="run", note="cinta inclinación 7"),
                {"time_seconds": 120, "incline": 7}),
            seg("run", 1, "intervals", "Fartlek 12×",
                "12×(1' Z5 / 50\" Z1-2), inclinación 1. No andar en el descanso.",
                p_interval(rounds=12, work_s=60, rest_s=50, target=t_zone(v=5), modality="run"),
                {"rounds": 12, "time_seconds": 60, "rest_seconds": 50, "incline": 1}),
            seg("run", 2, "tempo", "Vuelta a la calma",
                "Cool down trotando.", p_steady(target=t_rpe(v=3), modality="run"),
                {}),
         ]},
        # MIÉRCOLES — WOD estaciones TC 60'
        {"day": "wednesday", "dow": 3, "mg": 6, "format": "circuit",
         "name": "WOD estaciones max-effort (TC 60')",
         "warmup": "Movilidad + activación estaciones",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — WOD de estaciones max-effort por tiempo (sled/lunge/wall ball). Time cap 60'.",
         "meta": {"maps_to_block": "g6-wod-estaciones-tc60"},
         "segs": [
            seg("sled_pull", 0, "circuit", "WOD · Sled",
                "4 rounds 4' max sled pull/drag / 1'30\" rest.",
                p_rounds(4, sets=[s_dur(240, target=t_rpe(mn=9, mx=10), rest_s=90, modality="strength")], modality="strength"),
                {"sets": 4, "time_seconds": 240, "rest_seconds": 90}),
            seg("sb_lunge", 1, "circuit", "WOD · Walking lunge SB",
                "3 rounds 3' max SB walking lunge 20kg.",
                p_rounds(3, sets=[s_dur(180, target=t_kg(20), modality="functional")], modality="functional"),
                {"sets": 3, "time_seconds": 180}),
            seg("bbj", 2, "circuit", "WOD · Burpee BBJ",
                "2 rounds 2' max burpee BBJ.",
                p_rounds(2, sets=[s_dur(120, target=t_rpe(mn=9, mx=10), modality="functional")], modality="functional"),
                {"sets": 2, "time_seconds": 120}),
            seg("wall_ball", 3, "circuit", "WOD · Wall ball",
                "1 round 50 wall ball 9kg.",
                p_rounds(1, sets=[s_reps(50, target=t_kg(9), modality="functional")], modality="functional"),
                {"sets": 1, "reps": 50}),
         ]},
        # JUEVES — Ergómetros Z2 + preventivos
        {"day": "thursday", "dow": 4, "mg": 5, "format": "tempo",
         "name": "Ergómetros Z2 recuperación activa",
         "warmup": "Activación suave",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — Ergómetros Z2 de recuperación activa. 10' row + 10' ski + 10' AB + 10' run todo Z2 + plio y preventivos.",
         "meta": {"maps_to_block": "g5-ergometros-z2-recuperacion"},
         "segs": [
            seg("row", 0, "tempo", "Ergómetros Z2",
                "10' row Z2.", p_steady(total_s=600, target=t_zone(v=2), modality="row"),
                {"time_seconds": 600}),
            seg("ski", 0, "tempo", "Ergómetros Z2",
                "10' ski Z2.", p_steady(total_s=600, target=t_zone(v=2), modality="ski"),
                {"time_seconds": 600}),
            seg("ab", 0, "tempo", "Ergómetros Z2",
                "10' AB Z2.", p_steady(total_s=600, target=t_zone(v=2), modality="bike"),
                {"time_seconds": 600}),
            seg("run", 0, "tempo", "Ergómetros Z2",
                "10' run Z2.", p_steady(total_s=600, target=t_zone(v=2), modality="run"),
                {"time_seconds": 600}),
            seg("prehab_prev", 1, "circuit", "Plio + preventivos",
                "Trabajo de plio y preventivos.", p_amrap(modality="mobility"),
                {}),
         ]},
        # VIERNES — Series largas sled+ergo+carrera
        {"day": "friday", "dow": 5, "mg": 7, "format": "intervals",
         "name": "Series largas específicas · sled + ergo + carrera",
         "warmup": "Activación sled ligera + movilidad",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — Series largas sled+ergo+carrera (resistencia específica). Sled push 170kg / sled pull 150kg.",
         "meta": {"maps_to_block": "g7-series-largas-sled-ergo"},
         "segs": [
            seg("sled_push", 0, "intervals", "Bloque 1 · push + row",
                "3 rounds 25m sled push 170kg + 500m row.",
                p_rounds(3, sets=[
                    s_dist(25, target=t_kg(170), modality="strength"),
                    s_dist(500, modality="row"),
                ], modality="strength"),
                {"sets": 3, "distance_meters": 25}),
            seg("sled_pull", 1, "intervals", "Bloque 2 · pull + ski",
                "3 rounds 25m sled pull 150kg + 500m ski.",
                p_rounds(3, sets=[
                    s_dist(25, target=t_kg(150), modality="strength"),
                    s_dist(500, modality="ski"),
                ], modality="strength"),
                {"sets": 3, "distance_meters": 25}),
            seg("sled_push", 2, "intervals", "Bloque 3 · sled + run (x2)",
                "3 rounds sled + 400m run (x2).",
                p_rounds(3, sets=[
                    s_dist(25, target=t_kg(170), modality="strength", note="sled"),
                    s_dist(400, modality="run"),
                    s_dist(400, modality="run"),
                ], modality="strength"),
                {"sets": 3, "distance_meters": 400}),
         ]},
        # SÁBADO — Fuerza + chipper
        {"day": "saturday", "dow": 6, "mg": 2, "format": "strength_block",
         "name": "Fuerza piernas potencia + chipper",
         "warmup": "Movilidad + activación + técnica front squat",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — Fuerza piernas potencia + chipper. Front squat 70% + high box jump plio (10 rounds); chipper 100 wall ball + 70m SB lunge AFAP.",
         "meta": {"maps_to_block": ["g2-front-squat-high-box-10r", "g6-chipper-100wb-70lunge"]},
         "segs": [
            seg("front_squat", 0, "strength_block", "A · Front squat + high box jump",
                "10 rounds Front squat 70% + 10 high box jump plio / 2' rest.",
                p_rounds(10, sets=[s_reps(1, target=t_pct(v=70), rest_s=120, modality="strength", note="reps según prescripción Pablo")], modality="strength"),
                {"sets": 10, "rest_seconds": 120}),
            seg("high_box", 0, "strength_block", "A · Front squat + high box jump",
                "10 high box jump plio por ronda.",
                p_rounds(10, sets=[s_reps(10, target=t_bw(), modality="strength")], modality="strength"),
                {"sets": 10, "reps": 10}),
            seg("wall_ball", 1, "circuit", "B · Chipper AFAP",
                "100 wall ball + 70m SB lunge intercalado AFAP.",
                p_amrap(modality="functional"),
                {"reps": 100}),
            seg("sb_lunge", 1, "circuit", "B · Chipper AFAP",
                "70m SB lunge intercalado con wall ball, AFAP.",
                p_amrap(modality="functional"),
                {"distance_meters": 70}),
         ]},
        # DOMINGO — Bike regenerativo
        {"day": "sunday", "dow": 7, "mg": 5, "format": "tempo",
         "name": "Bike Z1 regenerativo",
         "warmup": "",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — Bike Z1 regenerativo. 1h Z1.",
         "meta": {"maps_to_block": "g5-bike-z1-regen"},
         "segs": [
            seg("bike", 0, "tempo", "Bike regenerativo",
                "1h Z1.", p_steady(total_s=3600, target=t_zone(v=1), modality="bike"),
                {"time_seconds": 3600}),
         ]},
    ],
}

# ───────────────────────────── SEMANA 8 — DESCARGA ─────────────────────────
WEEKS[8] = {
    "pwt_name": "Semana 8 — Transformación",
    "atr": "TRANS",
    "micro": "DESCARGA",
    "focus": ("SEMANA DE DESCARGA del macrociclo ATR TRANSFORMACIÓN — mantener intensidad "
              "(ritmos/%RM), reducir volumen (series, km, rondas). Lunes movilidad + foam "
              "(recuperación); martes series de carrera CORTAS exigentes (calidad, poco volumen); "
              "miércoles WOD estaciones REDUCIDO (misma intensidad, menos rondas); jueves ergómetros "
              "Z2 + preventivos; viernes descanso completo; sábado simulación HYROX parcial controlada; "
              "domingo carrera Z2 corta."),
    "coach_notes_week": ("Semana 8 importada de Plantilla_HYROX_12sem — DESCARGA. Mantener intensidad, "
                         "bajar volumen. Capa 1 en coach_notes; capa 2 en segmentos."),
    "days": [
        # LUNES — Movilidad
        {"day": "monday", "dow": 1, "mg": 8, "format": "tempo",
         "name": "Movilidad + foam (recuperación)",
         "warmup": "",
         "cooldown": "Trabajo respiratorio",
         "capa1": "CAPA1 — Movilidad + foam (recuperación). 30' movilidad y foam + trabajo respiratorio. Recuperación activa.",
         "meta": {"deload": True, "maps_to_block": "g8-movilidad-foam-recuperacion"},
         "segs": [
            seg("foam", 0, "tempo", "Movilidad + foam",
                "30' movilidad y foam.", p_steady(total_s=1800, modality="mobility"),
                {"time_seconds": 1800}),
            seg("breathing", 1, "tempo", "Respiratorio",
                "Trabajo respiratorio.", p_steady(modality="mobility"),
                {}),
         ]},
        # MARTES — Series cortas exigentes
        {"day": "tuesday", "dow": 2, "mg": 4, "format": "intervals",
         "name": "Series cortas exigentes",
         "warmup": "2km warm up",
         "cooldown": "Trote suave",
         "capa1": "CAPA1 — Series de carrera CORTAS exigentes (calidad, poco volumen). 3×1000 / 2×800 / 4×400. Ritmos exigentes, volumen reducido.",
         "meta": {"deload": True, "maps_to_block": "g4-series-cortas-exigentes"},
         "segs": [
            seg("run", 0, "tempo", "Calentamiento",
                "2km warm up.", p_steady(target=t_rpe(v=4), modality="run"),
                {"distance_meters": 2000}),
            seg("run", 1, "intervals", "Serie A · 3×1000",
                "3×1000 (1'30\" rest). Ritmo exigente.",
                p_interval(rounds=3, rest_s=90, target=t_rpe(mn=8, mx=9), modality="run"),
                {"rounds": 3, "rest_seconds": 90, "distance_meters": 1000}),
            seg("run", 2, "intervals", "Serie B · 2×800",
                "2×800 (1'15\" rest). Ritmo exigente.",
                p_interval(rounds=2, rest_s=75, target=t_rpe(mn=8, mx=9), modality="run"),
                {"rounds": 2, "rest_seconds": 75, "distance_meters": 800}),
            seg("run", 3, "intervals", "Serie C · 4×400",
                "4×400 (45\" rest). Ritmo exigente.",
                p_interval(rounds=4, rest_s=45, target=t_rpe(mn=9, mx=10), modality="run"),
                {"rounds": 4, "rest_seconds": 45, "distance_meters": 400}),
         ]},
        # MIÉRCOLES — WOD reducido
        {"day": "wednesday", "dow": 3, "mg": 6, "format": "emom",
         "name": "WOD reducido · EMOM 20' estaciones",
         "warmup": "Movilidad + activación estaciones",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — WOD de estaciones REDUCIDO (misma intensidad, menos rondas). EMOM 20' rotando estaciones HYROX a max effort (45\" on / transición corriendo).",
         "meta": {"deload": True, "maps_to_block": "g6-wod-reducido-emom20"},
         "segs": [
            seg("run", 0, "emom", "EMOM 20' estaciones",
                "EMOM 20' rotando estaciones HYROX a max effort. 45\" on cada estación / transición corriendo.",
                p_emom(20, work_s=45, modality="functional"),
                {"rounds": 20, "time_seconds": 45}),
         ]},
        # JUEVES — Ergómetros Z2 + preventivos
        {"day": "thursday", "dow": 4, "mg": 5, "format": "tempo",
         "name": "Ergómetros Z2 + preventivos",
         "warmup": "Activación suave",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — Ergómetros Z2 + preventivos. 10' row + 10' ski + 10' AB + 10' run Z2 + plio y preventivos.",
         "meta": {"deload": True, "maps_to_block": "g5-ergometros-z2-preventivos"},
         "segs": [
            seg("row", 0, "tempo", "Ergómetros Z2", "10' row Z2.",
                p_steady(total_s=600, target=t_zone(v=2), modality="row"), {"time_seconds": 600}),
            seg("ski", 0, "tempo", "Ergómetros Z2", "10' ski Z2.",
                p_steady(total_s=600, target=t_zone(v=2), modality="ski"), {"time_seconds": 600}),
            seg("ab", 0, "tempo", "Ergómetros Z2", "10' AB Z2.",
                p_steady(total_s=600, target=t_zone(v=2), modality="bike"), {"time_seconds": 600}),
            seg("run", 0, "tempo", "Ergómetros Z2", "10' run Z2.",
                p_steady(total_s=600, target=t_zone(v=2), modality="run"), {"time_seconds": 600}),
            seg("prehab_prev", 1, "circuit", "Plio + preventivos",
                "Plio y preventivos.", p_amrap(modality="mobility"), {}),
         ]},
        # VIERNES — rest (no template)
        # SÁBADO — Simulación parcial
        {"day": "saturday", "dow": 6, "mg": 7, "format": "hyrox_sim",
         "name": "Simulación HYROX parcial controlada",
         "warmup": "Activación específica + movilidad",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — Simulación HYROX parcial controlada. Medio HYROX a ritmo objetivo controlado, foco en transiciones limpias.",
         "meta": {"deload": True, "maps_to_block": "g7-simulacion-parcial-controlada"},
         "segs": [
            seg("run", 0, "simulation", "Media simulación controlada",
                "Medio HYROX a ritmo objetivo controlado. Foco en transiciones limpias.",
                p_steady(target=t_rpe(mn=7, mx=8), modality="run"),
                {"effort": "controlled"}),
         ]},
        # DOMINGO — Carrera corta Z2
        {"day": "sunday", "dow": 7, "mg": 5, "format": "tempo",
         "name": "Carrera corta Z2",
         "warmup": "",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — Carrera Z2 corta. 1h Z2 RPE3.",
         "meta": {"deload": True, "maps_to_block": "g5-carrera-corta-z2"},
         "segs": [
            seg("run", 0, "tempo", "Carrera Z2",
                "1h Z2 RPE3.", p_steady(total_s=3600, target=t_rpe(v=3), modality="run"),
                {"time_seconds": 3600}),
         ]},
    ],
}

# ───────────────────────────── SEMANA 9 — PICO ─────────────────────────────
WEEKS[9] = {
    "pwt_name": "Semana 9 — Transformación",
    "atr": "TRANS",
    "micro": "Carga (pico de carga)",
    "focus": ("Microciclo de PICO de carga del macrociclo ATR TRANSFORMACIÓN. Lunes carrera Z2 + "
              "técnica (preparar pico); martes threshold en cinta a ritmo objetivo (4×2'30\" a 17 km/h); "
              "miércoles WOD AFAP con back squat pesado + sled 260kg + carrera (potencia-resistencia); "
              "jueves descanso; viernes intervalos on/off estaciones HYROX (densidad máxima); sábado "
              "fuerza-potencia piernas + ergómetro; domingo carrera Z2 larga."),
    "coach_notes_week": ("Semana 9 importada de Plantilla_HYROX_12sem (Transformación · PICO). Sled "
                         "260kg, squat pesado, threshold 17 km/h. Capa 1 en coach_notes; capa 2 en segmentos."),
    "days": [
        # LUNES — Carrera Z2 + técnica
        {"day": "monday", "dow": 1, "mg": 5, "format": "tempo",
         "name": "Carrera Z2 + técnica",
         "warmup": "Activación + técnica carrera",
         "cooldown": "Strides 6×30\"",
         "capa1": "CAPA1 — Carrera Z2 + técnica (preparar pico). 1h Z2 + técnica de carrera + strides 6×30\". Día de activación previo al pico.",
         "meta": {"maps_to_block": "g5-carrera-z2-tecnica-pre-pico"},
         "segs": [
            seg("run", 0, "tempo", "Carrera Z2",
                "1h Z2 + técnica de carrera.",
                p_steady(total_s=3600, target=t_zone(v=2), modality="run"),
                {"time_seconds": 3600}),
            seg("run", 1, "intervals", "Strides",
                "Strides 6×30\".", p_interval(rounds=6, work_s=30, modality="run"),
                {"rounds": 6, "time_seconds": 30}),
         ]},
        # MARTES — Threshold cinta
        {"day": "tuesday", "dow": 2, "mg": 4, "format": "intervals",
         "name": "Threshold cinta · 4×2'30\" a ritmo test",
         "warmup": "Warm up 8' + inclinación",
         "cooldown": "5' cool down",
         "capa1": "CAPA1 — Threshold en cinta a ritmo objetivo (intervalos largos). 4×2'30\" a ritmo test (17 km/h ref) / 2' trote 11 km/h, inclinación 1.",
         "meta": {"maps_to_block": "g4-threshold-cinta-4x230"},
         "segs": [
            seg("run", 0, "tempo", "Calentamiento",
                "Warm up 8' + inclinación.", p_steady(total_s=480, target=t_rpe(v=5), modality="run"),
                {"time_seconds": 480}),
            seg("run", 1, "intervals", "Threshold 4×2'30\"",
                "4×2'30\" a ritmo test (17 km/h ref) / 2' trote 11 km/h. Inclinación 1.",
                p_interval(rounds=4, work_s=150, rest_s=120,
                           target=t_pace_km(v=PACE_17), modality="run"),
                {"rounds": 4, "time_seconds": 150, "rest_seconds": 120, "incline": 1, "speed_kmh": 17}),
            seg("run", 2, "tempo", "Vuelta a la calma",
                "5' cool down.", p_steady(total_s=300, target=t_pace_km(v=PACE_11), modality="run"),
                {"time_seconds": 300, "speed_kmh": 11}),
         ]},
        # MIÉRCOLES — WOD AFAP 6 rounds
        {"day": "wednesday", "dow": 3, "mg": 6, "format": "circuit",
         "name": "WOD AFAP · squat pesado + sled + run",
         "warmup": "Movilidad + activación + back squat build-up",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — WOD AFAP con back squat pesado + sled + carrera (potencia-resistencia). 6 rounds. Buscar peso exigente en squat.",
         "meta": {"maps_to_block": "g6-wod-afap-squat-sled-run"},
         "segs": [
            seg("back_squat", 0, "circuit", "WOD AFAP · 6 rounds",
                "8 Back squat 75-80% (peso exigente).",
                p_rounds(6, sets=[s_reps(8, target=t_pct(mn=75, mx=80), modality="strength")], modality="strength"),
                {"sets": 6, "reps": 8}),
            seg("sled_push", 0, "circuit", "WOD AFAP · 6 rounds",
                "12,5m sled push 260kg.",
                p_rounds(6, sets=[s_dist(12.5, target=t_kg(260), modality="strength")], modality="strength"),
                {"sets": 6, "distance_meters": 12.5}),
            seg("run", 0, "circuit", "WOD AFAP · 6 rounds",
                "2' run a 3'50\"/km.",
                p_rounds(6, sets=[s_dur(120, target=t_pace_km(v=PACE_350), modality="run")], modality="run"),
                {"sets": 6, "time_seconds": 120}),
            seg("bbj", 0, "circuit", "WOD AFAP · 6 rounds",
                "10 burpee BBJ.",
                p_rounds(6, sets=[s_reps(10, target=t_rpe(mn=9, mx=10), modality="functional")], modality="functional"),
                {"sets": 6, "reps": 10}),
         ]},
        # JUEVES — rest (no template)
        # VIERNES — Intervalos on/off estaciones
        {"day": "friday", "dow": 5, "mg": 7, "format": "intervals",
         "name": "Intervalos on/off estaciones HYROX",
         "warmup": "Movilidad + activación estaciones",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — Intervalos on/off estaciones HYROX (densidad máxima). 3×1' on / 1' off por estación: burpee BBJ, sled push 260kg, sled pull 170kg, farmer 32kg, walking lunge 30kg, wall balls 9kg, run.",
         "meta": {"maps_to_block": "g7-intervalos-on-off-estaciones"},
         "segs": [
            seg("bbj", 0, "intervals", "Estación 1 · Burpee BBJ",
                "3×1' on / 1' off burpee BBJ.",
                p_interval(rounds=3, work_s=60, rest_s=60, target=t_rpe(mn=9, mx=10), modality="functional"),
                {"rounds": 3, "time_seconds": 60, "rest_seconds": 60}),
            seg("sled_push", 1, "intervals", "Estación 2 · Sled push 260kg",
                "3×1' on / 1' off sled push 260kg.",
                p_interval(rounds=3, work_s=60, rest_s=60, target=t_kg(260), modality="strength"),
                {"rounds": 3, "time_seconds": 60, "rest_seconds": 60}),
            seg("sled_pull", 2, "intervals", "Estación 3 · Sled pull 170kg",
                "3×1' on / 1' off sled pull 170kg.",
                p_interval(rounds=3, work_s=60, rest_s=60, target=t_kg(170), modality="strength"),
                {"rounds": 3, "time_seconds": 60, "rest_seconds": 60}),
            seg("farmer", 3, "intervals", "Estación 4 · Farmer carry 32kg",
                "3×1' on / 1' off farmer carry 32kg.",
                p_interval(rounds=3, work_s=60, rest_s=60, target=t_kg(32), modality="functional"),
                {"rounds": 3, "time_seconds": 60, "rest_seconds": 60}),
            seg("walking_lunge", 4, "intervals", "Estación 5 · Walking lunge 30kg",
                "3×1' on / 1' off walking lunge 30kg.",
                p_interval(rounds=3, work_s=60, rest_s=60, target=t_kg(30), modality="functional"),
                {"rounds": 3, "time_seconds": 60, "rest_seconds": 60}),
            seg("wall_ball", 5, "intervals", "Estación 6 · Wall balls 9kg",
                "3×1' on / 1' off wall balls 9kg.",
                p_interval(rounds=3, work_s=60, rest_s=60, target=t_kg(9), modality="functional"),
                {"rounds": 3, "time_seconds": 60, "rest_seconds": 60}),
            seg("run", 6, "intervals", "Estación 7 · Run",
                "3×1' on / 1' off run.",
                p_interval(rounds=3, work_s=60, rest_s=60, target=t_rpe(mn=8, mx=9), modality="run"),
                {"rounds": 3, "time_seconds": 60, "rest_seconds": 60}),
         ]},
        # SÁBADO — Fuerza-potencia + chipper/press
        {"day": "saturday", "dow": 6, "mg": 2, "format": "strength_block",
         "name": "Fuerza-potencia piernas + press",
         "warmup": "Movilidad + activación + front squat build-up",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — Fuerza-potencia piernas + ergómetro/press. Front squat + high box jump (7-6-6-6-5-5) con 6 burpee to plate entre series; bench + shoulder press 10-10-8-8-6.",
         "meta": {"maps_to_block": ["g2-front-squat-high-box-wave", "g1-bench-press-wave"]},
         "segs": [
            seg("front_squat", 0, "strength_block", "A · Front squat (wave) + high box",
                "6 series Front squat 7-6-6-6-5-5.",
                p_sets([
                    s_reps(7, modality="strength"), s_reps(6, modality="strength"),
                    s_reps(6, modality="strength"), s_reps(6, modality="strength"),
                    s_reps(5, modality="strength"), s_reps(5, modality="strength"),
                ], modality="strength"),
                {"sets": 6}),
            seg("high_box", 0, "strength_block", "A · Front squat (wave) + high box",
                "High box jump entre series de front squat.",
                p_sets([s_reps(5, target=t_bw(), modality="strength")]*6, modality="strength"),
                {"sets": 6}),
            seg("burpee_plate", 0, "strength_block", "A · Front squat (wave) + high box",
                "6 burpee to plate entre series.",
                p_sets([s_reps(6, target=t_bw(), modality="functional")]*6, modality="functional"),
                {"sets": 6, "reps": 6}),
            seg("bench", 1, "strength_block", "B · Bench press",
                "Bench 10-10-8-8-6.",
                p_sets([
                    s_reps(10, modality="strength"), s_reps(10, modality="strength"),
                    s_reps(8, modality="strength"), s_reps(8, modality="strength"),
                    s_reps(6, modality="strength"),
                ], modality="strength"),
                {"sets": 5}),
            seg("ohp", 2, "strength_block", "C · Shoulder press",
                "Shoulder press 10-10-8-8-6.",
                p_sets([
                    s_reps(10, modality="strength"), s_reps(10, modality="strength"),
                    s_reps(8, modality="strength"), s_reps(8, modality="strength"),
                    s_reps(6, modality="strength"),
                ], modality="strength"),
                {"sets": 5}),
         ]},
        # DOMINGO — Carrera Z2 larga
        {"day": "sunday", "dow": 7, "mg": 5, "format": "tempo",
         "name": "Carrera Z2 larga",
         "warmup": "",
         "cooldown": "Movilidad",
         "capa1": "CAPA1 — Carrera Z2 larga. 1h Z2 RPE3-4.",
         "meta": {"maps_to_block": "g5-carrera-z2-larga"},
         "segs": [
            seg("run", 0, "tempo", "Carrera Z2",
                "1h Z2 RPE3-4.", p_steady(total_s=3600, target=t_rpe(mn=3, mx=4), modality="run"),
                {"time_seconds": 3600}),
         ]},
    ],
}

# ── Build slots_json item from a segment ─────────────────────────────────────
def slot_item(s, ex_id, ex_name):
    item = {"notes": s["notes"], "exercise_id": ex_id, "params_json": s["params"], "exercise_name": ex_name}
    return item

def esc(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def jesc(obj):
    return "'" + json.dumps(obj, ensure_ascii=False).replace("'", "''") + "'::jsonb"

# ── Emit SQL ─────────────────────────────────────────────────────────────────
def main():
    sql = ["BEGIN;"]

    # 1) New exercises (idempotent upsert by slug). source tags needs-review.
    for slug, name, cat, equip, desc, wk in NEW_EXERCISES:
        equip_arr = "ARRAY[" + ",".join(esc(e) for e in equip) + "]::text[]" if equip else "'{}'::text[]"
        src = f"fahybrik-{wk}-needs-review"
        sql.append(
            f"INSERT INTO exercises (slug, name, category, equipment, description, source) "
            f"VALUES ({esc(slug)},{esc(name)},{esc(cat)}::exercise_category,{equip_arr},{esc(desc)},{esc(src)}) "
            f"ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, "
            f"equipment=EXCLUDED.equipment, description=EXCLUDED.description, source=EXCLUDED.source;"
        )

    # exercise id lookup CTE will be inline per insert via subselect on slug.
    def ex_id_sub(key):
        return f"(SELECT id FROM exercises WHERE slug={esc(EX[key])})"

    for wn, wk in WEEKS.items():
        pwt_name = wk["pwt_name"]
        # Clean prior runs of this week (templates by name+source, pwt by name)
        # Delete pwt and templates created by this builder for this week.
        sql.append(f"-- ===== WEEK {wn} =====")
        # delete templates (cascade segments) created by this script for this week
        tnames = [esc(d["name"]) for d in wk["days"]]
        # We tag templates via meta_json source so deletion is precise:
        wk_src = f"Plantilla_HYROX_12sem · Semana {wn}"
        sql.append(
            f"DELETE FROM templates WHERE coach_id={COACH_ID} AND meta_json->>'source' LIKE '%Semana {wn} ·%' "
            f"AND meta_json->>'macrocycle_tag'='TRANS-w{wn}';"
        )
        sql.append(f"DELETE FROM program_week_templates WHERE coach_id={COACH_ID} AND name={esc(pwt_name)} AND athlete_profile='balanced';")

        # Insert templates, capture ids in a temp mapping via DO block is complex;
        # instead insert each template and use RETURNING into a psql variable is hard in batch.
        # Strategy: insert templates with a unique meta tag, then build slots_json by
        # re-selecting ids. We emit a DO $$ block per week to assemble slots_json.
        # Simpler: insert templates + segments referencing template id via subselect on (coach_id,name,day_position).

        days_slots = []
        for d in wk["days"]:
            meta = dict(d["meta"])
            meta["atr"] = {"macrocycle": "TRANSFORMACION", "microcycle": wk["micro"]}
            meta["source"] = f"{wk_src} · {d['day'].capitalize()}"
            meta["macrocycle_tag"] = f"TRANS-w{wn}"
            tname = d["name"]
            sql.append(
                f"INSERT INTO templates (coach_id, name, description, format, target_block, target_level, "
                f"version, day_position, is_draft, is_partner_workout, warmup, cooldown, coach_notes, "
                f"meta_json, methodology_group_id) VALUES ("
                f"{COACH_ID},{esc(tname)},'',{esc(d['format'])},'TRANS',NULL,1,{esc(d['day'])},false,false,"
                f"{esc(d['warmup'])},{esc(d['cooldown'])},{esc(d['capa1'])},{jesc(meta)},{d['mg']});"
            )
            tid_sub = (f"(SELECT id FROM templates WHERE coach_id={COACH_ID} AND name={esc(tname)} "
                       f"AND day_position={esc(d['day'])} AND meta_json->>'macrocycle_tag'='TRANS-w{wn}')")
            # segments
            for pos, s in enumerate(d["segs"]):
                sql.append(
                    f"INSERT INTO template_segments (template_id, position, exercise_id, params_json, notes, "
                    f"block_position, block_format, block_title, prescription_json) VALUES ("
                    f"{tid_sub},{pos},{ex_id_sub(s['ex'])},{jesc(s['params'])},{esc(s['notes'])},"
                    f"{s['block_position']},{esc(s['block_format'])},{esc(s['block_title'])},{jesc(s['presc'])});"
                )
            # Build day's slot dict for slots_json (mirrors week-1 shape)
            blocks_map = {}
            for s in d["segs"]:
                bp = s["block_position"]
                blocks_map.setdefault(bp, {"items": [], "title": s["block_title"],
                                          "format": s["block_format"], "config_json": {}})
                blocks_map[bp]["items"].append({
                    "notes": s["notes"], "exercise_slug": s["ex"], "params_json": s["params"],
                })
            blocks_list = [blocks_map[k] for k in sorted(blocks_map)]
            days_slots.append({
                "dow": d["dow"], "day": d["day"], "name": tname, "focus": d["name"],
                "notes": d["capa1"], "blocks": blocks_list,
            })

        # rest days (jueves/domingo handled; fill 7-day skeleton)
        present = {d["dow"] for d in wk["days"]}
        # Assemble slots_json: 7 days; sessions reference template by re-select.
        # We emit slots_json with exercise_id resolved + template_id resolved via a
        # DO block updating program_week_templates after templates exist.
        slots_days = []
        for dow in range(1, 8):
            match = next((ds for ds in days_slots if ds["dow"] == dow), None)
            if not match:
                slots_days.append({"sessions": [], "day_of_week": dow})
                continue
            # resolve exercise ids + names inline at SQL build time? names need DB.
            # We'll build blocks with exercise_slug placeholders and resolve in a DO block.
            sess_blocks = []
            for b in match["blocks"]:
                items = []
                for it in b["items"]:
                    items.append({
                        "notes": it["notes"], "exercise_slug": it["exercise_slug"],
                        "params_json": it["params_json"],
                    })
                sess_blocks.append({"items": items, "title": b["title"],
                                    "format": b["format"], "config_json": b["config_json"]})
            slots_days.append({
                "day_of_week": dow,
                "sessions": [{
                    "kind": "workout", "focus": match["focus"], "notes": match["notes"],
                    "blocks": sess_blocks, "template_day": match["day"], "template_name": match["name"],
                }],
            })

        pwt_slots = {"days": slots_days}
        sql.append(
            f"INSERT INTO program_week_templates (coach_id, name, level, atr_block_hint, slots_json, "
            f"focus, coach_notes, athlete_profile, week_number) VALUES ("
            f"{COACH_ID},{esc(pwt_name)},'pro','TRANS',{jesc(pwt_slots)},{esc(wk['focus'])},"
            f"{esc(wk['coach_notes_week'])},'balanced',{wn});"
        )

    # 2) Resolve template_id + exercise_id inside slots_json (replace slug w/ id+name,
    #    add template_id) via a DO block per week.
    sql.append("""
DO $resolve$
DECLARE
  pwt RECORD;
  newdays jsonb := '[]'::jsonb;
  d jsonb;
  s jsonb;
  newsessions jsonb;
  newblocks jsonb;
  b jsonb;
  newitems jsonb;
  it jsonb;
  exrow RECORD;
  tid bigint;
  newsess jsonb;
  newblock jsonb;
  wk_num int;
BEGIN
  FOR pwt IN SELECT id, slots_json, week_number FROM program_week_templates
             WHERE coach_id=4 AND atr_block_hint='TRANS' AND week_number IN (6,7,8,9) AND athlete_profile='balanced'
  LOOP
    wk_num := pwt.week_number;
    newdays := '[]'::jsonb;
    FOR d IN SELECT * FROM jsonb_array_elements(pwt.slots_json->'days')
    LOOP
      newsessions := '[]'::jsonb;
      FOR s IN SELECT * FROM jsonb_array_elements(COALESCE(d->'sessions','[]'::jsonb))
      LOOP
        SELECT id INTO tid FROM templates
          WHERE coach_id=4 AND day_position=(s->>'template_day')
          AND name=(s->>'template_name') AND meta_json->>'macrocycle_tag'=('TRANS-w'||wk_num);
        newblocks := '[]'::jsonb;
        FOR b IN SELECT * FROM jsonb_array_elements(s->'blocks')
        LOOP
          newitems := '[]'::jsonb;
          FOR it IN SELECT * FROM jsonb_array_elements(b->'items')
          LOOP
            SELECT id, name INTO exrow FROM exercises WHERE slug=(it->>'exercise_slug');
            newitems := newitems || jsonb_build_object(
              'notes', it->'notes',
              'exercise_id', exrow.id,
              'exercise_name', exrow.name,
              'params_json', it->'params_json'
            );
          END LOOP;
          newblock := jsonb_build_object('items', newitems, 'title', b->'title',
                                         'format', b->'format', 'config_json', b->'config_json');
          newblocks := newblocks || newblock;
        END LOOP;
        newsess := jsonb_build_object('kind','workout','focus',s->'focus','notes',s->'notes',
                                      'blocks',newblocks,'template_id',tid);
        newsessions := newsessions || newsess;
      END LOOP;
      newdays := newdays || jsonb_build_object('sessions', newsessions, 'day_of_week', d->'day_of_week');
    END LOOP;
    UPDATE program_week_templates SET slots_json = jsonb_build_object('days', newdays) WHERE id = pwt.id;
  END LOOP;
END
$resolve$;
""")

    sql.append("COMMIT;")
    out = "\n".join(sql)
    path = "/tmp/build_weeks_6_9.sql"
    with open(path, "w") as f:
        f.write(out)
    print(f"SQL written to {path} ({len(sql)} statements)")

if __name__ == "__main__":
    main()

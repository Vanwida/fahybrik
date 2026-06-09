#!/usr/bin/env python3
"""
build_weeks_2_3.py — Generate SQL to seed weeks 2 & 3 of the HYROX 12-week plan
into FAHYBRIK, for all 3 athlete profiles each (6 program_week_templates), using
the UNIFIED prescription model (@fahybrid/shared/domain/prescription).

Source of truth: docs/Plantilla_HYROX_12sem (1) 2.xlsx
  - "Semana 2"/"Semana 3"  -> balanced
  - "Res S2"/"Res S3"      -> endurance_focus
  - "Fue S2"/"Fue S3"      -> strength_focus

Pattern copied EXACTLY from week 1 (templates 76-93, program_week_templates 51-53,
their template_segments + slots_json). Differences vs wk1, by design:
  - prescription_json on EVERY segment carries a STRUCTURED target where the Excel
    states one (Z-zone -> hr_zone; RPE -> rpe; %RM -> percent_rm; kg -> kg;
    absolute pace like 6'/km -> pace). wk1 left zones in prose; the task mandates
    zero free text, so we improve on that gap.
  - Relative paces ("ritmo test 9'", "ritmo objetivo HYROX") have NO absolute
    number in the Excel -> measure(distance)+rest, reference kept in `note`
    (mirrors wk1's run-test RPE-in-notes). Listed as an honest gap.

Idempotent: emits DELETEs for any prior wk2/3 rows (by program_week_templates name
+ their templates via meta_json.source) before re-inserting.

This script ONLY writes SQL to stdout. No DB connection. No fabrication.
"""

import json
import sys

# ── ID allocation (start above current maxima: templates 93, segments 453,
# pwt 53, exercises 3573). Deterministic, contiguous, collision-free. ──────────
# NOTE: weeks 4-12 were seeded by parallel work AFTER this script's first draft,
# pushing maxima to templates=171, segments=701, pwt=66, exercises=3578. Bases are
# set well clear of those so explicit ids never collide; sequences are advanced at
# the end of the transaction. If re-run after further seeding, raise these.
TEMPLATE_ID0 = 300          # 38 templates -> 300..337
SEGMENT_ID0 = 2000          # 150 segments -> 2000..2149
PWT_ID0 = 80                # 6 week-templates -> 80..85
EXERCISE_ID0 = 3700         # new exercises (deterministic, prefixed slugs)

COACH_ID = 4
LEVEL = "pro"
ATR = "ACC"
MACRO = "ACUMULACION"

DAY_POS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
DOW = [1, 2, 3, 4, 5, 6]  # day_of_week in slots_json

# ── Exercise catalog (existing ids) ───────────────────────────────────────────
EX = {
    "sled_push": 2, "sled_pull": 3, "burpee_broad_jump": 4, "farmer_carry": 6,
    "sandbag_lunge": 7, "wall_balls": 8,
    "hip_mobility": 2807,
    "run": 3479, "ski": 3480, "row": 3481, "bike": 3482,
    "back_squat": 3484, "front_squat": 3485, "deadlift": 3486, "rdl": 3487,
    "ohp": 3488, "push_press": 3489, "bench": 3490,
    "pull_up": 3492, "hip_thrust": 3493, "power_clean": 3494,
    "thruster": 3497, "walking_lunge": 3498, "bulgarian": 3500,
    "box_jump": 3501, "kb_swing": 3502, "kb_clean": 3504, "tgu": 3505,
    "burpee": 3508, "toes_to_bar": 3511, "box_jump_plyo": 3512,
    "broad_jump": 3513, "side_plank": 3530, "plank": 3515,
    "depth_jump": 3523, "hang_power_clean": 3526, "cable_fly": 3529,
    "walk": 3571, "run_drills": 3572, "dip": 3573, "sandbag_clean": 2806,
    "weighted_pullup": 2802, "lateral_raise": 3528,
}

# ── New exercises (genuinely absent). Deterministic prefixed slugs. ────────────
NEW_EXERCISES = [
    # key, slug, name, category, muscles[], equipment[]
    ("nordic_curl", "w23-nordic-curl", "Nordic Curl", "strength", "{hamstrings,glutes}", "{bodyweight}"),
    ("dead_bug", "w23-dead-bug", "Dead Bug", "core", "{core,hip_flexors}", "{bodyweight}"),
    ("kb_oh_lunge", "w23-kb-overhead-walking-lunge", "KB Overhead Walking Lunge", "hyrox_station", "{quadriceps,glutes,shoulders,core}", "{kettlebell}"),
]
for i, (k, *_rest) in enumerate(NEW_EXERCISES):
    EX[k] = EXERCISE_ID0 + i


# ── Prescription builders (the unified model) ─────────────────────────────────
def m_reps(v): return {"kind": "reps", "value": v}
def m_dist(m): return {"kind": "distance", "meters": m}
def m_dur(s): return {"kind": "duration", "seconds": s}
def m_cal(v): return {"kind": "calories", "value": v}

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
def t_pace_per_km(value_s=None, min_s=None, max_s=None):
    t = {"kind": "pace", "unit": "per_km"}
    if value_s is not None: t["value_s"] = value_s
    if min_s is not None: t["min_s"] = min_s
    if max_s is not None: t["max_s"] = max_s
    return t
def t_bw(): return {"kind": "bodyweight"}


def p_steady(total_s=None, dist_m=None, target=None, note=None):
    p = {"scheme": "steady"}
    if total_s is not None: p["total_s"] = total_s
    if dist_m is not None:
        p["sets"] = [{"measure": m_dist(dist_m)}]
        if target: p["sets"][0]["target"] = target
        target = None
    if target: p["target"] = target
    if note: p["note"] = note
    return p

def p_interval(rounds=None, work_s=None, rest_s=None, target=None, note=None):
    p = {"scheme": "interval"}
    if rounds is not None: p["rounds"] = rounds
    if work_s is not None: p["work_s"] = work_s
    if rest_s is not None: p["rest_s"] = rest_s
    if target: p["target"] = target
    if note: p["note"] = note
    return p

def p_sets(sets, note=None):
    p = {"scheme": "sets", "sets": sets}
    if note: p["note"] = note
    return p

def p_rounds(rounds=None, work_s=None, rest_s=None, target=None, note=None):
    p = {"scheme": "rounds"}
    if rounds is not None: p["rounds"] = rounds
    if work_s is not None: p["work_s"] = work_s
    if rest_s is not None: p["rest_s"] = rest_s
    if target: p["target"] = target
    if note: p["note"] = note
    return p

def p_amrap(total_s=None, target=None, note=None):
    p = {"scheme": "amrap"}
    if total_s is not None: p["total_s"] = total_s
    if target: p["target"] = target
    if note: p["note"] = note
    return p

def sset(measure=None, target=None, rest_s=None, tempo=None, note=None):
    s = {}
    if measure is not None: s["measure"] = measure
    if target is not None: s["target"] = target
    if rest_s is not None: s["rest_s"] = rest_s
    if tempo is not None: s["tempo"] = tempo
    if note is not None: s["note"] = note
    return s

# Strength helper: rep list + per-set or range %RM.
def strength(reps, rest_s, pct_each=None, pct_min=None, pct_max=None, kg_each=None, note=None):
    sets = []
    for i, r in enumerate(reps):
        if pct_each is not None:
            tgt = t_pct(v=pct_each[i])
        elif kg_each is not None:
            tgt = t_kg(kg_each[i])
        elif pct_min is not None or pct_max is not None:
            tgt = t_pct(mn=pct_min, mx=pct_max)
        else:
            tgt = None
        sets.append(sset(measure=m_reps(r), target=tgt, rest_s=rest_s))
    return p_sets(sets, note=note)


# ── A "segment" is one block item; "block" groups items sharing block_position ─
class Seg:
    __slots__ = ("ex", "presc", "params", "notes")
    def __init__(self, ex, presc, params, notes):
        self.ex = ex; self.presc = presc; self.params = params; self.notes = notes

class Block:
    def __init__(self, fmt, title, segs):
        self.fmt = fmt; self.title = title; self.segs = segs

class Session:
    def __init__(self, focus, capa1_notes, warmup, cooldown, mgroup, fmt, blocks):
        self.focus = focus; self.capa1 = capa1_notes; self.warmup = warmup
        self.cooldown = cooldown; self.mgroup = mgroup; self.fmt = fmt; self.blocks = blocks


# params_json mirrors the legacy shape (wk1 convention) for back-compat display.
def pj_time(s): return {"time_seconds": s}
def pj_dist(m): return {"distance_meters": m}
def pj_sets(n, rest=None, t=None, reps=None):
    d = {"sets": n}
    if rest is not None: d["rest_seconds"] = rest
    if t is not None: d["time_seconds"] = t
    if reps is not None: d["reps"] = reps
    return d

# Standard warmup/test calentamiento for ergo-test day (shared across 3 profiles).
def ergo_test_blocks():
    return [
        Block("tempo", "Calentamiento", [
            Seg(EX["ski"], p_steady(180, target=t_rpe(v=3)), pj_time(180), "3' SkiErg suave RPE3"),
            Seg(EX["row"], p_steady(180, target=t_rpe(v=3)), pj_time(180), "3' Remo suave RPE3"),
            Seg(EX["ski"], p_interval(rounds=3, work_s=20, rest_s=40, target=t_rpe(v=8)),
                pj_sets(3, rest=40, t=20), "3x(20\" fuerte/40\" suave) ski"),
            Seg(EX["row"], p_interval(rounds=3, work_s=20, rest_s=40, target=t_rpe(v=8)),
                pj_sets(3, rest=40, t=20), "3x(20\" fuerte/40\" suave) remo"),
        ]),
        Block("tempo", "Activación específica", [
            Seg(EX["side_plank"], p_sets([sset(measure=m_dur(20)), sset(measure=m_dur(20))]),
                pj_sets(2, t=20), "2x(10 zancadas alt + 10 shoulder taps + 10 remo goma + 20\" plancha lateral/lado)"),
        ]),
        Block("intervals", "TEST REMO 2'/2'", [
            Seg(EX["row"], p_interval(rounds=2, work_s=120, rest_s=60, target=t_rpe(v=10)),
                pj_sets(2, rest=60, t=120), "2' RPE10 / 1' descanso / 2' RPE10. *2-3x250m a ritmo objetivo antes*. ALMACENAR metros/ritmo medio remo"),
        ]),
        Block("intervals", "TEST SKI-ERG 2'/2'", [
            Seg(EX["ski"], p_interval(rounds=2, work_s=120, rest_s=60, target=t_rpe(v=10)),
                pj_sets(2, rest=60, t=120), "5-8' descanso completo previo. 2' RPE10 / 1' descanso / 2' RPE10. ALMACENAR metros/ritmo medio ski"),
        ]),
    ]


# ════════════════════════════════════════════════════════════════════════════
# WEEK / PROFILE DEFINITIONS — one Session per weekday (Lun..Sáb), Dom = rest.
# methodology_group_id: 1=fuerza-base 2=plio 3=ergo 4=run 5=z2 6=wod 8=core 9=funcional
# ════════════════════════════════════════════════════════════════════════════

def week2_balanced():
    return [
        Session("Test ergómetros (Remo + SkiErg)",
            "CAPA1 — TEST DE ERGÓMETROS (Remo + SkiErg). Día clave: fija los ritmos de remo y ski para series y competición.",
            "12-15': 3' Ski + 3' Remo suaves + activación", "Trote suave 5'", 3, "intervals",
            ergo_test_blocks()),
        Session("Fuerza tracción/empuje + WOD corto metabólico",
            "CAPA1 — Fuerza tracción/empuje + WOD corto metabólico.",
            "Movilidad hombro + activación escapular", "Movilidad 5'", 9, "circuit", [
            Block("circuit", "A · Pull-ups/Dips", [
                Seg(EX["pull_up"], strength([10,10,8,8,6,4], None), pj_sets(6), "6 rounds Pull-ups 10-10-8-8-6-4"),
                Seg(EX["dip"], strength([10,10,8,8,6,4], None), pj_sets(6), "6 rounds Dips 10-10-8-8-6-4"),
            ]),
            Block("for_time", "B · WOD For Time (TC 12') 4 rounds", [
                Seg(EX["kb_oh_lunge"], p_rounds(rounds=4, target=t_kg(24)),
                    {"rounds": 4, "distance_meters": 10, "weight_kg": 24},
                    "4 rounds: 10m KB OH walking lunge 24kg"),
                Seg(EX["thruster"], p_rounds(rounds=4, target=t_kg(40)),
                    {"rounds": 4, "reps": 5, "weight_kg": 40}, "5 thrusters 40kg"),
                Seg(EX["power_clean"], p_rounds(rounds=4, target=t_kg(40)),
                    {"rounds": 4, "reps": 3, "weight_kg": 40}, "3 clean 40kg"),
                Seg(EX["toes_to_bar"], p_rounds(rounds=4, target=t_bw()),
                    {"rounds": 4, "reps": 10}, "10 TTB. Time cap 12'"),
            ]),
        ]),
        Session("Series de carrera en pista",
            "CAPA1 — Series de carrera en pista (volumen de calidad a ritmos del test de carrera).",
            "2km warm up + técnica", "1km cool down", 4, "intervals", [
            Block("tempo", "Calentamiento", [
                Seg(EX["run"], p_steady(dist_m=2000, target=t_rpe(v=4)), pj_dist(2000), "2km warm up RPE4"),
                Seg(EX["run_drills"], p_steady(300), pj_time(300), "Técnica de carrera 5'"),
            ]),
            Block("intervals", "Series (ritmo objetivo HYROX)", [
                Seg(EX["run"], p_sets([sset(measure=m_dist(1200), rest_s=105) for _ in range(2)],
                    note="Ritmo objetivo HYROX o algo por encima"),
                    pj_sets(2, rest=105, t=None), "2x1200m (1'45\" rest). Ritmo objetivo HYROX"),
                Seg(EX["run"], p_sets([sset(measure=m_dist(1000), rest_s=90)],
                    note="Ritmo objetivo HYROX"),
                    {"sets": 1, "rest_seconds": 90, "distance_meters": 1000}, "1x1000m (1'30\" rest)"),
                Seg(EX["run"], p_sets([sset(measure=m_dist(800), rest_s=60) for _ in range(2)],
                    note="Ritmo objetivo HYROX"),
                    pj_sets(2, rest=60), "2x800m (1' rest)"),
                Seg(EX["run"], p_sets([sset(measure=m_dist(400), rest_s=45) for _ in range(2)],
                    note="Ritmo objetivo HYROX"),
                    pj_sets(2, rest=45), "2x400m (45\" rest)"),
            ]),
            Block("tempo", "Vuelta a la calma", [
                Seg(EX["run"], p_steady(dist_m=1000, target=t_zone(v=2)), pj_dist(1000), "1km cool down Z2"),
            ]),
        ]),
        Session("Día largo aeróbico mixto Z2",
            "CAPA1 — Día largo aeróbico MIXTO Z2.",
            "Trote suave", "Trote suave", 5, "tempo", [
            Block("tempo", "Aeróbico Z2 mixto", [
                Seg(EX["run"], p_steady(3000, target=t_zone(v=2)), pj_time(3000), "50' carrera Z2 RPE3-4"),
                Seg(EX["row"], p_steady(1500, target=t_zone(v=2)), pj_time(1500), "25' row/ski Z2 RPE3-4"),
            ]),
        ]),
        Session("Threshold en cinta (umbral)",
            "CAPA1 — Threshold en cinta (umbral) por RPE/ritmo del test de 9'.",
            "5' RPE3-4 + 1' rest", "5' cool down", 4, "intervals", [
            Block("tempo", "Calentamiento", [
                Seg(EX["run"], p_steady(300, target=t_rpe(mn=3, mx=4)), pj_time(300), "5' RPE3-4"),
            ]),
            Block("intervals", "Threshold 5x6' RPE8", [
                Seg(EX["run"], p_interval(rounds=5, work_s=360, rest_s=120, target=t_rpe(v=8)),
                    pj_sets(5, rest=120, t=360), "5x6' RPE8 / 2' rest estático. Inclinación 1. Ritmo test 9'"),
            ]),
            Block("tempo", "Vuelta a la calma", [
                Seg(EX["run"], p_steady(300, target=t_zone(v=2)), pj_time(300), "5' cool down Z2"),
            ]),
        ]),
        Session("Fuerza tren inferior (cadena posterior) + pliometría",
            "CAPA1 — Fuerza tren inferior (peso muerto/hip thrust) + pliometría.",
            "Movilidad cadera + activación", "Movilidad 5'", 1, "strength_block", [
            Block("strength_block", "A · Deadlift", [
                Seg(EX["deadlift"], strength([10,10,8,6,4], 120),
                    pj_sets(5, rest=120), "5 rounds Deadlift 10/10/8/6/4 / 2' rest"),
            ]),
            Block("strength_block", "B · Hip Thrust", [
                Seg(EX["hip_thrust"], strength([10,10,8,8,6], None),
                    pj_sets(5), "5 rounds Hip Thrust 10/10/8/8/6"),
            ]),
            Block("intervals", "C · Pliometría", [
                Seg(EX["depth_jump"], p_rounds(rounds=8, rest_s=30, target=t_bw()),
                    pj_sets(8, rest=30, reps=1), "8 rounds: 1 DB depth jump / 30\" rest"),
                Seg(EX["broad_jump"], p_rounds(rounds=8, rest_s=30, target=t_bw()),
                    pj_sets(8, rest=30, reps=4), "8 rounds: 4 broad jump"),
            ]),
        ]),
    ]


def week3_balanced():
    return [
        Session("WOD largo mixto sled+ergo+carrera",
            "CAPA1 — WOD largo mixto sled+ergo+carrera (resistencia específica de base).",
            "Movilidad general + activación", "Trote suave 5'", 6, "for_time", [
            Block("for_time", "A · For Time 3 rounds sled+ski (TC 55')", [
                Seg(EX["sled_push"], p_rounds(rounds=3, target=t_kg(170)),
                    {"rounds": 3, "distance_meters": 25, "weight_kg": 170}, "3 rounds: 25m sled push 170kg"),
                Seg(EX["ski"], p_rounds(rounds=3, target=t_rpe(v=8)),
                    {"rounds": 3, "distance_meters": 500}, "3 rounds: 500m ski"),
            ]),
            Block("for_time", "B · 3 rounds sled+row", [
                Seg(EX["sled_pull"], p_rounds(rounds=3, target=t_kg(140)),
                    {"rounds": 3, "distance_meters": 25, "weight_kg": 140}, "3 rounds: 25m sled pull 140kg"),
                Seg(EX["row"], p_rounds(rounds=3, target=t_rpe(v=8)),
                    {"rounds": 3, "distance_meters": 500}, "3 rounds: 500m row"),
            ]),
            Block("for_time", "C · Run + carries", [
                Seg(EX["run"], p_sets([sset(measure=m_dist(1200)), sset(measure=m_dist(800)), sset(measure=m_dist(400))],
                    note="1200/800/400m intercalando KB OH lunge y farmer carry"),
                    {"sets": 3}, "1200m / 800m / 400m run intercalando KB OH lunge y farmer carry"),
            ]),
            Block("for_time", "Finisher", [
                Seg(EX["wall_balls"], p_sets([sset(measure=m_reps(75), target=t_kg(9))]),
                    {"reps": 75, "weight_kg": 9}, "Finisher 75 wall ball 9kg"),
            ]),
        ]),
        Session("Pliometría + ergómetro de umbral",
            "CAPA1 — Pliometría + ergómetro de umbral (volumen).",
            "Movilidad + activación", "7' cool down", 2, "intervals", [
            Block("intervals", "A · Pliometría", [
                Seg(EX["depth_jump"], p_rounds(rounds=8, rest_s=30, target=t_bw()),
                    pj_sets(8, rest=30, reps=1), "8 rounds: 1 DB depth jump / 30\" rest"),
                Seg(EX["broad_jump"], p_rounds(rounds=8, rest_s=30, target=t_bw()),
                    pj_sets(8, rest=30, reps=4), "8 rounds: 4 broad jump"),
            ]),
            Block("intervals", "B · SkiErg umbral 5x4'", [
                Seg(EX["ski"], p_interval(rounds=5, work_s=240, rest_s=55, target=t_rpe(v=8)),
                    pj_sets(5, rest=55, t=240), "Directo a: SkiErg 5x4' RPE8 / 55\" rest"),
            ]),
            Block("tempo", "Vuelta a la calma", [
                Seg(EX["bike"], p_steady(420, target=t_zone(v=2)), pj_time(420), "7' cool down bike Z2"),
            ]),
        ]),
        Session("Threshold en cinta por bloques con sled",
            "CAPA1 — Threshold en cinta por bloques con sled (transferencia HYROX).",
            "Movilidad + 5' trote", "5' cool down", 4, "intervals", [
            Block("intervals", "Bloque 1 · Umbral 3x5'", [
                Seg(EX["run"], p_interval(rounds=3, work_s=300, rest_s=90, target=t_rpe(v=8)),
                    pj_sets(3, rest=90, t=300), "3x5' a ritmo test 9' / 90\" float"),
            ]),
            Block("for_time", "Bloque 2 · Run + sled + burpee (x3)", [
                Seg(EX["run"], p_rounds(rounds=3, work_s=120, target=t_rpe(v=8)),
                    pj_sets(3, t=120), "2' a ritmo (x3)"),
                Seg(EX["sled_push"], p_rounds(rounds=3, target=t_kg(150)),
                    {"rounds": 3, "distance_meters": 60, "weight_kg": 150}, "60m sled push 150kg (x3)"),
                Seg(EX["burpee_broad_jump"], p_rounds(rounds=3, target=t_bw()),
                    {"rounds": 3, "reps": 6}, "burpee BBJ (x3)"),
            ]),
            Block("for_time", "Bloque 3 · Run + sled (x3)", [
                Seg(EX["run"], p_rounds(rounds=3, work_s=60, target=t_rpe(v=9)),
                    pj_sets(3, t=60), "1' fuerte (x3)"),
                Seg(EX["sled_push"], p_rounds(rounds=3, target=t_kg(150)),
                    {"rounds": 3, "distance_meters": 30, "weight_kg": 150}, "30m sled (x3)"),
            ]),
        ]),
        Session("Fuerza empuje + ergómetro",
            "CAPA1 — Fuerza empuje + ergómetro.",
            "Movilidad hombro + activación", "Movilidad 5'", 1, "strength_block", [
            Block("strength_block", "A · Bench Press", [
                Seg(EX["bench"], strength([10,10,8,6,6], 120),
                    pj_sets(5, rest=120), "5 rounds Bench Press 10/10/8/6/6 / 2' rest"),
            ]),
            Block("strength_block", "B · Aperturas polea", [
                Seg(EX["cable_fly"], strength([12,12,10,10], None),
                    pj_sets(4), "Aperturas en polea 12-12-10-10"),
            ]),
            Block("intervals", "C · Row umbral 5x4'", [
                Seg(EX["row"], p_interval(rounds=5, work_s=240, rest_s=55, target=t_rpe(v=8)),
                    pj_sets(5, rest=55, t=240), "Row 5x4' RPE8 / 55\""),
            ]),
        ]),
        Session("Tempo run + fuerza de piernas",
            "CAPA1 — Tempo run + fuerza de piernas (doble estímulo).",
            "Movilidad + 5' trote", "Trote suave", 4, "intervals", [
            Block("intervals", "A · Tempo Z2-Z3-Z2", [
                Seg(EX["run"], p_steady(1200, target=t_zone(v=2)), pj_time(1200), "20' Z2"),
                Seg(EX["run"], p_steady(1200, target=t_zone(v=3)), pj_time(1200), "20' Z3 alta"),
                Seg(EX["run"], p_steady(1200, target=t_zone(v=2)), pj_time(1200), "20' Z2"),
            ]),
            Block("strength_block", "B · Front Squat", [
                Seg(EX["front_squat"], strength([10,10,8,6], None),
                    pj_sets(4), "Directo a: Front squat 4 rounds 10-10-8-6"),
            ]),
            Block("strength_block", "C · Complex barra", [
                Seg(EX["ohp"], p_sets([sset(measure=m_reps(1))], note="Complex: shoulder press"),
                    {"reps": 1}, "Complex (x rounds): shoulder press"),
                Seg(EX["push_press"], p_sets([sset(measure=m_reps(1))], note="+ push press"),
                    {"reps": 1}, "+ push press"),
                Seg(EX["front_squat"], p_sets([sset(measure=m_reps(1))], note="+ front squat"),
                    {"reps": 1}, "+ front squat"),
                Seg(EX["thruster"], p_sets([sset(measure=m_reps(1))], note="+ thruster"),
                    {"reps": 1}, "+ thruster"),
            ]),
        ]),
        Session("Fuerza hombro + día largo Z2",
            "CAPA1 — Fuerza hombro + día largo Z2 controlado.",
            "Movilidad hombro + activación", "Trote suave", 1, "strength_block", [
            Block("strength_block", "A · Shoulder Press", [
                Seg(EX["ohp"], strength([10,8,8,6,4], None, pct_min=65, pct_max=85),
                    {"sets": 5, "load_pct_range": "65-85"}, "5 rounds Shoulder Press 10/8/8/6/4 / 65-85%"),
            ]),
            Block("tempo", "B · Run largo Z2", [
                # "1h15' Z2, no más rápido de 6'/km": Z2 is the intensity zone, 6'/km
                # is an absolute pace CEILING. The model carries one target/segment;
                # the absolute, parseable pace cap (per the task's pace-parsing rule)
                # is the structured target here, with the Z2 zone kept in the note.
                Seg(EX["run"], p_steady(4500, target=t_pace_per_km(max_s=360),
                    note="Z2 RPE3-4"),
                    pj_time(4500), "Run 1h15' Z2 (no más rápido de 6'/km)"),
            ]),
        ]),
    ]


def week2_endurance():
    return [
        Session("Test ergómetros (Remo + SkiErg)",
            "CAPA1 — TEST DE ERGÓMETROS (Remo + SkiErg). Fija ritmos de remo y ski.",
            "12-15': 3' Ski + 3' Remo suaves + activación", "Trote suave 5'", 3, "intervals",
            ergo_test_blocks()),
        Session("Fuerza tracción/empuje en MANTENIMIENTO",
            "CAPA1 — [=] Fuerza tracción/empuje EN MANTENIMIENTO (volumen bajo). Conservar fuerza, no buscar progresión.",
            "Movilidad hombro + activación", "Movilidad 5'", 1, "strength_block", [
            Block("strength_block", "A · Bench (mant.)", [
                Seg(EX["bench"], strength([8,6,6], None, pct_min=70, pct_max=75),
                    {"sets": 3, "load_pct_range": "70-75"}, "[=] 3 rounds Bench 8/6/6 @70-75%. Conservar fuerza"),
            ]),
            Block("strength_block", "B · Pull-ups (mant.)", [
                Seg(EX["pull_up"], strength([8,6,6], None),
                    pj_sets(3), "[=] 3 rounds Pull-ups 8/6/6"),
            ]),
        ]),
        Session("Series de carrera en pista (volumen +)",
            "CAPA1 — [+] SERIES DE CARRERA en pista (mayor volumen que en la general).",
            "2km warm up + técnica", "1km cool down", 4, "intervals", [
            Block("tempo", "Calentamiento", [
                Seg(EX["run"], p_steady(dist_m=2000, target=t_rpe(v=4)), pj_dist(2000), "2km warm up"),
            ]),
            Block("intervals", "Series (volumen +)", [
                Seg(EX["run"], p_sets([sset(measure=m_dist(1000), rest_s=90) for _ in range(3)],
                    note="Más repeticiones que en la general"),
                    pj_sets(3, rest=90), "3x1000m (1'30\" rest)"),
                Seg(EX["run"], p_sets([sset(measure=m_dist(800), rest_s=75) for _ in range(3)]),
                    pj_sets(3, rest=75), "3x800m (1'15\" rest)"),
                Seg(EX["run"], p_sets([sset(measure=m_dist(400), rest_s=45) for _ in range(2)]),
                    pj_sets(2, rest=45), "2x400m (45\" rest)"),
            ]),
            Block("tempo", "Vuelta a la calma", [
                Seg(EX["run"], p_steady(dist_m=1000, target=t_zone(v=2)), pj_dist(1000), "1km cool down Z2"),
            ]),
        ]),
        Session("Threshold en cinta",
            "CAPA1 — [+] THRESHOLD en cinta: estímulo aeróbico de calidad.",
            "5' RPE3-4 + 1' rest", "5' cool down", 4, "intervals", [
            Block("tempo", "Calentamiento", [
                Seg(EX["run"], p_steady(300, target=t_rpe(mn=3, mx=4)), pj_time(300), "5' RPE3-4"),
            ]),
            Block("intervals", "Threshold 5x6' RPE8", [
                Seg(EX["run"], p_interval(rounds=5, work_s=360, rest_s=120, target=t_rpe(v=8)),
                    pj_sets(5, rest=120, t=360), "[+] 5x6' RPE8 / 2' rest estático. Inclinación 1"),
            ]),
            Block("tempo", "Vuelta a la calma", [
                Seg(EX["run"], p_steady(300, target=t_zone(v=2)), pj_time(300), "5' cool down Z2"),
            ]),
        ]),
        Session("Ergómetros de umbral",
            "CAPA1 — [+] Ergómetros de umbral (segundo día de calidad aeróbica).",
            "Activación ergómetros", "10' bike Z2", 3, "intervals", [
            Block("intervals", "A · Row umbral 5x3'", [
                Seg(EX["row"], p_interval(rounds=5, work_s=180, rest_s=60, target=t_rpe(v=8)),
                    pj_sets(5, rest=60, t=180), "[+] Row 5x3' RPE8 / 1' rest"),
            ]),
            Block("intervals", "B · Ski umbral 4x3'", [
                Seg(EX["ski"], p_interval(rounds=4, work_s=180, rest_s=60, target=t_rpe(v=8)),
                    pj_sets(4, rest=60, t=180), "Ski 4x3' RPE8 / 1' rest"),
            ]),
            Block("tempo", "Vuelta a la calma", [
                Seg(EX["bike"], p_steady(600, target=t_zone(v=2)), pj_time(600), "10' bike Z2 cool down"),
            ]),
        ]),
        Session("Día largo mixto Z2 (ampliado)",
            "CAPA1 — [+] DÍA LARGO aeróbico MIXTO Z2 AMPLIADO.",
            "Trote suave", "6x30\" strides al final", 5, "tempo", [
            Block("tempo", "Aeróbico Z2 mixto (ampliado)", [
                Seg(EX["run"], p_steady(4200, target=t_zone(v=2)), pj_time(4200), "[+] 70' carrera Z2 RPE3-4"),
                Seg(EX["row"], p_steady(1800, target=t_zone(v=2)), pj_time(1800), "30' row/ski Z2"),
            ]),
            Block("intervals", "Strides", [
                Seg(EX["run"], p_interval(rounds=6, work_s=30, target=t_rpe(v=7)),
                    pj_sets(6, t=30), "6x30\" strides al final"),
            ]),
        ]),
    ]


def week3_endurance():
    return [
        Session("Fartlek de intensidad creciente",
            "CAPA1 — [+] Fartlek de intensidad creciente (puente hacia calidad).",
            "10' warm up easy + 2' caminando", "5' cool down", 4, "intervals", [
            Block("tempo", "Calentamiento", [
                Seg(EX["run"], p_steady(600, target=t_rpe(v=4)), pj_time(600), "10' warm up easy"),
                Seg(EX["walk"], p_steady(120), pj_time(120), "2' caminando"),
            ]),
            Block("intervals", "Fartlek 5x(5'Z4 / 1'Z2)", [
                Seg(EX["run"], p_sets([sset(measure=m_dur(300), target=t_zone(v=4), rest_s=60) for _ in range(5)],
                    note="Usar ritmos del test 9'. Recuperación 1' Z2"),
                    pj_sets(5, rest=60, t=300), "[+] 5x(5' Z4 RPE7-8 / 1' Z2). Ritmos test 9'"),
            ]),
            Block("tempo", "Vuelta a la calma", [
                Seg(EX["run"], p_steady(300, target=t_zone(v=2)), pj_time(300), "5' cool down Z2"),
            ]),
        ]),
        Session("Fuerza tren inferior en MANTENIMIENTO + core",
            "CAPA1 — [=] Fuerza tren inferior EN MANTENIMIENTO + core.",
            "Movilidad cadera + activación", "Movilidad 5'", 1, "strength_block", [
            Block("strength_block", "A · Front Squat (mant.)", [
                Seg(EX["front_squat"], strength([8,6,6], None, pct_min=70, pct_max=75),
                    {"sets": 3, "load_pct_range": "70-75"}, "[=] 3 rounds Front Squat 8/6/6 @70-75%"),
            ]),
            Block("strength_block", "B · RDL (mant.)", [
                Seg(EX["rdl"], strength([10,8,8], None),
                    pj_sets(3), "[=] 3 rounds RDL 10/8/8"),
            ]),
            Block("circuit", "C · Core", [
                Seg(EX["side_plank"], p_interval(rounds=4, work_s=40, target=t_bw()),
                    pj_sets(4, t=40), "Plancha lateral 4x40\""),
                Seg(EX["dead_bug"], p_sets([sset(measure=m_reps(10), target=t_bw()) for _ in range(4)]),
                    pj_sets(4, reps=10), "Dead bug 4x10"),
            ]),
        ]),
        Session("Series largas de carrera",
            "CAPA1 — [+] SERIES LARGAS de carrera (mayor volumen de calidad).",
            "2km warm up", "1km cool down", 4, "intervals", [
            Block("tempo", "Calentamiento", [
                Seg(EX["run"], p_steady(dist_m=2000, target=t_rpe(v=4)), pj_dist(2000), "2km warm up"),
            ]),
            Block("intervals", "Series largas", [
                Seg(EX["run"], p_sets([sset(measure=m_dist(1200), rest_s=105) for _ in range(4)],
                    note="Ritmo objetivo o algo por encima"),
                    pj_sets(4, rest=105), "[+] 4x1200m (1'45\" rest)"),
                Seg(EX["run"], p_sets([sset(measure=m_dist(800), rest_s=75) for _ in range(2)]),
                    pj_sets(2, rest=75), "2x800m (1'15\" rest)"),
            ]),
            Block("tempo", "Vuelta a la calma", [
                Seg(EX["run"], p_steady(dist_m=1000, target=t_zone(v=2)), pj_dist(1000), "1km cool down Z2"),
            ]),
        ]),
        Session("Carrera larga Z2",
            "CAPA1 — [+] CARRERA LARGA Z2 (gran bloque aeróbico).",
            "Trote suave", "Trote suave", 5, "tempo", [
            Block("tempo", "Carrera larga Z2", [
                Seg(EX["run"], p_steady(5100, target=t_zone(v=2),
                    note="Terreno variado"),
                    pj_time(5100), "[+] 1h25' Z2 RPE3-4. Terreno variado"),
            ]),
        ]),
        Session("Ergómetros de umbral largos + threshold",
            "CAPA1 — [+] Ergómetros de umbral largos + threshold.",
            "Activación ergómetros", "Trote suave", 3, "intervals", [
            Block("intervals", "A · Row umbral 6x3'", [
                Seg(EX["row"], p_interval(rounds=6, work_s=180, rest_s=60, target=t_rpe(v=8)),
                    pj_sets(6, rest=60, t=180), "[+] Row 6x3' RPE8 / 1'"),
            ]),
            Block("intervals", "B · Ski umbral 5x3'", [
                Seg(EX["ski"], p_interval(rounds=5, work_s=180, rest_s=60, target=t_rpe(v=8)),
                    pj_sets(5, rest=60, t=180), "Ski 5x3' RPE8 / 1'"),
            ]),
            Block("intervals", "C · Threshold cinta 4x6'", [
                Seg(EX["run"], p_interval(rounds=4, work_s=360, rest_s=120, target=t_rpe(v=8)),
                    pj_sets(4, rest=120, t=360), "+ 4x6' cinta RPE8 / 2'"),
            ]),
        ]),
        Session("Día largo mixto Z2 (pico)",
            "CAPA1 — [+] DÍA LARGO MIXTO Z2 (pico de volumen aeróbico semanal). Mayor volumen del bloque.",
            "Trote suave", "6x30\" strides", 5, "tempo", [
            Block("tempo", "Aeróbico Z2 mixto (pico)", [
                Seg(EX["run"], p_steady(4800, target=t_zone(v=2)), pj_time(4800), "[+] 80' carrera Z2"),
                Seg(EX["bike"], p_steady(1800, target=t_zone(v=2)), pj_time(1800), "30' bike Z2"),
            ]),
            Block("intervals", "Strides", [
                Seg(EX["run"], p_interval(rounds=6, work_s=30, target=t_rpe(v=7)),
                    pj_sets(6, t=30), "6x30\" strides. Mayor volumen del bloque"),
            ]),
        ]),
    ]

# Endurance Sunday is NOT rest (bike Z1 regen). Handle as a 7th session for Res S3.
RES_S3_SUNDAY = Session("Bike Z1 regenerativo",
    "CAPA1 — Bike Z1 regenerativo.",
    "Suave", "Movilidad", 5, "tempo", [
        Block("tempo", "Bike regenerativo", [
            Seg(EX["bike"], p_steady(3600, target=t_zone(v=1), note="RPE1-2"),
                pj_time(3600), "1h Z1 RPE1-2 + movilidad"),
        ]),
    ])


def week2_strength():
    return [
        Session("Test ergómetros (Remo + SkiErg)",
            "CAPA1 — TEST DE ERGÓMETROS (Remo + SkiErg). Fija ritmos de remo y ski.",
            "12-15': 3' Ski + 3' Remo suaves + activación", "Trote suave 5'", 3, "intervals",
            ergo_test_blocks()),
        Session("Fuerza tren inferior pesada",
            "CAPA1 — [+] FUERZA TREN INFERIOR pesada (progresión).",
            "Movilidad cadera + activación", "Movilidad 5'", 1, "strength_block", [
            Block("strength_block", "A · Front Squat pesado", [
                Seg(EX["front_squat"], strength([6,6,4,4,3], 150, pct_min=75, pct_max=85),
                    {"sets": 5, "rest_seconds": 150, "load_pct_range": "75-85"},
                    "[+] 5 rounds Front Squat 6/6/4/4/3 @75-85% / 2'30\""),
            ]),
            Block("strength_block", "B · Walking lunge con barra", [
                Seg(EX["walking_lunge"], p_sets([sset(measure=m_reps(10)) for _ in range(4)]),
                    pj_sets(4, reps=10), "4 rounds Walking lunge con barra 10/lado"),
            ]),
            Block("strength_block", "C · Nordic curl", [
                Seg(EX["nordic_curl"], strength([6,6,5,5], None),
                    pj_sets(4), "4 rounds Nordic curl 6-6-5-5"),
            ]),
        ]),
        Session("Carrera en MANTENIMIENTO",
            "CAPA1 — [=] Carrera EN MANTENIMIENTO: series cortas para no perder velocidad.",
            "2km warm up", "1km cool down", 4, "intervals", [
            Block("tempo", "Calentamiento", [
                Seg(EX["run"], p_steady(dist_m=2000, target=t_rpe(v=4)), pj_dist(2000), "2km warm up"),
            ]),
            Block("intervals", "Series cortas (mant.)", [
                Seg(EX["run"], p_sets([sset(measure=m_dist(400), rest_s=60) for _ in range(6)],
                    note="A ritmo del test. Corto, solo mantener velocidad"),
                    pj_sets(6, rest=60), "[=] 6x400m / 1' rest a ritmo del test"),
            ]),
            Block("tempo", "Vuelta a la calma", [
                Seg(EX["run"], p_steady(dist_m=1000, target=t_zone(v=2)), pj_dist(1000), "1km cool down Z2"),
            ]),
        ]),
        Session("Sled work pesado + estaciones de fuerza",
            "CAPA1 — [+] SLED WORK pesado + estaciones de fuerza específica.",
            "Activación + movilidad", "Movilidad 5'", 7, "for_time", [
            Block("for_time", "A · Sled push/pull 5 rounds", [
                Seg(EX["sled_push"], p_rounds(rounds=5, rest_s=90, target=t_kg(170)),
                    {"rounds": 5, "rest_seconds": 90, "distance_meters": 25, "weight_kg": 170},
                    "[+] 5 rounds: 25m sled push 170kg / 90\" rest"),
                Seg(EX["sled_pull"], p_rounds(rounds=5, rest_s=90, target=t_kg(150)),
                    {"rounds": 5, "rest_seconds": 90, "distance_meters": 25, "weight_kg": 150},
                    "25m sled pull 150kg"),
            ]),
            Block("for_time", "B · Carries + cleans 4 rounds", [
                Seg(EX["farmer_carry"], p_rounds(rounds=4, target=t_kg(64)),
                    {"rounds": 4, "distance_meters": 20, "weight_kg": 64},
                    "4 rounds: 20m farmer carry 2x32kg"),
                Seg(EX["sandbag_clean"], p_rounds(rounds=4, target=t_kg(30)),
                    {"rounds": 4, "reps": 10, "weight_kg": 30}, "10 sandbag clean 30kg"),
            ]),
        ]),
        Session("Fuerza tren superior (volumen)",
            "CAPA1 — [+] FUERZA TREN SUPERIOR (empuje/tracción) con volumen.",
            "Movilidad hombro + activación", "Movilidad 5'", 1, "strength_block", [
            Block("strength_block", "A · Bench Press", [
                Seg(EX["bench"], strength([10,8,8,6], None, pct_min=70, pct_max=80),
                    {"sets": 4, "load_pct_range": "70-80"}, "[+] 4 rounds Bench Press 10/8/8/6 @70-80%"),
            ]),
            Block("circuit", "B · Pull-ups", [
                Seg(EX["pull_up"], strength([10,8,8,6], None),
                    pj_sets(4), "4 rounds Pull-ups 10/8/8/6"),
            ]),
            Block("circuit", "C · Dips", [
                Seg(EX["dip"], strength([12,10,10,8], None),
                    pj_sets(4), "4 rounds Dips 12/10/10/8"),
            ]),
            Block("circuit", "D · Core", [
                Seg(EX["plank"], p_interval(rounds=4, work_s=45, target=t_bw()),
                    pj_sets(4, t=45), "Core: plancha 4x45\""),
            ]),
        ]),
        Session("Fuerza-potencia + WOD HYROX",
            "CAPA1 — [+] FUERZA-POTENCIA + WOD específico HYROX.",
            "Activación + movilidad", "Trote suave", 2, "for_time", [
            Block("emom", "A · Fuerza-potencia 5 rounds c/2'", [
                Seg(EX["hang_power_clean"], p_rounds(rounds=5, work_s=120, target=t_pct(mn=70, mx=80)),
                    {"rounds": 5, "reps": 3, "load_pct_range": "70-80"},
                    "[+] 5 rounds c/2': 3 Hang Clean 70-80%"),
                Seg(EX["box_jump_plyo"], p_rounds(rounds=5, work_s=120, target=t_bw()),
                    {"rounds": 5, "reps": 6}, "6 box jump"),
            ]),
            Block("for_time", "B · WOD 3 rounds", [
                Seg(EX["thruster"], p_rounds(rounds=3, target=t_kg(40)),
                    {"rounds": 3, "reps": 15, "weight_kg": 40}, "WOD 3 rounds: 15 thrusters 40kg"),
                Seg(EX["burpee_broad_jump"], p_rounds(rounds=3, target=t_bw()),
                    {"rounds": 3, "reps": 12}, "12 burpee BBJ"),
                Seg(EX["run"], p_rounds(rounds=3, target=t_rpe(v=8)),
                    {"rounds": 3, "distance_meters": 200}, "200m run"),
            ]),
        ]),
    ]


def week3_strength():
    return [
        Session("Fuerza inferior pesada (pico)",
            "CAPA1 — [+] FUERZA INFERIOR pesada (máximo del bloque, cargas altas).",
            "Movilidad cadera + activación", "Movilidad 5'", 1, "strength_block", [
            Block("strength_block", "A · Back Squat pico", [
                Seg(EX["back_squat"], strength([5,5,3,3,2], 180, pct_min=80, pct_max=88),
                    {"sets": 5, "rest_seconds": 180, "load_pct_range": "80-88"},
                    "[+] 5 rounds Back Squat 5/5/3/3/2 @80-88% / 3' rest. Cargas máximas del bloque"),
            ]),
            Block("strength_block", "B · Hip Thrust pesado", [
                Seg(EX["hip_thrust"], strength([8,6,6,4], None),
                    pj_sets(4), "4 rounds Hip Thrust 8/6/6/4 pesado"),
            ]),
            Block("strength_block", "C · Bulgarian split squat", [
                Seg(EX["bulgarian"], p_sets([sset(measure=m_reps(8)) for _ in range(3)]),
                    pj_sets(3, reps=8), "3 rounds Bulgarian split squat 8/lado"),
            ]),
        ]),
        Session("Fuerza-potencia + WOD HYROX",
            "CAPA1 — [+] FUERZA-POTENCIA + WOD específico HYROX intenso.",
            "Activación + movilidad", "Trote suave", 2, "for_time", [
            Block("emom", "A · Fuerza-potencia 6 rounds c/2'", [
                Seg(EX["power_clean"], p_rounds(rounds=6, work_s=120, target=t_pct(mn=75, mx=82)),
                    {"rounds": 6, "reps": 3, "load_pct_range": "75-82"},
                    "[+] 6 rounds c/2': 3 Power Clean 75-82%"),
                Seg(EX["box_jump_plyo"], p_rounds(rounds=6, work_s=120, target=t_bw()),
                    {"rounds": 6, "reps": 5}, "5 high box jump"),
            ]),
            Block("for_time", "B · WOD 4 rounds", [
                Seg(EX["sled_push"], p_rounds(rounds=4, target=t_kg(170)),
                    {"rounds": 4, "distance_meters": 25, "weight_kg": 170}, "WOD 4 rounds: 25m sled push 170kg"),
                Seg(EX["wall_balls"], p_rounds(rounds=4, target=t_kg(9)),
                    {"rounds": 4, "reps": 12, "weight_kg": 9}, "12 wall ball"),
                Seg(EX["walking_lunge"], p_rounds(rounds=4, target=t_kg(30)),
                    {"rounds": 4, "reps": 10, "weight_kg": 30}, "10 walking lunge 30kg"),
            ]),
        ]),
        Session("Carrera en MANTENIMIENTO",
            "CAPA1 — [=] Carrera EN MANTENIMIENTO: rodaje Z2 corto.",
            "Trote suave", "6x20\" strides", 5, "tempo", [
            Block("tempo", "Rodaje Z2", [
                Seg(EX["run"], p_steady(2700, target=t_zone(v=2),
                    note="Conservar base, no fatigar piernas"),
                    pj_time(2700), "[=] 45' Z2 RPE3-4. Conservar base"),
            ]),
            Block("intervals", "Strides", [
                Seg(EX["run"], p_interval(rounds=6, work_s=20, target=t_rpe(v=7)),
                    pj_sets(6, t=20), "6x20\" strides"),
            ]),
        ]),
        Session("Sled pesado + carries (pico)",
            "CAPA1 — [+] SLED pesado + carries (fuerza específica máxima).",
            "Activación + movilidad", "Movilidad 5'", 7, "for_time", [
            Block("for_time", "A · Sled push/pull 6 rounds", [
                Seg(EX["sled_push"], p_rounds(rounds=6, rest_s=90, target=t_kg(190)),
                    {"rounds": 6, "rest_seconds": 90, "distance_meters": 25, "weight_kg": 190},
                    "[+] 6 rounds: 25m sled push 190kg / 90\""),
                Seg(EX["sled_pull"], p_rounds(rounds=6, rest_s=90, target=t_kg(160)),
                    {"rounds": 6, "rest_seconds": 90, "distance_meters": 25, "weight_kg": 160},
                    "25m sled pull 160kg"),
            ]),
            Block("for_time", "B · Carries + cleans 4 rounds", [
                Seg(EX["farmer_carry"], p_rounds(rounds=4, target=t_kg(72)),
                    {"rounds": 4, "distance_meters": 25, "weight_kg": 72},
                    "4 rounds: 25m farmer carry 2x36kg"),
                Seg(EX["sandbag_clean"], p_rounds(rounds=4, target=t_kg(35)),
                    {"rounds": 4, "reps": 8, "weight_kg": 35}, "8 sandbag clean 35kg"),
            ]),
        ]),
        Session("Fuerza tren superior pesada + core",
            "CAPA1 — [+] FUERZA TREN SUPERIOR pesada + core.",
            "Movilidad hombro + activación", "Movilidad 5'", 1, "strength_block", [
            Block("strength_block", "A · Shoulder Press pesado", [
                Seg(EX["ohp"], strength([6,6,4,4,3], None, pct_min=78, pct_max=88),
                    {"sets": 5, "load_pct_range": "78-88"}, "[+] 5 rounds Shoulder Press 6/6/4/4/3 @78-88%"),
            ]),
            Block("strength_block", "B · Weighted Pull-ups", [
                Seg(EX["weighted_pullup"], strength([6,5,5,4,4], None),
                    pj_sets(5), "5 rounds Weighted Pull-ups 6/5/5/4/4"),
            ]),
            Block("circuit", "C · Core", [
                Seg(EX["tgu"], p_sets([sset(measure=m_reps(4)) for _ in range(4)]),
                    pj_sets(4, reps=4), "Core: TGU 4x4/lado"),
                Seg(EX["plank"], p_interval(rounds=4, work_s=45, target=t_bw()),
                    pj_sets(4, t=45), "Plancha 4x45\""),
            ]),
        ]),
        Session("WOD chipper de fuerza-resistencia",
            "CAPA1 — [+] WOD largo de fuerza-resistencia (chipper con cargas).",
            "Activación + movilidad", "Trote suave", 6, "for_time", [
            Block("for_time", "Chipper (TC 30')", [
                Seg(EX["power_clean"], p_sets([
                    sset(measure=m_reps(30), target=t_kg(40)), sset(measure=m_reps(25), target=t_kg(40)),
                    sset(measure=m_reps(20), target=t_kg(40)), sset(measure=m_reps(15), target=t_kg(40))]),
                    {"weight_kg": 40}, "30-25-20-15 Power Clean 40kg. Time cap 30'"),
                Seg(EX["thruster"], p_sets([
                    sset(measure=m_reps(20), target=t_kg(22.5)), sset(measure=m_reps(15), target=t_kg(22.5)),
                    sset(measure=m_reps(10), target=t_kg(22.5)), sset(measure=m_reps(5), target=t_kg(22.5))]),
                    {"weight_kg": 22.5}, "20-15-10-5 DB Thrusters 22,5kg"),
                Seg(EX["box_jump_plyo"], p_sets([
                    sset(measure=m_reps(20), target=t_bw()), sset(measure=m_reps(15), target=t_bw()),
                    sset(measure=m_reps(10), target=t_bw()), sset(measure=m_reps(5), target=t_bw())]),
                    {}, "20-15-10-5 high box jump"),
                Seg(EX["wall_balls"], p_sets([sset(measure=m_reps(60), target=t_kg(9))]),
                    {"reps": 60, "weight_kg": 9}, "Finisher 60 wall ball"),
            ]),
        ]),
    ]

FUE_S3_SUNDAY = Session("Bike Z1 regenerativo",
    "CAPA1 — Bike Z1 regenerativo.",
    "Suave", "Movilidad", 5, "tempo", [
        Block("tempo", "Bike regenerativo", [
            Seg(EX["bike"], p_steady(3600, target=t_zone(v=1), note="RPE1-2"),
                pj_time(3600), "1h Z1 + movilidad"),
        ]),
    ])


# ── Variant registry ─────────────────────────────────────────────────────────
VARIANTS = [
    # (profile, week_number, name, focus_text, sessions, sunday_session_or_None, sheet)
    ("balanced", 2, "Semana 2 — Acumulación · Test ergómetros",
     "Microciclo de Carga + Test de ergómetros (ATR ACUMULACIÓN). Lunes fija ritmos de remo y ski (test 2'/2'). Martes fuerza tracción/empuje + WOD corto. Miércoles series de carrera en pista a ritmo objetivo HYROX. Jueves largo aeróbico mixto Z2. Viernes threshold en cinta. Sábado fuerza cadena posterior + pliometría. Domingo descanso completo.",
     week2_balanced(), None, "Semana 2"),
    ("balanced", 3, "Semana 3 — Acumulación",
     "Microciclo de Carga, pico de volumen (ATR ACUMULACIÓN). Lunes WOD largo mixto sled+ergo+carrera. Martes pliometría + ergómetro de umbral. Miércoles threshold en cinta por bloques con sled. Jueves fuerza empuje + ergómetro. Viernes tempo run + fuerza de piernas. Sábado fuerza hombro + largo Z2. Domingo descanso completo.",
     week3_balanced(), None, "Semana 3"),
    ("endurance_focus", 2, "Semana 2 — Acumulación · Test ergómetros · Resistencia",
     "Microciclo de Carga + Test de ergómetros (ATR ACUMULACIÓN) — variante RESISTENCIA (Perfil 2: fuerte, poca base aeróbica). Lunes test de ergómetros. Diferencias de perfil: martes fuerza tracción/empuje EN MANTENIMIENTO [=]; se AÑADEN estímulos aeróbicos [+] — miércoles series de carrera con más volumen, jueves threshold, viernes ergómetros de umbral, sábado largo mixto Z2 ampliado (70'+30'). Domingo descanso.",
     week2_endurance(), None, "Res S2"),
    ("endurance_focus", 3, "Semana 3 — Acumulación · Resistencia",
     "Microciclo de Carga, pico de volumen aeróbico (ATR ACUMULACIÓN) — variante RESISTENCIA (Perfil 2). Máximo volumen aeróbico del bloque. Lunes fartlek de intensidad creciente [+]. Martes fuerza inferior EN MANTENIMIENTO [=] + core. Miércoles series largas [+]. Jueves carrera larga Z2 (1h25') [+]. Viernes ergómetros de umbral largos + threshold [+]. Sábado largo mixto Z2 pico (80'+30') [+]. Domingo bike Z1 regenerativo.",
     week3_endurance(), RES_S3_SUNDAY, "Res S3"),
    ("strength_focus", 2, "Semana 2 — Acumulación · Test ergómetros · Fuerza",
     "Microciclo de Carga + Test de ergómetros (ATR ACUMULACIÓN) — variante FUERZA (Perfil 3: runner, poca fuerza). Lunes test de ergómetros. Diferencias de perfil: martes fuerza tren inferior PESADA [+], jueves sled work pesado + estaciones [+], viernes fuerza tren superior con volumen [+], sábado fuerza-potencia + WOD HYROX [+]; miércoles carrera EN MANTENIMIENTO [=] (series cortas). Domingo descanso.",
     week2_strength(), None, "Fue S2"),
    ("strength_focus", 3, "Semana 3 — Acumulación · Fuerza",
     "Microciclo de Carga, pico de fuerza (ATR ACUMULACIÓN) — variante FUERZA (Perfil 3). Máxima carga de fuerza del bloque. Lunes fuerza inferior pesada (5/5/3/3/2 @80-88%) [+]. Martes fuerza-potencia + WOD HYROX [+]. Miércoles carrera EN MANTENIMIENTO [=] (rodaje Z2 corto). Jueves sled pesado + carries pico [+]. Viernes fuerza superior pesada + core [+]. Sábado WOD chipper [+]. Domingo bike Z1 regenerativo.",
     week3_strength(), FUE_S3_SUNDAY, "Fue S3"),
]


# ── SQL emission ──────────────────────────────────────────────────────────────
def jq(obj):
    """jsonb literal — single-quote-escaped JSON."""
    return "'" + json.dumps(obj, ensure_ascii=False).replace("'", "''") + "'::jsonb"

def sq(s):
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def emit():
    out = []
    out.append("BEGIN;")
    out.append("-- ════ WEEKS 2 & 3 — HYROX 12-week plan · 3 athlete profiles ════")
    out.append("-- Generated by infra/scripts/build_weeks_2_3.py. Idempotent.")

    # 1) Idempotency: delete any prior wk2/3 rows (templates by meta source tag,
    #    program_week_templates by week_number, segments cascade by template).
    # Match exactly the source tags this script writes for weeks 2 & 3 (regex ~).
    # Tags are: "...· Semana 2/3 · <day>" (balanced) and "...· Res S2/S3 · <day>",
    # "...· Fue S2/S3 · <day>" (profile variants).
    src_re = r"Plantilla_HYROX_12sem · (Semana [23]|Res S[23]|Fue S[23]) ·"
    out.append("-- Idempotency: clear prior weeks-2/3 rows written by this script.")
    out.append(f"DELETE FROM template_segments WHERE template_id IN "
               f"(SELECT id FROM templates WHERE meta_json->>'source' ~ {sq(src_re)});")
    out.append("DELETE FROM program_week_templates WHERE week_number IN (2,3);")
    out.append(f"DELETE FROM templates WHERE meta_json->>'source' ~ {sq(src_re)};")
    # New exercises: delete-by-slug then insert (deterministic, prefixed).
    slugs = ",".join(sq(s) for _, s, *_ in NEW_EXERCISES)
    out.append(f"DELETE FROM exercises WHERE slug IN ({slugs});")

    # 2) New exercises.
    out.append("-- New exercises (genuinely absent in catalog).")
    for key, slug, name, cat, muscles, equip in NEW_EXERCISES:
        eid = EX[key]
        out.append(
            f"INSERT INTO exercises (id, slug, name, category, primary_muscle_groups, equipment, "
            f"default_metrics_json, source, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES "
            f"({eid}, {sq(slug)}, {sq(name)}, '{cat}', '{muscles}', '{equip}', "
            f"'{{\"reps\": true, \"sets\": true}}'::jsonb, 'plantilla_hyrox_w23', now(), now());")

    # 3) Templates + segments + program_week_templates per variant.
    tid = TEMPLATE_ID0
    sid = SEGMENT_ID0
    pwt = PWT_ID0
    seg_sheet_label = {"Semana 2": "Semana 2", "Semana 3": "Semana 3",
                       "Res S2": "Res S2", "Res S3": "Res S3",
                       "Fue S2": "Fue S2", "Fue S3": "Fue S3"}

    for (profile, wn, name, focus, sessions, sunday, sheet) in VARIANTS:
        all_sessions = list(sessions)
        days = list(DAY_POS)
        dows = list(DOW)
        if sunday is not None:
            all_sessions.append(sunday)
            days.append("sunday")
            dows.append(7)

        slot_days = []
        out.append(f"-- ── {name} ({profile}, week {wn}) ──")
        microcycle = "Carga + Test ergómetros" if wn == 2 else "Carga (pico de volumen)"

        for i, s in enumerate(all_sessions):
            this_tid = tid
            day = days[i]
            dow = dows[i]
            src = f"Plantilla_HYROX_12sem · {seg_sheet_label[sheet]} · {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][dow-1]}"
            meta = {"atr": {"macrocycle": MACRO, "microcycle": microcycle},
                    "source": src, "athlete_profile": profile, "week_number": wn}
            out.append(
                f"INSERT INTO templates (id, coach_id, name, format, target_block, version, is_draft, "
                f"day_position, warmup, cooldown, coach_notes, methodology_group_id, meta_json, created_at, updated_at) "
                f"OVERRIDING SYSTEM VALUE VALUES "
                f"({this_tid}, {COACH_ID}, {sq(s.focus)}, '{s.fmt}', '{ATR}', 1, false, "
                f"'{day}', {sq(s.warmup)}, {sq(s.cooldown)}, {sq(s.capa1)}, {s.mgroup}, {jq(meta)}, now(), now());")

            # Segments — position is global across the session; block_position per block.
            pos = 0
            slot_blocks = []
            for bpos, blk in enumerate(s.blocks):
                slot_items = []
                for seg in blk.segs:
                    out.append(
                        f"INSERT INTO template_segments (id, template_id, position, exercise_id, params_json, "
                        f"notes, block_position, block_format, block_title, prescription_json, created_at, updated_at) "
                        f"OVERRIDING SYSTEM VALUE VALUES "
                        f"({sid}, {this_tid}, {pos}, {seg.ex}, {jq(seg.params)}, {sq(seg.notes)}, "
                        f"{bpos}, '{blk.fmt}', {sq(blk.title)}, {jq(seg.presc)}, now(), now());")
                    slot_items.append({
                        "notes": seg.notes, "exercise_id": seg.ex,
                        "params_json": seg.params, "prescription_json": seg.presc,
                    })
                    sid += 1
                    pos += 1
                slot_blocks.append({"items": slot_items, "title": blk.title,
                                    "format": blk.fmt, "config_json": {}})

            slot_days.append({
                "day_of_week": dow,
                "sessions": [{
                    "kind": "workout", "focus": s.focus, "notes": s.capa1,
                    "blocks": slot_blocks, "template_id": this_tid,
                }],
            })
            tid += 1

        # Domingo rest day if no Sunday session.
        if sunday is None:
            slot_days.append({"day_of_week": 7, "sessions": []})

        slots_json = {"days": slot_days}
        out.append(
            f"INSERT INTO program_week_templates (id, coach_id, name, level, atr_block_hint, slots_json, "
            f"focus, athlete_profile, week_number, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES "
            f"({pwt}, {COACH_ID}, {sq(name)}, '{LEVEL}', '{ATR}', {jq(slots_json)}, "
            f"{sq(focus)}, '{profile}', {wn}, now(), now());")
        pwt += 1

    # 4) Advance identity sequences past the explicit ids we inserted, so future
    #    GENERATED ALWAYS inserts don't collide.
    out.append("-- Advance identity sequences past explicitly-inserted ids.")
    for tbl in ("exercises", "templates", "template_segments", "program_week_templates"):
        out.append(
            f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), "
            f"(SELECT max(id) FROM {tbl}));")

    out.append("COMMIT;")
    return "\n".join(out)


def emit_prescriptions_json():
    """Collect every prescription_json (segments) for schema validation."""
    items = []
    for (profile, wn, name, focus, sessions, sunday, sheet) in VARIANTS:
        all_sessions = list(sessions) + ([sunday] if sunday else [])
        for s in all_sessions:
            for blk in s.blocks:
                for seg in blk.segs:
                    items.append({
                        "id": 0,
                        "label": f"{profile} W{wn} · {s.focus} · {blk.title}",
                        "prescription": seg.presc,
                    })
    return json.dumps(items, ensure_ascii=False)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--prescriptions-json":
        sys.stdout.write(emit_prescriptions_json())
    else:
        sys.stdout.write(emit())
        sys.stdout.write("\n")

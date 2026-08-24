#!/usr/bin/env python3
"""ClickUp — abrir y cerrar cards. Ver .claude/skills/clickup/SKILL.md.

Toda escritura deja marca en ~/.claude/clickup-last-write, que es lo que mira el
hook `clickup-guard.sh` para no dejar cerrar el turno con commits sin registrar.

Toda escritura va FIRMADA por el agente que la hizo (ver `firma()`): el token de
la API es el de Alex, asi que sin firma ClickUp atribuye a Alex todo lo que
tocan Claude, Hermes o Grok y no hay manera de saber quien hizo que.

Uso:
  clickup.py listar
  clickup.py siguiente
  clickup.py crear <lista> "<titulo>" <cuerpo.md> [estado]
  clickup.py actualizar <id|numero> <cuerpo.md>   # id si el número está repetido
  clickup.py anadir <id|numero> <cuerpo.md>
  clickup.py estado <id|numero> <to do|in progress|complete>
  clickup.py saltar "<razon>"
"""
import datetime
import json
import os
import pathlib
import re
import sys
import urllib.request

LISTAS = {
    "hecho": "901328217326",
    "ahora": "901328194329",
    "espera": "901328217655",
    "luego": "901328194330",
    "flexr": "901328194328",
}

MARCA = pathlib.Path.home() / ".claude" / "clickup-last-write"
SECRETO = pathlib.Path.home() / ".hermes" / "secrets" / "clickup.env"

GLOSARIO = (
    "\n\n---\nVocabulario, por si lees esto sin conocer el proyecto:\n"
    "· Panel del coach: la web donde el entrenador prepara y sigue el trabajo de sus atletas.\n"
    "· App del atleta: la aplicacion de iPhone que usa cada deportista.\n"
    "· FLEXR: el nombre del producto cuando se venda a muchos entrenadores; FAHYBRID es el primer cliente."
)


def token() -> str:
    t = os.environ.get("CLICKUP_API_TOKEN")
    if t:
        return t
    if SECRETO.exists():
        for line in SECRETO.read_text().splitlines():
            if line.startswith("CLICKUP_API_TOKEN="):
                return line.split("=", 1)[1].strip().strip("'\"")
    sys.exit(f"Sin token: ni CLICKUP_API_TOKEN en el entorno ni {SECRETO}")


def api(method: str, path: str, body=None):
    req = urllib.request.Request(
        f"https://api.clickup.com/api/v2{path}",
        method=method,
        headers={"Authorization": token(), "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def todas():
    """Todas las cards de todas las listas, sin duplicados."""
    vistas, out = set(), []
    for alias, lid in LISTAS.items():
        for closed in ("true", "false"):
            for t in api("GET", f"/list/{lid}/task?archived=false&include_closed={closed}").get("tasks", []):
                if t["id"] in vistas:
                    continue
                vistas.add(t["id"])
                m = re.match(r"^(\d+)\s*·\s*(.*)$", t["name"])
                out.append({
                    "id": t["id"],
                    "url": t["url"],
                    "lista": alias,
                    "num": int(m.group(1)) if m else None,
                    "titulo": m.group(2) if m else t["name"],
                    "nombre": t["name"],
                })
    return sorted(out, key=lambda c: (c["num"] is None, -(c["num"] or 0)))


def buscar(ref: str):
    """Resuelve una card. El número no es único: varios agentes numeran a la
    vez y dos cards pueden nacer con el mismo N. Si el ref es un número y hay
    más de una, nos negamos — hay que pasar el id de la URL al crear."""
    ref = ref.strip()
    m = re.search(r"/t/([A-Za-z0-9]+)", ref)
    if m:
        ref = m.group(1)
    cards = todas()
    by_id = [c for c in cards if c["id"] == ref]
    if by_id:
        return by_id[0]
    if re.fullmatch(r"\d+", ref):
        hits = [c for c in cards if c["num"] is not None and str(c["num"]) == ref]
        if not hits:
            sys.exit(f"No encuentro la card «{ref}». Prueba: clickup.py listar")
        if len(hits) > 1:
            lineas = "\n".join(f"  {c['nombre']}\n      {c['url']}" for c in hits)
            sys.exit(
                f"El número {ref} está en {len(hits)} cards. No toco ninguna. "
                f"Usa el id de la tuya (el de la URL al crear):\n{lineas}"
            )
        return hits[0]
    sys.exit(f"No encuentro la card «{ref}». Prueba: clickup.py listar")


# Los tres estados de las listas del tablero. La LISTA dice en qué cajon vive
# una card; el ESTADO dice si ahora mismo se esta trabajando en ella. Son ejes
# distintos y el script solo movia el primero, asi que todo se quedaba en «to
# do» y Alex no podia ver qué habia en marcha — que es justo para lo que mira
# ClickUp.
ESTADOS = ("to do", "in progress", "complete")


def estado_valido(e: str) -> None:
    if e not in ESTADOS:
        sys.exit(f"Estado no valido: «{e}». Usa uno de: {', '.join(ESTADOS)}")


# QUIÉN TOCÓ LA CARD. El token de la API es el de Alex, asi que ClickUp firma
# como suyo TODO lo que escriben Claude, Hermes y Grok — y con tres agentes
# trabajando a la vez, una card sin firma no dice nada sobre quien la movio. La
# firma se estampa sola en cada escritura: si dependiera de acordarse, faltaria.
#
# El agente se identifica con CLICKUP_AUTOR. Si no la pone, se deduce del
# entorno cuando se puede (`CLAUDECODE` solo existe dentro de Claude Code, asi
# que Hermes o Grok NO se van a firmar como Claude por accidente). Y si no hay
# manera, se dice «agente sin identificar»: es la verdad, y escuece lo bastante
# como para que quien la vea ponga la variable.
def firma() -> str:
    quien = (os.environ.get("CLICKUP_AUTOR") or "").strip()
    if not quien:
        quien = "Claude" if os.environ.get("CLAUDECODE") else "agente sin identificar"
    cuando = datetime.datetime.now().strftime("%d-%m-%Y %H:%M")
    return f"> **{quien}** · {cuando}"


def marcar():
    MARCA.parent.mkdir(parents=True, exist_ok=True)
    MARCA.write_text("")


def cuerpo_de(ruta: str) -> str:
    p = pathlib.Path(ruta)
    if not p.exists():
        sys.exit(f"No existe el fichero de cuerpo: {ruta}")
    return p.read_text().rstrip()


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd = sys.argv[1]

    if cmd == "listar":
        for c in todas():
            n = c["num"] if c["num"] is not None else "--"
            print(f"{n:>4} [{c['lista']:<6}] {c['titulo'][:64]}\n      {c['url']}")

    elif cmd == "siguiente":
        nums = [c["num"] for c in todas() if c["num"] is not None]
        print((max(nums) + 1) if nums else 1)

    elif cmd == "crear":
        alias, titulo, ruta = sys.argv[2], sys.argv[3], sys.argv[4]
        # Estado opcional al crear; por defecto «in progress», porque una card
        # se crea JUSTO al empezar a trabajar en ella (esa es la regla de la
        # skill). Si es algo decidido y aparcado, se pasa "to do" explicito.
        est = sys.argv[5] if len(sys.argv) > 5 else "in progress"
        estado_valido(est)
        lid = LISTAS.get(alias, alias)
        # Número en el momento de escribir, no uno memorizado: otro agente
        # puede haber creado una card entre `siguiente` y este POST.
        nums = [c["num"] for c in todas() if c["num"] is not None]
        n = (max(nums) + 1) if nums else 1
        nombre = f"{n} · {titulo}"
        t = api(
            "POST",
            f"/list/{lid}/task",
            {
                "name": nombre,
                "description": f"{firma()}\n\n" + cuerpo_de(ruta) + GLOSARIO,
                "status": est,
            },
        )
        tid = t["id"]
        # Carrera: dos POSTs con el mismo máximo → dos cards N. Esta es la
        # nuestra; si ya hay gemela, renumeramos la nuestra al siguiente hueco.
        gemelas = [c for c in todas() if c["num"] == n and c["id"] != tid]
        if gemelas:
            nums = [c["num"] for c in todas() if c["num"] is not None]
            n = (max(nums) + 1) if nums else n + 1
            nombre = f"{n} · {titulo}"
            api("PUT", f"/task/{tid}", {"name": nombre})
        marcar()
        print(f"CREADA [{est}] · {nombre}\n{t['url']}\nid {tid}")

    elif cmd == "estado":
        c = buscar(sys.argv[2])
        est = sys.argv[3]
        estado_valido(est)
        api("PUT", f"/task/{c['id']}", {"status": est})
        # Un cambio de estado no toca el cuerpo, asi que la firma va como
        # comentario: si no, mover una card a «hecho» seria el unico gesto sin
        # autor, y es justo el que Alex mira.
        api("POST", f"/task/{c['id']}/comment", {"comment_text": f"{firma()} — estado: {est}", "notify_all": False})
        marcar()
        print(f"ESTADO [{est}] · {c['nombre']}\n{c['url']}")

    elif cmd in ("actualizar", "anadir", "añadir"):
        c = buscar(sys.argv[2])
        nuevo = cuerpo_de(sys.argv[3])
        if cmd == "actualizar":
            desc = f"{firma()}\n\n" + nuevo + GLOSARIO
        else:
            # Al AÑADIR, la firma va con el trozo nuevo: asi la card conserva el
            # rastro de quien escribio cada tramo, no solo del ultimo.
            previo = api("GET", f"/task/{c['id']}").get("description", "")
            desc = previo + f"\n\n---\n\n{firma()}\n\n" + nuevo
        api("PUT", f"/task/{c['id']}", {"description": desc})
        marcar()
        print(f"{'ACTUALIZADA' if cmd == 'actualizar' else 'AMPLIADA'} · {c['nombre']}\n{c['url']}")

    elif cmd == "saltar":
        razon = sys.argv[2] if len(sys.argv) > 2 else ""
        if not razon.strip():
            sys.exit("saltar exige una razon: clickup.py saltar \"por que este commit no lleva card\"")
        marcar()
        print(f"Saltado el guardian de ClickUp. Razon: {razon}")

    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

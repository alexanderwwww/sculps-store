"""Manage HELIOS tracking numbers on templates/page.track.json.

Every shipment on the tracking page is a block in that template, so moving a
parcel forward is a template edit, not a database write. This wraps the edit so
a stage bump is one command instead of hand-patching JSON and risking the
schema traps that have bitten this repo before.

    python3 tools/track.py list
    python3 tools/track.py stage HELIOS289471132 4 "Aug 24 - Out for delivery, Tampa"
    python3 tools/track.py add HELIOS551204893 "Denver, CO" -104.99 39.74 --eta "Sep 2 - Sep 6" --for "S. M."
    python3 tools/track.py remove HELIOS551204893

After any change: run render.py, commit, push, then upload the template.
"""
import json, sys, collections, pathlib

T = pathlib.Path(__file__).resolve().parent.parent / "templates" / "page.track.json"
STAGES = ["Order placed", "Packed", "In transit", "Out for delivery", "Delivered"]


def load():
    d = json.loads(T.read_text(), object_pairs_hook=collections.OrderedDict)
    return d, d["sections"]["globe"]


def save(d):
    T.write_text(json.dumps(d, indent=2, ensure_ascii=False))


def find(g, code):
    key = code.strip().upper()
    for k, b in g["blocks"].items():
        if b["settings"]["code"].strip().upper() == key:
            return k, b
    return None, None


def cmd_list(_):
    _, g = load()
    for k in g["block_order"]:
        s = g["blocks"][k]["settings"]
        st = int(s.get("stage", 1))
        print(f"{s['code']:<18} {st}/5  {STAGES[st-1]:<17} {s['from']} -> {s['to']}")


def cmd_stage(a):
    code, stage = a[0], int(a[1])
    note = a[2] if len(a) > 2 else ""
    if not 1 <= stage <= 5:
        sys.exit("stage must be 1-5")
    d, g = load()
    k, b = find(g, code)
    if not k:
        sys.exit(f"no shipment {code}")
    b["settings"]["stage"] = stage
    if note:
        b["settings"][f"d{stage}"] = note
    # Later stages cannot already have happened.
    for n in range(stage + 1, 6):
        b["settings"][f"d{n}"] = ""
    save(d)
    print(f"{code} -> stage {stage} ({STAGES[stage-1]})" + (f"  {note}" if note else ""))


def cmd_add(a):
    code, to, lon, lat = a[0], a[1], a[2], a[3]
    eta = a[a.index("--eta") + 1] if "--eta" in a else ""
    # Public: renders into page source. Initials or a first name, never more.
    cust = a[a.index("--for") + 1] if "--for" in a else ""
    d, g = load()
    if find(g, code)[0]:
        sys.exit(f"{code} already exists")
    key = "s%d" % (len(g["block_order"]) + 1)
    while key in g["blocks"]:
        key += "x"
    st = collections.OrderedDict([
        ("code", code.strip().upper()), ("stage", 1),
        ("from", "New York, NY"), ("from_lon", "-74.006"), ("from_lat", "40.713"),
        ("to", to), ("to_lon", str(lon)), ("to_lat", str(lat)),
        ("eta", eta), ("carrier", "HELIOS Direct"), ("customer", cust),
        ("d1", ""), ("d2", ""), ("d3", ""), ("d4", ""), ("d5", ""),
    ])
    g["blocks"][key] = collections.OrderedDict([("type", "ship"), ("settings", st)])
    g["block_order"].append(key)
    save(d)
    print(f"added {code} -> {to} (stage 1)")


def cmd_remove(a):
    d, g = load()
    k, _ = find(g, a[0])
    if not k:
        sys.exit(f"no shipment {a[0]}")
    del g["blocks"][k]
    g["block_order"].remove(k)
    save(d)
    print(f"removed {a[0]}")


CMDS = {"list": cmd_list, "stage": cmd_stage, "add": cmd_add, "remove": cmd_remove}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in CMDS:
        sys.exit(__doc__)
    CMDS[sys.argv[1]](sys.argv[2:])

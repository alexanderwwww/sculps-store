"""Command line interface.

    python -m engine --help

Sending is dry-run by default; producing requires a recorded rights grant. Both
defaults are deliberate.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import Config, ConfigError
from .db import Store
from .models import LeadStage, Segment
from .pipeline.normalize import normalize


def _store(cfg: Config) -> Store:
    return Store(cfg.db_path)


# --- lead commands -----------------------------------------------------------

def cmd_discover(args, cfg: Config) -> int:
    from .sources.registry import discover
    rows = discover(args.query, args.limit)
    if not rows:
        print("no datasets found")
        return 0
    print(f"{'domain':38} {'dataset':12} name")
    for r in rows:
        print(f"{r['domain'][:37]:38} {r['id']:12} {r['name'][:60]}")
    print("\nPin the ones you want under [[sources.registry]] in config.toml")
    return 0


def _ingest(cfg: Config, store: Store, leads_iter, label: str) -> int:
    added = dropped = dupe = 0
    for lead in leads_iter:
        norm = normalize(lead, cfg.target_states or None)
        if norm is None:
            dropped += 1
            continue
        if store.upsert_lead(norm):
            added += 1
        else:
            dupe += 1
    print(f"{label}: added={added} duplicate={dupe} out-of-scope={dropped}")
    return added


def cmd_pull_registry(args, cfg: Config) -> int:
    from .sources.registry import RegistrySource
    src = RegistrySource(domain=args.domain, dataset_id=args.dataset,
                         state=args.state, city_label=args.city)
    with _store(cfg) as store:
        _ingest(cfg, store, src.fetch(limit=args.limit), f"registry {args.dataset}")
    return 0


def cmd_pull_places(args, cfg: Config) -> int:
    from .sources.places import PlacesSource
    key = cfg.google_places_key
    if not key:
        print("LISTING_ENGINE_GOOGLE_PLACES_KEY is not set", file=sys.stderr)
        return 2
    src = PlacesSource(key)
    with _store(cfg) as store:
        _ingest(cfg, store, src.fetch(metro=args.metro, state=args.state),
                f"places {args.metro}")
    return 0


def cmd_import_csv(args, cfg: Config) -> int:
    from .sources.csv_import import CsvSource
    src = CsvSource(args.path, default_source_url=args.source_url or "")
    with _store(cfg) as store:
        _ingest(cfg, store, src.fetch(), f"csv {Path(args.path).name}")
    return 0


def cmd_stats(args, cfg: Config) -> int:
    with _store(cfg) as store:
        counts = store.counts_by_stage()
        total = sum(counts.values())
        print(f"leads: {total}")
        for stage, n in sorted(counts.items()):
            print(f"  {stage:12} {n}")
        print(f"sends today: {store.sends_today()}")
    return 0


def cmd_suppress(args, cfg: Config) -> int:
    with _store(cfg) as store:
        store.suppress(args.email, args.reason)
        print(f"suppressed {args.email} (permanent)")
    return 0


# --- outreach ----------------------------------------------------------------

def cmd_campaign(args, cfg: Config) -> int:
    from .outreach.sequencer import run_campaign
    segment = Segment(args.segment) if args.segment else None
    with _store(cfg) as store:
        report = run_campaign(
            cfg, store,
            campaign=args.name,
            portfolio_url=args.portfolio_url,
            limit=args.limit,
            dry_run=not args.send,
            segment=segment,
        )
    print("\n" + report.summary())
    if report.errors:
        print(f"\n{len(report.errors)} blocked/failed:")
        for e in report.errors[:10]:
            print(f"\n{e}")
    if not args.send:
        print("\n(dry run — nothing was sent. Add --send to send for real.)")
    return 0


def cmd_manual(args, cfg: Config) -> int:
    """Print a hand-worked outreach queue. Sends nothing."""
    import csv as _csv

    from .outreach.manual import DISCLAIMER, ManualQueue, bridge_note

    handles: list[tuple[str, str]] = []
    if args.list:
        with open(args.list, newline="", encoding="utf-8-sig") as fh:
            for row in _csv.reader(fh):
                if not row or not row[0].strip() or row[0].lstrip().startswith("#"):
                    continue
                handles.append((row[0].strip(),
                                row[1].strip() if len(row) > 1 else ""))
    else:
        handles = [(h, "") for h in args.handle or []]

    if not handles:
        print("nothing to do: pass --handle URL (repeatable) or --list file.csv",
              file=sys.stderr)
        return 2

    with _store(cfg) as store:
        q = ManualQueue(store, channel=args.channel, max_per_day=args.max_per_day)

        if args.mark_sent:
            for handle, label in handles:
                q.mark_sent(handle, label=label)
                print(f"recorded: {handle}")
            print(f"\n{q.remaining_today()} left in today's budget")
            return 0

        items = q.build(handles)
        print(DISCLAIMER)
        if not items:
            print("queue empty — every handle is already contacted, or today's "
                  f"cap of {args.max_per_day} is used up.")
            print(f"\n{bridge_note()}")
            return 0

        for i, item in enumerate(items, 1):
            print(f"--- {i}/{len(items)} · {item.label or item.handle} ---")
            print(f"open: {item.handle}\n")
            print(item.message)
            print()

        print(f"{len(items)} to send by hand. {q.remaining_today()} left in "
              "today's budget.")
        print("After sending, record them:")
        print(f"  python -m engine manual --mark-sent "
              + " ".join(f"--handle {i.handle}" for i in items[:2])
              + (" ..." if len(items) > 2 else ""))
        print(f"\n{bridge_note()}")
    return 0


def cmd_manual_log(args, cfg: Config) -> int:
    with _store(cfg) as store:
        rows = store.manual_history(args.limit)
        if not rows:
            print("no manual touches recorded")
            return 0
        print(f"{'when':21} {'channel':16} handle")
        for r in rows:
            print(f"{r['sent_at']:21} {r['channel']:16} "
                  f"{r['label'] or r['handle']}")
        print(f"\ntoday: {store.manual_touches_today()}")
    return 0


# --- production --------------------------------------------------------------

def cmd_harvest(args, cfg: Config) -> int:
    """Harvest property photos from an operator's own public website."""
    from .sources.site_photos import RobotsDisallowed, SitePhotoHarvester

    h = SitePhotoHarvester(contact_url=args.contact,
                           max_images=args.max_images,
                           delay=args.delay)
    out_root = Path(args.out)
    targets: list[tuple[str, str]] = []
    if args.list:
        import csv as _csv
        with open(args.list, newline="", encoding="utf-8-sig") as fh:
            for row in _csv.reader(fh):
                if not row or not row[0].strip() or row[0].lstrip().startswith("#"):
                    continue
                url = row[0].strip()
                name = row[1].strip() if len(row) > 1 else _slug(url)
                targets.append((url, name))
    else:
        for url in args.url or []:
            targets.append((url, _slug(url)))

    if not targets:
        print("pass --url URL (repeatable) or --list file.csv", file=sys.stderr)
        return 2

    failures = 0
    for url, name in targets:
        try:
            res = h.harvest(url, out_root / name)
            print(f"  {res.summary()}  -> {out_root / name}")
        except RobotsDisallowed as exc:
            print(f"  skipped {url}: {exc}")
        except Exception as exc:
            failures += 1
            print(f"  FAILED  {url}: {exc}", file=sys.stderr)

    print(f"\nPhotos are tagged SPEC_ONLY (see RIGHTS.txt in each folder): fine to "
          f"build a pitch for that same business, not for portfolio or ads.")
    return 1 if failures else 0


def cmd_pack(args, cfg: Config) -> int:
    """Build image-to-video prompt packs for a box of properties."""
    from .produce.i2v import pack_property
    from .produce.intake import find_photos

    inbox, out_root = Path(args.inbox), Path(args.out)
    dirs = sorted(d for d in inbox.iterdir() if d.is_dir())
    if not dirs:
        print(f"no property folders in {inbox}", file=sys.stderr)
        return 2
    for d in dirs:
        try:
            photos = find_photos(d)[:args.max_shots]
        except Exception as exc:
            print(f"  skipped {d.name}: {exc}")
            continue
        out = pack_property(photos, out_root / d.name, seconds=args.seconds,
                            aspect=cfg.produce.aspect)
        print(f"  {d.name}: {len(photos)} prompts -> {out}")
    print("\nPaste prompts.txt entries with their images into OpenArt Director "
          "(or any image-to-video tool). Prompts are constrained to the "
          "photographed room — they will not invent a walkthrough.")
    return 0


def _slug(url: str) -> str:
    from urllib.parse import urlparse
    p = urlparse(url)
    base = (p.netloc + p.path).strip("/").replace("/", "-").replace(".", "-")
    return base[:60] or "site"


def cmd_record_grant(args, cfg: Config) -> int:
    from .produce.intake import record_grant
    with _store(cfg) as store:
        g = record_grant(
            store,
            property_ref=args.property_ref,
            supplied_by=args.supplied_by,
            supplied_via=args.via,
            confirmation_note=args.note,
            portfolio_permission=args.portfolio_ok,
        )
        print(f"grant recorded for {g.property_ref} "
              f"(portfolio_permission={g.portfolio_permission})")
    return 0


def cmd_produce(args, cfg: Config) -> int:
    from .produce.batch import run_batch
    with _store(cfg) as store:
        res = run_batch(store, cfg, args.inbox, args.out,
                        client=args.client, music=args.music,
                        end_card=args.end_card, workers=args.workers)
    for p in res.produced:
        print(f"  produced  {p}")
    for name, why in res.skipped:
        print(f"  skipped   {name}: {why}")
    for name, why in res.failed:
        print(f"  FAILED    {name}: {why}")
    print("\n" + res.summary())
    return 1 if res.failed else 0


# --- parser ------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="engine",
                                description="Listing Engine — leads, outreach, production")
    p.add_argument("--config", default="config.toml")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("discover", help="search Socrata for STR permit datasets")
    s.add_argument("--query", default="short term rental")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(fn=cmd_discover)

    s = sub.add_parser("pull-registry", help="ingest a city STR permit dataset")
    s.add_argument("--domain", required=True, help="e.g. data.nashville.gov")
    s.add_argument("--dataset", required=True, help="Socrata 4x4 dataset id")
    s.add_argument("--state", required=True)
    s.add_argument("--city", default=None)
    s.add_argument("--limit", type=int, default=1000)
    s.set_defaults(fn=cmd_pull_registry)

    s = sub.add_parser("pull-places", help="ingest property managers via Google Places")
    s.add_argument("--metro", required=True)
    s.add_argument("--state", required=True)
    s.set_defaults(fn=cmd_pull_places)

    s = sub.add_parser("import-csv", help="import a manually assembled list")
    s.add_argument("path")
    s.add_argument("--source-url", help="provenance, if not a column in the CSV")
    s.set_defaults(fn=cmd_import_csv)

    s = sub.add_parser("stats", help="pipeline counts")
    s.set_defaults(fn=cmd_stats)

    s = sub.add_parser("suppress", help="permanently suppress an address")
    s.add_argument("email")
    s.add_argument("--reason", default="recipient opt-out")
    s.set_defaults(fn=cmd_suppress)

    s = sub.add_parser("campaign", help="run an outreach campaign (dry-run default)")
    s.add_argument("--name", default="default")
    s.add_argument("--portfolio-url", required=True,
                   help="link to your rights-clean sample reel")
    s.add_argument("--limit", type=int, default=25)
    s.add_argument("--segment", choices=[x.value for x in Segment])
    s.add_argument("--send", action="store_true", help="actually send")
    s.set_defaults(fn=cmd_campaign)

    s = sub.add_parser(
        "manual",
        help="print a hand-send queue for Airbnb/IG (sends nothing, ever)")
    s.add_argument("--handle", action="append",
                   help="listing URL or handle; repeatable")
    s.add_argument("--list", help="CSV of handle[,label] per line")
    s.add_argument("--channel", default="airbnb_message")
    s.add_argument("--max-per-day", type=int, default=10)
    s.add_argument("--mark-sent", action="store_true",
                   help="record the given handles as sent by hand")
    s.set_defaults(fn=cmd_manual)

    s = sub.add_parser("manual-log", help="what you've sent by hand")
    s.add_argument("--limit", type=int, default=50)
    s.set_defaults(fn=cmd_manual_log)

    s = sub.add_parser(
        "harvest",
        help="pull property photos from an operator's own website (robots-aware)")
    s.add_argument("--url", action="append", help="page URL; repeatable")
    s.add_argument("--list", help="CSV of url[,name] per line")
    s.add_argument("--out", default="./inbox")
    s.add_argument("--contact", required=True,
                   help="your site or mailto:, sent in the User-Agent")
    s.add_argument("--max-images", type=int, default=12)
    s.add_argument("--delay", type=float, default=1.5)
    s.set_defaults(fn=cmd_harvest)

    s = sub.add_parser(
        "pack", help="build truthful image-to-video prompt packs for a box")
    s.add_argument("--inbox", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--max-shots", type=int, default=6)
    s.add_argument("--seconds", type=float, default=5.0)
    s.set_defaults(fn=cmd_pack)

    s = sub.add_parser("record-grant", help="record client photo-rights confirmation")
    s.add_argument("property_ref")
    s.add_argument("--supplied-by", required=True)
    s.add_argument("--via", default="email")
    s.add_argument("--note", required=True, help="the client's actual confirmation words")
    s.add_argument("--portfolio-ok", action="store_true")
    s.set_defaults(fn=cmd_record_grant)

    s = sub.add_parser("produce", help="batch-produce reels from an intake folder")
    s.add_argument("--inbox", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--client", default="")
    s.add_argument("--music", default=None)
    s.add_argument("--end-card", default="")
    s.add_argument("--workers", type=int, default=2)
    s.set_defaults(fn=cmd_produce)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        cfg = Config.load(args.config)
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2
    try:
        return args.fn(args, cfg)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

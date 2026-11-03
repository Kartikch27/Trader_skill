"""Build Arthly's demo fixtures by running the day-trader-skill tools offline.

Every number in the demo comes from the repository's own Python tools run on
the repository's own offline test fixtures (real data cut from Mon 2026-10-19,
"the reel"). Nothing here calls the network or a broker.

    python -I scripts/build_fixtures.py [--repo ../day-trader-skill]

Writes src/fixtures/*.json. Safe to re-run.
"""
import argparse
import datetime as dt
import gzip
import json
import os
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
OUT = os.path.join(APP, "src", "fixtures")
NOW = "2026-10-19 10:15"
DAY = "2026-10-19"


def run(repo, work, args, ok=(0, 1)):
    p = subprocess.run([sys.executable, *args], cwd=work, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if p.returncode not in ok:
        raise SystemExit("failed: %s\n%s\n%s" % (" ".join(args), p.stdout[-2000:], p.stderr[-2000:]))
    return p.stdout


def load(path):
    if path.endswith(".gz"):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write(name, data):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    print("wrote", name)


def names_from_universe(path):
    names = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            if "|" in line:
                s, n = line.rstrip("\n").split("|", 1)
                names[s] = n
    return names


def ny(ts, offset):
    return dt.datetime.utcfromtimestamp(ts + offset)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.path.join(APP, "..", "day-trader-skill"))
    ap.add_argument("--universe", default=os.path.join(APP, "..", "trader", "universe.txt"))
    a = ap.parse_args()
    repo = os.path.abspath(a.repo)
    fx = os.path.join(repo, "tests", "fixtures")
    names = names_from_universe(a.universe)
    work = tempfile.mkdtemp(prefix="arthly-")
    os.makedirs(os.path.join(work, "trader"))
    shutil.copy(os.path.join(repo, "trader-budget", "config.example.json"),
                os.path.join(work, "trader", "config.json"))
    tool = lambda *p: os.path.join(repo, *p)

    # ---------------------------------------------------------------- scanner: ORB at 10:15
    wall_path = os.path.join(fx, "trader-scanner", "wall5m-2026-10-19.json.gz")
    orb = json.loads(run(repo, work, [tool("trader-scanner", "scan.py"), "orb", "--offline", wall_path,
                                      "--now", NOW, "--json", "--no-write"]))
    wall = load(wall_path)
    for h in orb["hits"]:
        res = wall.get(h["symbol"], {}).get("chart", {}).get("result") or [{}]
        meta = res[0].get("meta", {})
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
        h["name"] = names.get(h["symbol"])
        h["prev_close"] = prev
        h["change_pct"] = round((h["price"] / prev - 1) * 100, 2) if prev else None
        q = res[0].get("indicators", {}).get("quote", [{}])[0]
        vols = [v for v in (q.get("volume") or [])[: h["bar_index"] + 1] if v]
        h["volume_so_far"] = int(sum(vols)) if vols else None
        h["price_time"] = "%s %s ET" % (DAY, h["at"])
    orb["data_note"] = ("Real Yahoo 5-minute charts saved by the repository's tests for the reel's "
                        "234-ticker wall, scanned at 10:15 AM ET on Mon 2026-10-19.")
    write("scan-orb.json", orb)

    # ---------------------------------------------------------------- scanner: daily (pre-market)
    spark_path = os.path.join(fx, "trader-scanner", "daily-spark-2026-10-19.json")
    daily = json.loads(run(repo, work, [tool("trader-scanner", "scan.py"), "daily", "--offline", spark_path,
                                        "--now", "2026-10-19 08:00", "--json", "--no-write",
                                        "--min-price", "5", "--min-volume", "0"]))
    spark = {r["symbol"]: r["response"][0] for r in load(spark_path)["spark"]["result"] if r.get("response")}
    for h in daily["hits"]:
        r = spark.get(h["symbol"], {})
        closes = [c for c in (r.get("indicators", {}).get("quote", [{}])[0].get("close") or []) if c]
        h["name"] = names.get(h["symbol"])
        h["change_pct"] = round((closes[-1] / closes[-2] - 1) * 100, 2) if len(closes) > 1 else None
        h["price_time"] = "%s close" % h.get("close_date", "")
    daily["data_note"] = ("Real Yahoo daily closes saved by the repository's tests (closes through "
                          "Fri 2026-10-16), scanned before the open on Mon 2026-10-19.")
    write("scan-daily.json", daily)

    # ---------------------------------------------------------------- bars for the chart
    sixty = load(os.path.join(fx, "trader-timemachine", "TSLA-60d5m.json.gz"))["chart"]["result"][0]
    off = sixty["meta"].get("gmtoffset", -14400)
    q = sixty["indicators"]["quote"][0]
    bars = []
    for i, ts in enumerate(sixty["timestamp"]):
        t = ny(ts, off)
        if t.strftime("%Y-%m-%d") not in ("2026-10-15", "2026-10-16", DAY):
            continue
        if t.minute % 5 or t.second:
            continue
        if None in (q["open"][i], q["high"][i], q["low"][i], q["close"][i]):
            continue
        if not (dt.time(9, 30) <= t.time() < dt.time(16, 0)):
            continue
        # only bars complete by 10:15 on the plan day
        if t.strftime("%Y-%m-%d") == DAY and t + dt.timedelta(minutes=5) > dt.datetime(2026, 10, 19, 10, 15):
            continue
        bars.append({"t": ts, "ny": t.strftime("%Y-%m-%d %H:%M"), "o": round(q["open"][i], 2),
                     "h": round(q["high"][i], 2), "l": round(q["low"][i], 2), "c": round(q["close"][i], 2),
                     "v": int(q["volume"][i] or 0)})
    # the 10:15 forming bar from the entry fixture's live tick is not a bar; add the real 10:15 bar
    # from the entry fixture only if it is complete (it is not at 10:15).
    write("bars-TSLA.json", {"symbol": "TSLA", "interval": "5m", "source": "Yahoo chart (saved test fixture)",
                             "complete_through": "2026-10-19 10:15 ET", "bars": bars})

    # ---------------------------------------------------------------- the reel: entry -> exit -> replay
    entry_fx = os.path.join(fx, "trader-entry", "TSLA-2026-10-19-5m.json")
    waiting = json.loads(run(repo, work, [tool("trader-entry", "entry.py"), "check", "TSLA", "--offline", entry_fx,
                                          "--now", "2026-10-19 10:12", "--json"]))
    run(repo, work, [tool("trader-entry", "entry.py"), "check", "TSLA", "--offline", entry_fx,
                     "--now", NOW, "--write", "--json"])
    entry = load(os.path.join(work, "trader", "entry.json"))
    write("entry-TSLA.json", {"at_10_12": waiting, "at_10_15": entry})

    run(repo, work, [tool("trader-exit", "exit.py"), "plan", "--stop", "or-mid", "--target", "1R",
                     "--write", "--now", NOW])
    plan = load(os.path.join(work, "trader", "plan.json"))
    write("plan-TSLA.json", plan)

    run(repo, work, [tool("trader-timemachine", "timemachine.py"), "run", "--offline",
                     os.path.join(fx, "trader-timemachine", "TSLA-60d5m.json.gz"), "--now", NOW,
                     "--until", "15:55", "--write"])
    write("timemachine-TSLA.json", load(os.path.join(work, "trader", "timemachine.json")))

    # ---------------------------------------------------------------- size -> risk -> ticket
    sizing = json.loads(run(repo, work, [tool("trader-budget", "size.py"), "--write", "--now", NOW, "--json"]))
    risk = json.loads(run(repo, work, [tool("trader-risk", "check.py"), "--now", NOW, "--json"]))
    ticket = run(repo, work, [tool("trader-broker", "ticket.py"), "show", "--now", NOW])
    write("sizing-TSLA.json", sizing)
    write("risk-TSLA.json", risk)
    write("ticket-TSLA.json", {"text": ticket})
    write("config.example.json", load(tool("trader-budget", "config.example.json")))

    # ---------------------------------------------------------------- news
    news = json.loads(run(repo, work, [tool("trader-news", "news.py"), "--tickers", "TSLA", "--offline",
                                       os.path.join(fx, "trader-news"), "--now", "2026-10-19T14:15:00+00:00",
                                       "--hours", "6", "--all", "--no-sec", "--dry-run", "--json"]))
    write("news-TSLA.json", news)

    # ---------------------------------------------------------------- quotes (alerts)
    quotes = {}
    for f in sorted(os.listdir(os.path.join(fx, "trader-alerts"))):
        if f.startswith("yahoo-") and f.endswith(".json"):
            d = load(os.path.join(fx, "trader-alerts", f))
            res = (d.get("chart") or {}).get("result")
            if not res:
                continue
            m = res[0]["meta"]
            quotes[m["symbol"]] = {"price": m.get("regularMarketPrice"),
                                   "prev_close": m.get("chartPreviousClose") or m.get("previousClose"),
                                   "time": dt.datetime.utcfromtimestamp(m["regularMarketTime"]).strftime("%Y-%m-%dT%H:%M:%SZ"),
                                   "name": names.get(m["symbol"])}
    write("quotes.json", {"source": "Yahoo chart (saved test fixtures)", "quotes": quotes})

    # ---------------------------------------------------------------- analyst
    analyst = json.loads(run(repo, work, [tool("trader-analyst", "facts.py"), "AAPL", "KO", "--offline",
                                          os.path.join(fx, "trader-analyst"), "--user-agent",
                                          "Arthly demo demo@example.com", "--json"]))
    write("analyst.json", analyst)

    # ---------------------------------------------------------------- pelosi
    pfx = os.path.join(fx, "trader-pelosi")
    index = json.loads(run(repo, work, [tool("trader-pelosi", "ptr.py"), "index", "--member", "pelosi",
                                        "--offline", os.path.join(pfx, "2026FD.zip"), "--json", "--year", "2026"]))
    filed = {r["doc_id"]: r["filed"] for r in index}
    reports = []
    for f in sorted(os.listdir(pfx)):
        if f.startswith("ptr-") and f.endswith(".txt"):
            doc = f.split("-")[1].split(".")[0]
            args = [tool("trader-pelosi", "ptr.py"), "parse", os.path.join(pfx, f), "--json"]
            if doc in filed:
                args += ["--filed", filed[doc]]
            r = json.loads(run(repo, work, args))
            r["excerpt"] = "excerpt" in f
            r["url"] = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/%s.pdf" % doc
            reports.append(r)
    write("pelosi.json", {"index": index, "reports": reports})

    shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()

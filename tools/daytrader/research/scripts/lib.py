"""Shared HTTP helper. Standard library only. Honors HTTPS_PROXY from the environment."""
import json, gzip, time, urllib.request, urllib.error
UA = {"User-Agent": "research-client", "Accept-Encoding": "gzip"}
def get_json(url, tries=6, timeout=30):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                return json.loads(b)
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 404): raise
            time.sleep(min(30, 1.5 * 2 ** i))
        except Exception as e:
            last = e; time.sleep(min(30, 1.5 * 2 ** i))
    raise last
GAMMA = "https://gamma-api.polymarket.com"; CLOB = "https://clob.polymarket.com"; DATA = "https://data-api.polymarket.com/v2"
COINS = {"btc": "BTC-USD", "eth": "ETH-USD", "sol": "SOL-USD"}
SERIES = {"btc": 10684, "eth": 10683, "sol": 10686}

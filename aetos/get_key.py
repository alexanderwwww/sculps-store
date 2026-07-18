"""
XTRADE · get_key — makes your GMGN key and hands you the public part.

Run via GET_KEY.bat (or SETUP.bat runs it automatically).
- Generates the Ed25519 keypair ONCE (reuses it if it already exists)
- Saves your secret to gmgn_private.pem  (NEVER share this file)
- Writes the public key to PUBLIC_KEY.txt
- Copies the public key to your CLIPBOARD
- Opens it in Notepad so you can see it

Then: gmgn.ai -> GMGN API Management -> Create API Key ->
paste (Ctrl+V) into "Paste Ed25519 or RSA Public Key here" ->
Enable Reading ON + Enable Trading ON (do the 2FA) -> Create -> copy the API key
-> paste that API key inside the XTRADE app.
"""

import os
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

import gmgn_client  # noqa: E402

PRIV = os.path.join(BASE, "gmgn_private.pem")
PUB_TXT = os.path.join(BASE, "PUBLIC_KEY.txt")


def main():
    if os.path.exists(PRIV):
        pub = gmgn_client.load_public_pem(PRIV)
        print("[xtrade] existing key found — reusing it (good).")
    else:
        pub = gmgn_client.generate_keypair(PRIV)
        print("[xtrade] new key generated.")

    with open(PUB_TXT, "w", encoding="utf-8") as f:
        f.write(pub)

    # copy to clipboard (best effort)
    copied = False
    try:
        p = subprocess.run(["clip"], input=pub.encode("utf-8"), timeout=10,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        copied = p.returncode == 0
    except Exception:
        pass

    print()
    print("=" * 62)
    print(" YOUR PUBLIC KEY (safe to share — this goes into GMGN):")
    print("=" * 62)
    print(pub)
    print("=" * 62)
    print(f" {'COPIED TO CLIPBOARD — just Ctrl+V into GMGN.' if copied else 'Copy it from the Notepad window that opens.'}")
    print(" GMGN -> Create API Key -> paste -> Enable Reading + Trading -> Create")
    print("=" * 62)

    # open in notepad so it's impossible to miss
    try:
        subprocess.Popen(["notepad.exe", PUB_TXT])
    except Exception:
        pass


if __name__ == "__main__":
    main()

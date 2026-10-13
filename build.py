#!/usr/bin/env python3
"""Build the installable phone app (PWA) into dist/ from index.html.

index.html stays the single source (it is also the artifact page). This wraps it in a
full document with the app manifest, home-screen icons and an offline service worker.
Run: python3 build.py
"""
import hashlib, json, struct, zlib
from pathlib import Path

ROOT = Path(__file__).parent
DIST = ROOT / "dist"
NAME = "BJJ Roadmap"
SCRIPTS = ["data.js", "parser.js", "app.js"]

# ---------- icon: a black belt with its red bar and four stripes, on mat blue ----------
BLUE, BELT, RED, TAPE = (28, 77, 181), (18, 18, 18), (193, 39, 31), (245, 245, 242)

def icon_pixel(x, y):
    # unit coordinates 0..1; everything important sits inside the maskable safe zone
    if 0.40 <= y <= 0.60:
        if 0.54 <= x <= 0.80:
            for i in range(4):  # stripes, right-aligned in the bar
                sx = 0.755 - i * 0.05
                if sx <= x <= sx + 0.022 and 0.40 <= y <= 0.60:
                    return TAPE
            return RED
        return BELT
    return BLUE

def png(size, path):
    rows = bytearray()
    for py in range(size):
        rows.append(0)
        for px in range(size):
            rows.extend(icon_pixel((px + 0.5) / size, (py + 0.5) / size))
    def chunk(kind, data):
        c = kind + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")
    path.write_bytes(out)

# ---------- page ----------
HEAD_META = f"""<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="A path through Brazilian jiu-jitsu from white to black belt, with progress tracking.">
<meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{NAME}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>
:root {{ padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); color-scheme: light; }}
html {{ background: var(--bg); }}
body {{ margin: 0; font: 14px/1.4 system-ui, sans-serif; -webkit-tap-highlight-color: transparent; }}
img {{ max-width: 100%; }}
[hidden] {{ display: none !important; }}
</style>"""

SW_REGISTER = """<script>
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
</script>"""

def build():
    DIST.mkdir(exist_ok=True)
    src = (ROOT / "index.html").read_text()
    head, sep, body = src.partition('<!-- body -->')
    assert sep, "index.html no longer has the <!-- body --> marker"
    page = f'<!doctype html>\n<html lang="en">\n<head>\n{HEAD_META}\n{head.strip()}\n</head>\n<body>\n{body.strip()}\n{SW_REGISTER}\n</body>\n</html>\n'
    (DIST / "index.html").write_text(page)
    scripts = ""
    for js in SCRIPTS:
        text = (ROOT / js).read_text()
        (DIST / js).write_text(text)
        scripts += text

    png(192, DIST / "icon-192.png")
    png(512, DIST / "icon-512.png")
    png(180, DIST / "apple-touch-icon.png")

    (DIST / "manifest.webmanifest").write_text(json.dumps({
        "name": NAME, "short_name": NAME, "start_url": "./", "scope": "./",
        "display": "standalone", "orientation": "portrait",
        "background_color": "#f2f2f7", "theme_color": "#1c4db5",
        "icons": [
            {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
    }, indent=2))

    # cache name follows the page content, so every rebuild ships to installed phones
    version = hashlib.sha1((page + scripts).encode()).hexdigest()[:10]
    (DIST / "sw.js").write_text((ROOT / "sw.template.js").read_text().replace("__VERSION__", version))
    (DIST / ".nojekyll").write_text("")
    print(f"built dist/ (cache {version})")

if __name__ == "__main__":
    build()

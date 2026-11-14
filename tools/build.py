#!/usr/bin/env python3
"""Build the site.

Page bodies live in src/pages/<name>.html. This script wraps each one in
src/layout.html, writes the finished pages to the repository root, and
builds the search index (assets/js/search-index.js) from every element
that carries a data-find attribute.

Usage:  python3 tools/build.py
"""
import datetime
import hashlib
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# The address the site is served from (Cloudflare Pages, custom domain).
BASE_URL = "https://rocky-website.github.io/academic-site/"

# (file name, menu label, <title>, meta description, extra scripts)
PAGES = [
    ("index", "Home", "Shiwam Singh, boundary layer meteorology, IIT Roorkee",
     "Shiwam Singh is a PhD researcher at IIT Roorkee working on surface and boundary layer processes in weather prediction models over the Himalaya.",
     ["assets/js/hero.js", "assets/js/forecast.js", "assets/js/world-data.js", "assets/js/map.js"]),
    ("about", "About", "About Shiwam Singh",
     "Background, education and research positions of Shiwam Singh, PhD researcher in atmospheric science at IIT Roorkee.", []),
    ("research", "Research", "Research, Shiwam Singh",
     "Surface layer parameterization, eddy covariance measurements and WRF modelling over mountainous terrain in the Indian Himalaya.",
     ["assets/js/explorer.js"]),
    ("publications", "Publications", "Publications, Shiwam Singh",
     "Peer-reviewed journal articles by Shiwam Singh, with DOIs and citation formats.", []),
    ("talks", "Talks and awards", "Talks and awards, Shiwam Singh",
     "Conference presentations at EGU, AGU, GEWEX, JpGU, AOGS and INTROMET, and awards and travel grants.", ["assets/js/world-data.js", "assets/js/map.js"]),
    ("training", "Training", "Training and schools, Shiwam Singh",
     "Summer schools, workshops and training programmes in data assimilation, HPC for climate, eddy covariance and disaster risk.", []),
    ("forecast", "Forecast", "Seven-day forecast for your location, Shiwam Singh",
     "Weather, hourly charts, air quality and simple advisories for the next seven days at the visitor's own location. Not an official forecast.",
     ["assets/js/forecast.js"]),
    ("gallery", "Gallery", "Gallery, Shiwam Singh",
     "Photographs from fieldwork, conferences and travel.", ["assets/js/gallery.js"]),
    ("contact", "Contact", "Contact, Shiwam Singh",
     "How to reach Shiwam Singh at IIT Roorkee.", []),
]

# Served by Cloudflare Pages for any address that does not exist. Not in the menu or search.
NOT_FOUND = ("404", "", "Page not found, Shiwam Singh",
             "This address does not exist on Shiwam Singh's website.", [])


def nav_html(current):
    out = []
    for name, label, *_ in PAGES:
        href = "./" if name == "index" else f"{name}.html"
        cur = ' aria-current="page"' if name == current else ""
        out.append(f'<a href="{href}"{cur}>{label}</a>')
    return "\n      ".join(out)


FIND = re.compile(r'<(\w+)[^>]*?\bid="([^"]+)"[^>]*?\bdata-find="([^"]+)"[^>]*>', re.S)
FIND2 = re.compile(r'<(\w+)[^>]*?\bdata-find="([^"]+)"[^>]*?\bid="([^"]+)"[^>]*>', re.S)


def main():
    layout = (SRC / "layout.html").read_text(encoding="utf-8")
    css_js = b"".join(p.read_bytes() for p in sorted((ROOT / "assets").rglob("*.*")) if p.suffix in {".css", ".js"} and p.name != "search-index.js")
    version = hashlib.sha1(css_js).hexdigest()[:8]
    ist = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
    updated = datetime.datetime.now(ist).strftime("%d %B %Y")

    index = []
    for name, label, title, desc, scripts in PAGES + [NOT_FOUND]:
        body = (SRC / "pages" / f"{name}.html").read_text(encoding="utf-8")
        href = "./" if name == "index" else f"{name}.html"
        if name != "404":
            index.append({"t": label, "d": desc, "u": href, "k": "Page"})
        hits = [(m.group(2), m.group(3)) for m in FIND.finditer(body)]
        hits += [(m.group(3), m.group(2)) for m in FIND2.finditer(body)]
        for anchor, payload in hits:
            kind, _, rest = payload.partition("|")
            t, _, d = rest.partition("|")
            index.append({"t": html.unescape(t), "d": html.unescape(d), "u": f"{href}#{anchor}" if name != "index" else f"#{anchor}", "k": kind})

        page = (layout
                .replace("{{title}}", html.escape(title))
                .replace("{{description}}", html.escape(desc))
                .replace("{{base_url}}", BASE_URL)
                .replace("{{canonical}}", "" if name == "index" else f"{name}.html")
                .replace("{{nav}}", nav_html(name))
                .replace("{{page}}", name)
                .replace("{{body_class}}", " hero-load" if name == "index" else "")
                .replace("{{version}}", version)
                .replace("{{updated}}", updated)
                .replace("{{head_extra}}", '<meta name="robots" content="noindex">' if name == "404" else "")
                .replace("{{scripts}}", "\n".join(f'<script src="{s}?v={version}" defer></script>' for s in scripts))
                .replace("{{body}}", body))
        if name == "404":
            # Shown at whatever address was mistyped, so relative links must resolve from the root.
            page = page.replace("<head>", '<head>\n<base href="/">', 1)
        (ROOT / f"{name}.html").write_text(page, encoding="utf-8")

    seen, uniq = set(), []
    for e in index:
        if e["u"] not in seen:
            seen.add(e["u"]); uniq.append(e)
    (ROOT / "assets" / "js" / "search-index.js").write_text(
        "window.SEARCH_INDEX=" + json.dumps(uniq, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")

    today = datetime.datetime.now(ist).strftime("%Y-%m-%d")
    urls = "".join(f"  <url><loc>{BASE_URL}{'' if n == 'index' else n + '.html'}</loc><lastmod>{today}</lastmod></url>\n" for n, *_ in PAGES)
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n", encoding="utf-8")
    (ROOT / "robots.txt").write_text(
        "User-agent: *\nDisallow: /src/\nDisallow: /tools/\n\nSitemap: " + BASE_URL + "sitemap.xml\n", encoding="utf-8")
    print(f"built {len(PAGES)} pages, {len(uniq)} search entries, assets v{version}")


if __name__ == "__main__":
    main()

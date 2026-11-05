#!/usr/bin/env python3
"""Add photos to the gallery as an album.

Resizes each photo to 2000 px on the long edge (JPEG quality 85,
progressive) with a 700 px thumbnail, strips camera metadata such as GPS,
and records the album in gallery/gallery.json. Originals are not copied.

Examples
  python3 tools/add_photos.py egu-2026 ~/Pictures/egu/*.jpg \
      --title "EGU General Assembly 2026" --date 2026-05-05 \
      --place "Vienna, Austria" --category conference

  # add more photos to an existing album
  python3 tools/add_photos.py egu-2026 extra1.jpg extra2.jpg

Categories: field, conference, school, campus, travel
Captions: edit "caption" for each photo in gallery/gallery.json afterwards.
Needs Pillow:  pip3 install pillow
"""
import argparse
import json
import pathlib
import re
import sys

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAL = ROOT / "gallery"
DB = GAL / "gallery.json"
CATS = {"field", "conference", "school", "campus", "travel"}


def save(im, path, edge, quality):
    im = im.copy()
    im.thumbnail((edge, edge), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=quality, progressive=True, optimize=True)
    return im.size


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("album", help="short id, lower case with hyphens, e.g. egu-2026")
    ap.add_argument("photos", nargs="+")
    ap.add_argument("--title"); ap.add_argument("--date", help="YYYY-MM-DD, YYYY-MM or YYYY")
    ap.add_argument("--place"); ap.add_argument("--category", choices=sorted(CATS))
    a = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", a.album):
        sys.exit("album id must be lower case letters, digits and hyphens")

    db = json.loads(DB.read_text()) if DB.exists() else {"albums": []}
    album = next((x for x in db["albums"] if x["id"] == a.album), None)
    if album is None:
        if not (a.title and a.date and a.category):
            sys.exit("a new album needs --title, --date and --category")
        album = {"id": a.album, "title": a.title, "date": a.date, "place": a.place or "", "category": a.category, "cover": 0, "photos": []}
        db["albums"].append(album)
    else:
        for k in ("title", "date", "place", "category"):
            if getattr(a, k):
                album[k] = getattr(a, k)

    n = len(album["photos"])
    for src in a.photos:
        n += 1
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            name = f"{n:02d}.jpg"
            w, h = save(im, GAL / "photos" / a.album / name, 2000, 85)
            tw, th = save(im, GAL / "thumbs" / a.album / name, 700, 80)
        album["photos"].append({"src": f"gallery/photos/{a.album}/{name}", "thumb": f"gallery/thumbs/{a.album}/{name}",
                                "w": w, "h": h, "tw": tw, "th": th, "caption": ""})
        print(f"added {src} as {a.album}/{name}")

    db["albums"].sort(key=lambda x: x.get("date", ""), reverse=True)
    DB.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n")
    print(f"album {a.album}: {len(album['photos'])} photos. Add captions in gallery/gallery.json.")


if __name__ == "__main__":
    main()

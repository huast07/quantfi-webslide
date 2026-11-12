"""Render the slide images and extract the slide text from the exported deck PDF.

Export the PowerPoint deck to PDF, then run this from the repository's parent folder:

    python3 slideshow/tools/build_slides.py                 # uses ../Team05Quantifi2026.pdf
    python3 slideshow/tools/build_slides.py path/to/deck.pdf

It writes:
  - slideshow/pages/slide-NN.jpg       one 1600x900 image per slide (stale images are removed)
  - slideshow/data/slides.json         the text on each slide, used for the image alt text
  - slideshow/data/embedded.js         the same text, as the first element of window.presentationData

Needs poppler (pdftoppm, pdftotext, pdfinfo) on the PATH.
After a deck change, update slideshow/data/notes.js so it has one entry per slide; the tests check this.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = ROOT.parent / "Team05Quantifi2026.pdf"
PAGES = ROOT / "pages"
SLIDES_JSON = ROOT / "data" / "slides.json"
EMBEDDED_JS = ROOT / "data" / "embedded.js"
EMBEDDED_PREFIX = "window.presentationData = "

IMAGE_WIDTH = 1600
IMAGE_HEIGHT = 900
JPEG_QUALITY = 88
REQUIRED_TOOLS = ("pdfinfo", "pdftoppm", "pdftotext")

# Slides that are a single picture have no text layer, so their text is transcribed here.
# An entry is used only when the page really has no extractable text.
IMAGE_ONLY_TEXT = {
    42: [
        "Appendix K: Performance Attribution",
        "Where did the $417,529 historical replay P&L come from?",
        "Strategy-family contribution, three historical replay days",
        "S1 Market Making: 23.3%",
        "S3 Voucher RV: 38.9%, about $162,400",
        "S2 + S4 + S5 combined: 37.8%, about $157,705",
        "Concentration check: S3 voucher strategy is 38.9% of total P&L",
        "TOFFEE_CAKE individual product: $82,598, 19.8% of total",
        "Key takeaway: Profitable across multiple strategy families, but alpha is not evenly distributed.",
    ],
}


def run(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def page_count(pdf: Path) -> int:
    match = re.search(r"^Pages:\s+(\d+)", run("pdfinfo", str(pdf)), re.MULTILINE)
    if not match:
        raise SystemExit(f"Could not read the page count of {pdf}")
    return int(match.group(1))


def render_images(pdf: Path, count: int) -> None:
    """Render every page, then swap the pages folder's slide images for the new set."""
    with tempfile.TemporaryDirectory() as tmp:
        run(
            "pdftoppm", "-jpeg", "-jpegopt", f"quality={JPEG_QUALITY}",
            "-scale-to-x", str(IMAGE_WIDTH), "-scale-to-y", str(IMAGE_HEIGHT),
            str(pdf), str(Path(tmp) / "slide"),
        )
        rendered = sorted(Path(tmp).glob("slide-*.jpg"))
        if len(rendered) != count:
            raise SystemExit(f"Rendered {len(rendered)} images for {count} pages")
        PAGES.mkdir(exist_ok=True)
        for stale in PAGES.glob("slide-*.jpg"):
            stale.unlink()
        for number, image in enumerate(rendered, start=1):
            shutil.copyfile(image, PAGES / f"slide-{number:02d}.jpg")


def page_text(pdf: Path, number: int) -> list[str]:
    raw = run("pdftotext", "-f", str(number), "-l", str(number), str(pdf), "-")
    lines = [" ".join(line.split()) for line in raw.splitlines()]
    lines = [line for line in lines if line]
    if lines:
        return lines
    if number in IMAGE_ONLY_TEXT:
        return IMAGE_ONLY_TEXT[number]
    raise SystemExit(f"Slide {number} has no text layer. Add its text to IMAGE_ONLY_TEXT in {Path(__file__).name}.")


def embedded_with(slides: list[list[str]]) -> str:
    """The new content of data/embedded.js, with only the slide text replaced."""
    source = EMBEDDED_JS.read_text(encoding="utf-8")
    if not source.startswith(EMBEDDED_PREFIX):
        raise SystemExit(f"{EMBEDDED_JS} does not start with '{EMBEDDED_PREFIX}'")
    # Replace only the first array element (the slide text) and leave the rest of the file byte for byte.
    first = len(EMBEDDED_PREFIX) + 1
    if source[first - 1] != "[":
        raise SystemExit(f"{EMBEDDED_JS} does not hold an array")
    _, length = json.JSONDecoder().raw_decode(source[first:])
    return source[:first] + json.dumps(slides, ensure_ascii=False) + source[first + length:]


def main() -> None:
    pdf = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_PDF
    if not pdf.is_file():
        raise SystemExit(f"Deck PDF not found: {pdf}")
    missing = [tool for tool in REQUIRED_TOOLS if shutil.which(tool) is None]
    if missing:
        raise SystemExit(f"Missing {', '.join(missing)}. Install poppler (for example: brew install poppler).")
    count = page_count(pdf)
    slides = [page_text(pdf, number) for number in range(1, count + 1)]
    embedded = embedded_with(slides)  # validate before anything is written
    render_images(pdf, count)
    SLIDES_JSON.write_text(json.dumps(slides, ensure_ascii=False), encoding="utf-8")
    EMBEDDED_JS.write_text(embedded, encoding="utf-8")
    print(f"Wrote {count} slides from {pdf.name}: {PAGES.relative_to(ROOT)}/, {SLIDES_JSON.name}, {EMBEDDED_JS.name}")


if __name__ == "__main__":
    main()

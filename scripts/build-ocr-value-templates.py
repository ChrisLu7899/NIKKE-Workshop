"""Build the 9 x 15 legal affix-value image templates from reference tables.

The reference screenshots deliberately keep the in-game typeface.  Runtime OCR
uses the generated value-only crops as a constrained codebook; it never treats
these images as arbitrary text training data.
"""

from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "ocr" / "affix-value-tables"
OUTPUT = ROOT / "public" / "ocr" / "affix-value-templates"


def contiguous_runs(values: np.ndarray) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start = None
    for index, value in enumerate(values.tolist() + [False]):
        if value and start is None:
            start = index
        elif not value and start is not None:
            runs.append((start, index))
            start = None
    return runs


def find_row_bands(rgb: np.ndarray) -> list[tuple[int, int]]:
    luminance = (rgb[..., 0] * 0.299) + (rgb[..., 1] * 0.587) + (rgb[..., 2] * 0.114)
    # Every data row uses the same #e2e2e2 background.  Sample the text-free
    # outer margins so wide Chinese labels cannot split one row into fragments.
    margin = np.concatenate((luminance[:, 2:8], luminance[:, -8:-2]), axis=1)
    median_luminance = np.median(margin, axis=1)
    runs = [
        (start, end)
        for start, end in contiguous_runs((median_luminance >= 210) & (median_luminance <= 238))
        if end - start >= 18
    ]
    if len(runs) != 15:
        raise RuntimeError(f"expected 15 table rows, found {len(runs)}: {runs}")
    return runs


def crop_value(image: Image.Image, row: tuple[int, int]) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"))
    start, end = row
    x0 = int(rgb.shape[1] * 0.53)
    strip = rgb[start:end, x0:]
    luminance = (strip[..., 0] * 0.299) + (strip[..., 1] * 0.587) + (strip[..., 2] * 0.114)
    ink = luminance < 165
    column_runs = contiguous_runs(np.any(ink, axis=0))
    if not column_runs:
        raise RuntimeError(f"no value ink in row {row}")
    # The numeric value is the rightmost glyph cluster.  A wide gap separates
    # it from the tail of long Chinese labels that can enter the coarse crop.
    cluster_start = len(column_runs) - 1
    while cluster_start > 0 and column_runs[cluster_start][0] - column_runs[cluster_start - 1][1] <= 7:
        cluster_start -= 1
    value_left = column_runs[cluster_start][0]
    ink[:, :value_left] = False
    ys, xs = np.where(ink)
    if not len(xs):
        raise RuntimeError(f"no value ink in row {row}")
    left = max(0, int(xs.min()) - 3)
    right = min(strip.shape[1], int(xs.max()) + 4)
    top = max(0, int(ys.min()) - 3)
    bottom = min(strip.shape[0], int(ys.max()) + 4)
    return image.crop((x0 + left, start + top, x0 + right, start + bottom))


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for source_path in sorted(SOURCE.glob("*.png")):
        image = Image.open(source_path).convert("RGB")
        rows = find_row_bands(np.asarray(image))
        target = OUTPUT / source_path.stem
        target.mkdir(parents=True, exist_ok=True)
        for level, row in enumerate(rows, start=1):
            crop_value(image, row).save(target / f"{level}.png", optimize=True)
        print(f"{source_path.stem}: {len(rows)} templates")


if __name__ == "__main__":
    main()

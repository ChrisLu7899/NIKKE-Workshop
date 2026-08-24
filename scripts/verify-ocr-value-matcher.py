"""Developer diagnostic for the constrained affix-value template matcher."""

from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = Path(r"C:\Users\Lucifer\Desktop\NIKKE\screenshots")
TEMPLATES = ROOT / "public" / "ocr" / "affix-value-templates"

CASES = [
    ("2fa1a23f-a54c-403a-847b-e451f11682df.png", "IncElementDmg", 3, 10),
    ("44fe144b-50f8-4ba7-820d-dfe1b44cc3c6.png", "StatAtk", 2, 10),
    ("de9a9146-120b-436c-9057-10a2764ca28c.png", "StatAtk", 2, 9),
    ("de9a9146-120b-436c-9057-10a2764ca28c.png", "StatAmmoLoad", 3, 9),
    ("dfbd45d7-987d-4aa2-87f1-68c57496a768.png", "StatAtk", 2, 7),
    ("dfbd45d7-987d-4aa2-87f1-68c57496a768.png", "StatDef", 3, 4),
    ("99bff39a-eef5-4ac2-937b-25f20c3dcf11.png", "StatDef", 3, 1),
]


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


def mask_from_rgb(rgb: np.ndarray) -> np.ndarray:
    luminance = (rgb[..., 0] * 0.299) + (rgb[..., 1] * 0.587) + (rgb[..., 2] * 0.114)
    mask = luminance < 178
    # Remove only a genuinely continuous horizontal border.  A tight value
    # template can have ink on more than half of one row, so pixel density is
    # not a safe line detector (it used to erase the middle of the digits).
    for row_index, row in enumerate(mask):
        longest_run = max((end - start for start, end in contiguous_runs(row)), default=0)
        if longest_run >= max(24, round(mask.shape[1] * 0.72)):
            mask[row_index] = False
    ys, xs = np.where(mask)
    if not len(xs):
        return np.zeros((1, 1), dtype=np.uint8)
    mask = mask[max(0, ys.min() - 1):ys.max() + 2, max(0, xs.min() - 1):xs.max() + 2]
    return mask.astype(np.uint8)


def normalized(mask: np.ndarray, width: int = 160, height: int = 36) -> np.ndarray:
    image = Image.fromarray(mask * 255).resize((width, height), Image.Resampling.NEAREST)
    return np.asarray(image) > 0


def dilated(mask: np.ndarray, radius: int = 1) -> np.ndarray:
    padded = np.pad(mask, radius)
    result = np.zeros_like(mask)
    for dy in range(radius * 2 + 1):
        for dx in range(radius * 2 + 1):
            result |= padded[dy:dy + mask.shape[0], dx:dx + mask.shape[1]]
    return result


def score(left: np.ndarray, right: np.ndarray) -> float:
    left_runs = contiguous_runs(np.any(left, axis=0))
    right_runs = contiguous_runs(np.any(right, axis=0))
    overall = tolerant_mask_score(
        normalized(left, width=160, height=36),
        normalized(right, width=160, height=36),
    )
    if len(left_runs) != len(right_runs):
        return (overall * 0.45) + 0.5 + (abs(len(left_runs) - len(right_runs)) * 0.01)
    per_glyph = sum(
        glyph_score(left[:, left_start:left_end], right[:, right_start:right_end])
        for (left_start, left_end), (right_start, right_end) in zip(left_runs, right_runs)
    ) / max(1, len(left_runs))
    return (overall * 0.7) + (per_glyph * 0.3)


def glyph_score(left: np.ndarray, right: np.ndarray) -> float:
    left = normalized(left, width=28, height=36)
    right = normalized(right, width=28, height=36)
    return tolerant_mask_score(left, right)


def tolerant_mask_score(left: np.ndarray, right: np.ndarray) -> float:
    best = 1.0
    for dx in (-2, -1, 0, 1, 2):
        shifted = np.roll(right, dx, axis=1)
        if dx < 0:
            shifted[:, dx:] = False
        elif dx > 0:
            shifted[:, :dx] = False
        # Symmetric tolerant overlap is insensitive to minor anti-aliasing and
        # stroke-width differences between a game screenshot and the table.
        left_recall = np.logical_and(left, dilated(shifted)).sum() / max(1, left.sum())
        right_recall = np.logical_and(shifted, dilated(left)).sum() / max(1, shifted.sum())
        best = min(best, 1 - ((left_recall + right_recall) / 2))
    return best


def screenshot_value_mask(path: Path, position: int) -> tuple[np.ndarray, Image.Image]:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    panel_width = min(660, width - (8 if width < 670 else 14))
    # The fixed white panel is centered in all current game screenshots.
    panel_left = (width - panel_width) // 2
    panel_height = height - (21 if path.name.startswith("2fa") else 7 if path.name.startswith("44fe") else 24 if path.name.startswith("de9") else 17)
    panel_top = (height - panel_height) // 2
    row_height = panel_width * 0.054
    bottom_offset = panel_width * (0.405 - (0.0645 * (position - 1)))
    left = panel_left + (panel_width * 0.525)
    top = panel_top + panel_height - bottom_offset
    value_width = panel_width * 0.285
    crop = image.crop((round(left), round(top), round(left + value_width), round(top + row_height)))
    return mask_from_rgb(np.asarray(crop)), crop


def main() -> None:
    paths = {path.name: path for path in SCREENSHOTS.rglob("*.png")}
    for filename, function_type, position, expected in CASES:
        observed, crop = screenshot_value_mask(paths[filename], position)
        debug_dir = Path.home() / "AppData" / "Local" / "Temp" / "nikke-ocr-debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        crop.save(debug_dir / filename)
        Image.fromarray(observed * 255).save(debug_dir / f"mask-{filename}")
        ranked = []
        for level in range(1, 12):
            template = mask_from_rgb(np.asarray(Image.open(TEMPLATES / function_type / f"{level}.png").convert("RGB")))
            ranked.append((score(observed, template), level))
        ranked.sort()
        expected_template = mask_from_rgb(np.asarray(Image.open(TEMPLATES / function_type / f"{expected}.png").convert("RGB")))
        Image.fromarray(expected_template * 255).save(debug_dir / f"template-{filename}")
        print(filename, "expected", expected, "shapes", observed.shape, expected_template.shape, "ranked", ranked[:4])


if __name__ == "__main__":
    main()

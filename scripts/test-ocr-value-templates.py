"""Regression checks for reference-table crops; run after generating templates."""
import importlib.util
import unittest
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", ROOT / "scripts/build-ocr-value-templates.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

def ink(image):
    rgb = np.asarray(image.convert("RGB"))
    return (rgb @ np.array([.299, .587, .114])) < 165

class ValueTemplateTests(unittest.TestCase):
    def test_attack_829_preserves_the_complete_first_digit(self):
        image = Image.open(builder.SOURCE / "StatAtk.png").convert("RGB")
        row = builder.find_row_bands(np.asarray(image))[5]
        crop = builder.crop_value(image, row)
        # Independent source coordinates: the 8 occupies x=211..224 inclusive.
        source_digit = ink(image)[row[0]:row[1], 211:225]
        ys = np.where(source_digit.any(axis=1))[0]
        observed = ink(crop)
        runs = builder.contiguous_runs(observed.any(axis=0))
        self.assertEqual(len(runs), 5)  # 8 . 2 9 %
        x0, x1 = runs[0]
        actual = observed[:, x0:x1]
        ay = np.where(actual.any(axis=1))[0]
        np.testing.assert_array_equal(actual[ay[0]:ay[-1]+1], source_digit[ys[0]:ys[-1]+1])

    def test_all_135_saved_templates_match_source_and_keep_padding(self):
        count = 0
        for source in sorted(builder.SOURCE.glob("*.png")):
            image = Image.open(source).convert("RGB")
            rows = builder.find_row_bands(np.asarray(image))
            self.assertEqual(len(rows), 15)
            for level, row in enumerate(rows, 1):
                with self.subTest(stat=source.stem, level=level):
                    generated = builder.crop_value(image, row)
                    saved = Image.open(builder.OUTPUT / source.stem / f"{level}.png").convert("RGB")
                    np.testing.assert_array_equal(np.asarray(generated), np.asarray(saved))
                    mask = ink(saved)
                    self.assertFalse(mask[:, :3].any())
                    self.assertFalse(mask[:, -3:].any())
                    self.assertGreater(len(builder.contiguous_runs(mask.any(axis=0))), 3)
                    count += 1
        self.assertEqual(count, 135)

    def test_value_to_left_of_old_boundary_and_long_label_are_separated(self):
        rgb = np.full((30, 420, 3), 226, dtype=np.uint8)
        rgb[8:22, 90:195] = 50  # label, separated by whitespace
        for start in [210, 224, 238, 252, 266]:
            rgb[8:22, start:start+10] = 50
        crop = builder.crop_value(Image.fromarray(rgb), (0, 30))
        runs = builder.contiguous_runs(ink(crop).any(axis=0))
        self.assertEqual([b-a for a,b in runs], [10]*5)

if __name__ == "__main__":
    unittest.main()

// SPDX-License-Identifier: GPL-3.0-or-later

import assert from "node:assert/strict";
import test from "node:test";
import { findArtworkCoverageGaps, visibleCharacterIds } from "../scripts/check-character-artwork-coverage.mjs";

test("release coverage reads visible playable resource IDs independent of rarity", () => {
  assert.deepEqual(visibleCharacterIds([
    { ResourceId: 404, IsVisible: true, IsDetailClose: false, OriginalRare: 3 },
    { ResourceId: 405, IsVisible: true, IsDetailClose: false, OriginalRare: 2 },
    { ResourceId: 404, IsVisible: true, IsDetailClose: false },
    { ResourceId: 406, IsVisible: false, IsDetailClose: false },
    { ResourceId: 407, IsVisible: true, IsDetailClose: true },
  ]), ["404", "405"]);
});

test("release coverage fails when a visible character lacks default art or provenance", () => {
  const catalog = { characters: {
    "404": [{ id: "default", assetId: "c404", url: "/ui-assets/nikke/character-artwork/c404.webp" }],
  } };
  const provenance = { assets: {
    c404: { sourceAssetId: "c404_00", outputSha256: "a".repeat(64) },
  } };
  assert.deepEqual(findArtworkCoverageGaps(["404"], catalog, provenance), []);
  assert.deepEqual(findArtworkCoverageGaps(["404", "405"], catalog, provenance), [
    "c405: default artwork mapping missing or incorrect",
    "c405: validated source provenance missing or incorrect",
  ]);
});

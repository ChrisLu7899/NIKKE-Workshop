// SPDX-License-Identifier: GPL-3.0-or-later

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import characterArtworkCatalog from "../src/data/characterArtworkCatalog.json" with { type: "json" };
import {
  buildImportPlan,
  getArtworkKind,
  mergeLobbyBurstEntries,
  normalizeStaticSourceAssetId,
  staticSourceAssetIdFor,
  artworkRecipe,
  validLobbyDimensions,
  artworkReviewUnchanged,
  acceptedLobbyManifest,
  currentPackageSource,
  resourceKeyMatchesBundle,
  hashBoundReview,
  reconcileCatalogWithStaticInventory,
  mergeApprovedRegionalEntries,
} from "../scripts/sync-character-artwork.mjs";

const artworkRoot = new URL("../public/ui-assets/nikke/character-artwork/", import.meta.url);
const provenance = JSON.parse(readFileSync(new URL("extracted-sources.json", artworkRoot), "utf8"));
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");

test("Drake Great Villain has independent default and skill artwork, not a Drake costume", () => {
  const entries = characterArtworkCatalog.characters["104"];
  assert.deepEqual(entries.map(({ id, assetId }) => ({ id, assetId })), [
    { id: "default", assetId: "c104" },
    { id: "lobby-burst-default", assetId: "lobby_burst_c104_00" },
  ]);
  for (const entry of entries) {
    const source = provenance.assets[entry.assetId];
    assert.equal(source.resourceNumber, "104");
    assert.equal(digest(readFileSync(new URL(`${entry.assetId}.webp`, artworkRoot))), source.outputSha256);
    assert.ok(!characterArtworkCatalog.characters["101"].some((item) => item.assetId === entry.assetId));
  }
  assert.ok(!provenance.unmappedStaticSources.includes("c104_00"));
  assert.ok(!provenance.unmappedLobbyBurstSources.includes("c104_00"));
});

test("extracted artwork IDs map base models and costumes deterministically", () => {
  assert.equal(normalizeStaticSourceAssetId("c010_00"), "c010");
  assert.equal(normalizeStaticSourceAssetId("c010_02"), "c010_02");
  assert.equal(normalizeStaticSourceAssetId("favorite_c010"), "");
  assert.equal(staticSourceAssetIdFor("c010"), "c010_00");
  assert.equal(staticSourceAssetIdFor("c010_02"), "c010_02");
  assert.equal(getArtworkKind("favorite_c352"), "favorite");
  assert.equal(getArtworkKind("lobby_burst_c330_01"), "lobby-burst");
  assert.equal(getArtworkKind("skill_c330_00"), "preserved");
  assert.equal(getArtworkKind("c082_80"), "preserved");
});

test("validated lobby burst artwork is appended by matching character and costume id", () => {
  const catalog = {
    characters: {
      "330": [
        { id: "default", label: "默认", assetId: "c330", url: "/c330.webp" },
        { id: "skin-1", label: "国王的新衣", assetId: "c330_01", url: "/c330_01.webp" },
        { id: "skin-2", label: "荣耀之花", assetId: "c330_02", url: "/c330_02.webp" },
      ],
    },
  };
  const merged = mergeLobbyBurstEntries(catalog, new Map([
    ["lobby_burst_c330_00", {}],
    ["lobby_burst_c330_01", {}],
    ["lobby_burst_c901_00", {}],
  ]));
  assert.deepEqual(merged.characters["330"].slice(-2), [
    {
      id: "lobby-burst-default",
      label: "技能动画 · 默认",
      assetId: "lobby_burst_c330_00",
      url: "/ui-assets/nikke/character-artwork/lobby_burst_c330_00.webp",
    },
    {
      id: "lobby-burst-skin-1",
      label: "技能动画 · 国王的新衣",
      assetId: "lobby_burst_c330_01",
      url: "/ui-assets/nikke/character-artwork/lobby_burst_c330_01.webp",
    },
  ]);
  assert.ok(!merged.characters["330"].some((item) => item.assetId === "lobby_burst_c330_02"));
  assert.ok(!JSON.stringify(merged).includes("c901"));
});

test("catalog remains the allowlist while validated inventories supply files", () => {
  const catalog = {
    characters: {
      "010": [
        { id: "default", assetId: "c010" },
        { id: "skin-3", assetId: "c010_03" },
      ],
      "352": [{ id: "favorite-item", assetId: "favorite_c352" }],
      "330": [{ id: "skill-default", assetId: "skill_c330_00" }],
      "511": [{ id: "lobby-burst-default", assetId: "lobby_burst_c511_00" }],
    },
  };
  const staticSource = { sourceAssetId: "c010_00" };
  const favoriteSource = { sourceAssetId: "FavoriteItemScene_c352_00" };
  const lobbyBurstSource = { sourceAssetId: "c511_00" };
  const plan = buildImportPlan(
    catalog,
    new Map([["c010", staticSource]]),
    new Map([["favorite_c352", favoriteSource]]),
    new Map([["lobby_burst_c511_00", lobbyBurstSource]]),
  );
  assert.equal(plan.find((entry) => entry.assetId === "c010").source, staticSource);
  assert.equal(plan.find((entry) => entry.assetId === "favorite_c352").source, favoriteSource);
  assert.equal(plan.find((entry) => entry.assetId === "c010_03").source, undefined);
  assert.equal(plan.find((entry) => entry.assetId === "skill_c330_00").source, null);
  assert.equal(plan.find((entry) => entry.assetId === "lobby_burst_c511_00").source, lobbyBurstSource);
});

test("regular catalog entries are limited to current validated static outputs", () => {
  const catalog = {
    characters: {
      "010": [
        { id: "default", assetId: "c010" },
        { id: "stale-skin", assetId: "c010_03" },
        { id: "favorite-item", assetId: "favorite_c010" },
        { id: "skill-default", assetId: "skill_c010_00" },
      ],
    },
  };
  const reconciled = reconcileCatalogWithStaticInventory(
    catalog,
    new Map([["c010", { sourceAssetId: "c010_00" }]]),
  );
  assert.deepEqual(reconciled.characters["010"].map((item) => item.assetId), [
    "c010",
    "favorite_c010",
    "skill_c010_00",
  ]);
});

test("approved regional costumes remain dedicated preserved artwork", () => {
  const merged = mergeApprovedRegionalEntries({
    characters: {
      "082": [{ id: "default", assetId: "c082" }],
      "233": [{ id: "default", assetId: "c233" }],
      "260": [{ id: "default", assetId: "c260" }],
    },
  });
  for (const resource of ["082", "233", "260"]) {
    assert.deepEqual(merged.characters[resource].at(-1), {
      id: "skin-80",
      label: "国服特供立绘",
      assetId: `c${resource}_80`,
      url: `/ui-assets/nikke/character-artwork/c${resource}_80.webp`,
    });
  }
  assert.deepEqual(mergeApprovedRegionalEntries(merged), merged);
});

test("generated provenance contains only portable validated-output references", () => {
  const serialized = JSON.stringify(provenance);
  assert.equal(provenance.source, "NIKKE_files validated extracted asset library");
  assert.equal(provenance.importedCount, 618);
  assert.equal(provenance.preservedCount, 3);
  assert.deepEqual(provenance.excludedSources, ["c010_01", "c600_02", "c601_02"]);
  assert.ok(provenance.unmappedStaticSources.length > 0);
  assert.deepEqual(provenance.unmappedLobbyBurstSources, ["c013_00", "c610_00", "c901_00", "c907_00", "c993_00"]);
  assert.deepEqual(provenance.unresolvedLobbyBurstSources, []);
  assert.ok(!/[A-Z]:\\/i.test(serialized));
  assert.ok(!serialized.includes("original_bundle"));
  assert.ok(!serialized.includes("readable_bundle"));
});

test("every imported catalog asset matches its recorded output hash", async () => {
  assert.equal(characterArtworkCatalog.source, provenance.source);
  for (const [assetId, record] of Object.entries(provenance.assets)) {
    const outputUrl = new URL(`${assetId}.webp`, artworkRoot);
    assert.ok(existsSync(outputUrl), `${assetId} output exists`);
    const output = readFileSync(outputUrl);
    assert.equal(digest(output), record.outputSha256, `${assetId} output hash`);
  }
  for (const assetId of ["c010", "favorite_c352"]) {
    const metadata = await sharp(fileURLToPath(new URL(`${assetId}.webp`, artworkRoot))).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1600);
    assert.equal(metadata.height, 1600);
    assert.equal(metadata.hasAlpha, true);
  }
  for (const assetId of ["lobby_burst_c330_01", "lobby_burst_c102_00"]) {
    const metadata = await sharp(fileURLToPath(new URL(`${assetId}.webp`, artworkRoot))).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1105);
    assert.equal(metadata.height, 1300);
  }
  for (const id of ["c016_00", "c222_00", "c222_01", "c330_00", "c352_00", "c352_02", "c511_01", "c513_01"]) {
    const assetId = `lobby_burst_${id}`;
    const record = provenance.assets[assetId];
    assert.equal(record.visualCheck, "reviewed_source_limitation");
    assert.ok(["1.1.0", "1.2.0", "1.2.1"].includes(record.nativeVersion), `${assetId} accepted reviewed renderer`);
    assert.equal(record.previewStatus, "native_timeline_partial_preview");
    assert.ok(record.visualLimitation);
    const metadata = await sharp(fileURLToPath(new URL(`${assetId}.webp`, artworkRoot))).metadata();
    assert.equal(metadata.width, 1105);
    assert.equal(metadata.height, 1300);
  }
});

test("lobby imports require the current package and a review bound to exact pixels", () => {
  const sha = "a".repeat(64);
  const bundleHash = "b".repeat(32);
  const manifest = { character_id: "c082_00", native_version: "1.1.0",
    preview_status: "native_timeline_partial_preview", program_validation: "passed",
    visual_validation: "reviewed_source_limitation", output_sha256: sha,
    bundle_hash: bundleHash,
    resource_key: `livewallpaper/eventscene_${bundleHash}.bundle`,
    original_path: `E:\\NIKKE\\Unity\\com_proximabeta_NIKKE\\com.shiftup.patch\\core\\chunk\\store.cdb::livewallpaper/eventscene_${bundleHash}.bundle`,
    visual_review_evidence: { character_id: "c082_00", sha256: sha } };
  assert.equal(acceptedLobbyManifest(manifest), true);
  assert.equal(acceptedLobbyManifest({ ...manifest, native_version: "1.2.0" }), true);
  assert.equal(acceptedLobbyManifest({ ...manifest, native_version: "1.2.1" }), true);
  assert.equal(acceptedLobbyManifest({ ...manifest, native_version: "1.2.4" }), true);
  assert.equal(acceptedLobbyManifest({ ...manifest, native_version: "1.2.4", output_sha256: "c".repeat(64) }), false);
  assert.equal(acceptedLobbyManifest({ ...manifest, native_version: "1.2.5" }), true);
  assert.equal(acceptedLobbyManifest({ ...manifest, native_version: "1.2.5", output_sha256: "c".repeat(64) }), false);
  assert.equal(acceptedLobbyManifest({ ...manifest, native_version: "1.2.0", output_sha256: "c".repeat(64) }), false);
  assert.equal(acceptedLobbyManifest({ ...manifest, native_version: "1.3.0" }), false);
  assert.equal(acceptedLobbyManifest({ ...manifest, visual_review_evidence: undefined }), false);
  assert.equal(acceptedLobbyManifest({ ...manifest, output_sha256: "b".repeat(64) }), false);
  assert.equal(acceptedLobbyManifest({ ...manifest, program_validation: "failed" }), false);
  assert.equal(acceptedLobbyManifest({ ...manifest, native_version: "0.4.0" }), false);
  assert.equal(acceptedLobbyManifest({ ...manifest, original_path: `E:\\NIKKE\\Unity\\com_proximabeta_NIKKE\\naps\\${bundleHash}` }), false);
  assert.equal(currentPackageSource(manifest, "original_path"), true);
  assert.equal(resourceKeyMatchesBundle(manifest), true);
  assert.equal(hashBoundReview(manifest), true);
});

test("native entries replace only exact legacy scenes and merging is idempotent", () => {
  const catalog = { characters: { "330": [
    { id: "default", assetId: "c330", label: "默认" },
    { id: "skin-1", assetId: "c330_01", label: "国王的新衣" },
    { id: "skill-default", assetId: "skill_c330_00" },
    { id: "skill-skin-1", assetId: "skill_c330_01" },
    { id: "favorite-item", assetId: "favorite_c330" },
  ] } };
  const inventory = new Map([["lobby_burst_c330_00", {}]]);
  const merged = mergeLobbyBurstEntries(catalog, inventory);
  assert.ok(!merged.characters["330"].some(r => r.assetId === "skill_c330_00"));
  assert.ok(merged.characters["330"].some(r => r.assetId === "skill_c330_01"));
  assert.ok(merged.characters["330"].some(r => r.assetId === "favorite_c330"));
  assert.deepEqual(mergeLobbyBurstEntries(merged, inventory), merged);
});

test("portrait import accepts released native scene contracts without dropping retained artwork", () => {
  const native = { nativeVersion: "1.1.0", previewStatus: "native_timeline_partial_preview" };
  assert.equal(validLobbyDimensions({ width: 900, height: 1600 }), false);
  assert.equal(validLobbyDimensions({ width: 1105, height: 1300 }, native), true);
  assert.equal(validLobbyDimensions({ width: 1105, height: 1300 }, { ...native, nativeVersion: "1.2.0" }), true);
  assert.equal(validLobbyDimensions({ width: 1105, height: 1300 }, { ...native, nativeVersion: "1.2.1" }), true);
  assert.equal(validLobbyDimensions({ width: 1105, height: 1300 }, { ...native, nativeVersion: "1.2.4" }), true);
  assert.equal(validLobbyDimensions({ width: 1105, height: 1300 }, { ...native, nativeVersion: "1.2.5" }), true);
  assert.equal(validLobbyDimensions({ width: 1105, height: 1300 }, { ...native, nativeVersion: "1.3.0" }), false);
  assert.equal(validLobbyDimensions({ width: 1920, height: 1080 }, native), false);
  assert.equal(validLobbyDimensions({ width: 1105, height: 1300 }, { nativeVersion: "0.4.0", previewStatus: "native_timeline_partial_preview" }), false);
  assert.equal(validLobbyDimensions({ width: 1920, height: 1080 }), false);
  assert.equal(artworkRecipe("lobby-burst"), "timeline-portrait-1105x1300-v2:webp-q94-effort5");
  assert.equal(artworkReviewUnchanged(native, native), true);
  assert.equal(artworkReviewUnchanged(native, { ...native, nativeVersion: "0.4.0" }), false);
  assert.equal(artworkReviewUnchanged(native, { ...native, visualLimitation: "Updated review" }), false);
});

test("the sync implementation has no browser, visualiser, or network capture path", () => {
  const source = readFileSync(new URL("../scripts/sync-character-artwork.mjs", import.meta.url), "utf8");
  assert.ok(!source.includes("playwright"));
  assert.ok(!source.includes("chromium"));
  assert.ok(!source.includes("nikke-db.pages.dev"));
  assert.ok(!source.includes("toDataURL"));
  assert.ok(!/\bfetch\s*\(/.test(source));
});

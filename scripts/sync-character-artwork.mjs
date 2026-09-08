// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const ARTWORK_DIR = path.join(ROOT, "public", "ui-assets", "nikke", "character-artwork");
const PUBLIC_CATALOG_PATH = path.join(ARTWORK_DIR, "catalog.json");
const SOURCE_CATALOG_PATH = path.join(ROOT, "src", "data", "characterArtworkCatalog.json");
const PROVENANCE_PATH = path.join(ARTWORK_DIR, "extracted-sources.json");
const DEFAULT_ASSET_LIBRARY_ROOT = path.resolve(ROOT, "..", "..", "..", "NIKKE_files", "output");
const SOURCE_NAME = "NIKKE_files validated extracted asset library";
const OUTPUT_SIZE = 1600;
// Released pixel contracts may coexist during a scoped material-library update.
// Each still requires the current package and a review bound to its exact PNG.
const ACCEPTED_NATIVE_VERSIONS = new Set(["1.1.0", "1.2.0", "1.2.1", "1.2.2", "1.2.3"]);
const CURRENT_TREASURE_PIPELINE = "2.2.0";
const EXCLUDED_ARTWORK_IDS = new Set(["c010_01", "c600_02", "c601_02"]);
const APPROVED_REGIONAL_ARTWORK_IDS = new Set(["c082_80", "c233_80", "c260_80"]);
const RECIPES = Object.freeze({
  regular: "square-transparent-v1:webp-q90-alpha100-effort5",
  favorite: "square-transparent-v1:webp-q94-alpha100-effort5",
  "lobby-burst": "timeline-portrait-1105x1300-v2:webp-q94-effort5",
});

export const artworkRecipe = (kind) => RECIPES[kind];

export const artworkReviewUnchanged = (previous = {}, source = {}) => [
  "nativeVersion", "previewStatus", "visualCheck", "visualLimitation", "programCheck", "repeatValidation",
].every((key) => String(previous[key] || "") === String(source[key] || ""));

export const currentPackageSource = (manifest, field) => {
  const source = String(manifest?.[field] || "").replaceAll("\\", "/").toLowerCase();
  return source.includes("/com.shiftup.patch/")
    && source.includes("store.cdb::")
    && !source.includes("/naps/");
};

export const resourceKeyMatchesBundle = (manifest) => {
  const hash = String(manifest?.bundle_hash || "").toLowerCase();
  const key = String(manifest?.resource_key || "").toLowerCase();
  return /^[a-f0-9]{32}$/.test(hash) && key.endsWith(`_${hash}.bundle`);
};

export const hashBoundReview = (manifest) => {
  const outputHash = String(manifest?.output_sha256 || "").toLowerCase();
  const reviewHash = String(manifest?.visual_review_evidence?.sha256 || "").toLowerCase();
  return /^[a-f0-9]{64}$/.test(outputHash) && reviewHash === outputHash;
};

export const acceptedLobbyManifest = (manifest) => {
  const visual = String(manifest.visual_validation || "");
  return manifest.program_validation === "passed"
    && (visual.startsWith("passed") || visual === "reviewed_source_limitation")
    && manifest.preview_status === "native_timeline_partial_preview"
    && ACCEPTED_NATIVE_VERSIONS.has(manifest.native_version)
    && currentPackageSource(manifest, "original_path")
    && resourceKeyMatchesBundle(manifest)
    && hashBoundReview(manifest);
};

export const validLobbyDimensions = (metadata, source = {}) => ACCEPTED_NATIVE_VERSIONS.has(source.nativeVersion)
  && source.previewStatus === "native_timeline_partial_preview"
  && metadata.width === 1105
  && metadata.height === 1300;

const toPortablePath = (value) => String(value).split(path.sep).join("/");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));

const pathExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const readArg = (name) => {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
};

export const normalizeStaticSourceAssetId = (sourceAssetId) => {
  const match = String(sourceAssetId || "").match(/^(c\d{3,4})_(\d{2})$/);
  if (!match) return "";
  return match[2] === "00" ? match[1] : `${match[1]}_${match[2]}`;
};

export const staticSourceAssetIdFor = (assetId) => {
  const match = String(assetId || "").match(/^(c\d{3,4})(?:_(\d{2}))?$/);
  if (!match) return "";
  return match[2] ? assetId : `${assetId}_00`;
};

export const getArtworkKind = (assetId) => {
  if (APPROVED_REGIONAL_ARTWORK_IDS.has(String(assetId || ""))) return "preserved";
  if (/^c\d{3,4}(?:_\d{2})?$/.test(String(assetId || ""))) return "regular";
  if (/^favorite_c\d{3,4}$/.test(String(assetId || ""))) return "favorite";
  if (/^lobby_burst_c\d{3,4}_\d{2}$/.test(String(assetId || ""))) return "lobby-burst";
  return "preserved";
};

export const mergeApprovedRegionalEntries = (catalog) => ({
  ...catalog,
  characters: Object.fromEntries(
    Object.entries(catalog?.characters || {}).map(([resourceNumber, artworks]) => {
      const entries = Array.isArray(artworks) ? artworks : [];
      const assetId = `c${resourceNumber}_80`;
      if (!APPROVED_REGIONAL_ARTWORK_IDS.has(assetId)
        || entries.some((artwork) => artwork.assetId === assetId)) {
        return [resourceNumber, entries];
      }
      return [resourceNumber, [...entries, {
        id: "skin-80",
        label: "国服特供立绘",
        assetId,
        url: `/ui-assets/nikke/character-artwork/${assetId}.webp`,
      }]];
    }),
  ),
});

export const flattenCatalog = (catalog) => Object.entries(catalog?.characters || {})
  .flatMap(([resourceNumber, artworks]) => (Array.isArray(artworks) ? artworks : []).map((artwork) => ({
    ...artwork,
    resourceNumber,
    kind: getArtworkKind(artwork?.assetId),
  })));

export const buildImportPlan = (catalog, staticInventory, favoriteInventory, lobbyBurstInventory = new Map()) => {
  const entries = flattenCatalog(catalog);
  const duplicateKeys = new Set();
  const seenKeys = new Set();
  for (const entry of entries) {
    const key = `${entry.resourceNumber}:${entry.id}`;
    if (seenKeys.has(key)) duplicateKeys.add(key);
    seenKeys.add(key);
    if (EXCLUDED_ARTWORK_IDS.has(entry.assetId)) {
      throw new Error(`Excluded artwork is present in the catalog: ${entry.assetId}`);
    }
  }
  if (duplicateKeys.size) throw new Error(`Duplicate catalog artwork IDs: ${[...duplicateKeys].join(", ")}`);
  return entries.map((entry) => ({
    ...entry,
    source: entry.kind === "regular"
      ? staticInventory.get(entry.assetId)
      : entry.kind === "favorite"
        ? favoriteInventory.get(entry.assetId)
        : entry.kind === "lobby-burst"
          ? lobbyBurstInventory.get(entry.assetId)
          : null,
  }));
};

export const reconcileCatalogWithStaticInventory = (catalog, staticInventory) => ({
  ...catalog,
  characters: Object.fromEntries(
    Object.entries(catalog?.characters || {}).map(([resourceNumber, artworks]) => [
      resourceNumber,
      (Array.isArray(artworks) ? artworks : []).filter((artwork) => {
        if (getArtworkKind(artwork?.assetId) !== "regular") return true;
        return staticInventory.has(artwork.assetId);
      }),
    ]),
  ),
});

export const mergeLobbyBurstEntries = (catalog, lobbyBurstInventory) => {
  const characters = Object.fromEntries(Object.entries(catalog?.characters || {}).map(([resourceNumber, artworks]) => {
    const baseArtworks = (Array.isArray(artworks) ? artworks : [])
      .filter((artwork) => getArtworkKind(artwork?.assetId) !== "lobby-burst");
    const lobbyArtworks = baseArtworks
      .filter((artwork) => getArtworkKind(artwork?.assetId) === "regular")
      .map((artwork) => {
        const sourceAssetId = staticSourceAssetIdFor(artwork.assetId);
        const assetId = `lobby_burst_${sourceAssetId}`;
        if (!lobbyBurstInventory.has(assetId)) return null;
        const version = sourceAssetId.match(/_(\d{2})$/)?.[1] || "00";
        const isDefault = version === "00";
        return {
          id: isDefault ? "lobby-burst-default" : `lobby-burst-skin-${Number(version)}`,
          label: `技能动画 · ${isDefault ? "默认" : artwork.label}`,
          assetId,
          url: `/ui-assets/nikke/character-artwork/${assetId}.webp`,
        };
      })
      .filter(Boolean);
    const replacements = new Set(lobbyArtworks.map((artwork) => artwork.assetId));
    const retained = baseArtworks.filter((artwork) => {
      const legacy = String(artwork.assetId || "").match(/^skill_(c\d{3,4}_\d{2})$/);
      return !legacy || !replacements.has(`lobby_burst_${legacy[1]}`);
    });
    return [resourceNumber, [...retained, ...lobbyArtworks]];
  }));
  return { ...catalog, characters };
};

const discoverStaticArtwork = async (assetLibraryRoot) => {
  const root = path.join(assetLibraryRoot, "static_art");
  const inventory = new Map();
  for (const directory of await fs.readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const assetId = normalizeStaticSourceAssetId(directory.name);
    if (!assetId) continue;
    const directoryPath = path.join(root, directory.name);
    const manifestPath = path.join(directoryPath, "manifest.json");
    const imagePath = path.join(directoryPath, `${directory.name}.png`);
    if (!(await pathExists(manifestPath)) || !(await pathExists(imagePath))) continue;
    const manifest = await readJson(manifestPath);
    const accepted = manifest.asset_id === directory.name
      && manifest.classification === "single_spine"
      && manifest.render_schema === "static-render-v1"
      && manifest.review_status === "passed"
      && currentPackageSource(manifest, "original_bundle_path")
      && resourceKeyMatchesBundle(manifest)
      && hashBoundReview(manifest);
    if (!accepted) continue;
    if (inventory.has(assetId)) throw new Error(`Duplicate normalized static artwork source: ${assetId}`);
    inventory.set(assetId, {
      kind: "regular",
      sourceAssetId: directory.name,
      imagePath,
      manifestPath,
      sourceRelative: `static_art/${directory.name}/${directory.name}.png`,
      manifestRelative: `static_art/${directory.name}/manifest.json`,
      bundleHash: String(manifest.bundle_hash || ""),
      declaredSha256: String(manifest.output_sha256 || "").toLowerCase(),
      visualCheck: String(manifest.review_status || ""),
    });
  }
  return inventory;
};

const discoverFavoriteArtwork = async (assetLibraryRoot) => {
  const root = path.join(assetLibraryRoot, "treasure_backgrounds");
  const inventory = new Map();
  for (const directory of await fs.readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory() || !/^c\d{3,4}$/.test(directory.name)) continue;
    const directoryPath = path.join(root, directory.name);
    const manifestPath = path.join(directoryPath, "manifest.json");
    if (!(await pathExists(manifestPath))) continue;
    const manifest = await readJson(manifestPath);
    const assetId = `favorite_${directory.name}`;
    const outputName = path.basename(String(manifest.output_png || ""));
    const imagePath = path.join(directoryPath, outputName);
    const checksPassed = manifest.programmatic_check === "passed"
      && manifest.pipeline_version === CURRENT_TREASURE_PIPELINE
      && manifest.visual_check === "passed"
      && currentPackageSource(manifest, "source_bundle")
      && resourceKeyMatchesBundle(manifest)
      && /^[a-f0-9]{64}$/i.test(String(manifest.readable_bundle_sha256 || ""))
      && hashBoundReview(manifest);
    if (manifest.character_id !== directory.name || !outputName || !checksPassed || !(await pathExists(imagePath))) continue;
    inventory.set(assetId, {
      kind: "favorite",
      sourceAssetId: String(manifest.asset_id || assetId),
      imagePath,
      manifestPath,
      sourceRelative: `treasure_backgrounds/${directory.name}/${outputName}`,
      manifestRelative: `treasure_backgrounds/${directory.name}/manifest.json`,
      bundleHash: String(manifest.bundle_hash || ""),
      declaredSha256: String(manifest.output_sha256 || "").toLowerCase(),
      visualCheck: String(manifest.visual_check || ""),
    });
  }
  return inventory;
};

const discoverLobbyBurstArtwork = async (assetLibraryRoot) => {
  const root = path.join(assetLibraryRoot, "lobby_burst_static");
  const inventory = new Map();
  for (const directory of await fs.readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory() || !/^c\d{3,4}_\d{2}$/.test(directory.name)) continue;
    const directoryPath = path.join(root, directory.name);
    const manifestPath = path.join(directoryPath, "manifest.json");
    if (!(await pathExists(manifestPath))) continue;
    const manifest = await readJson(manifestPath);
    const outputName = path.basename(String(manifest.output_png || ""));
    const imagePath = path.join(directoryPath, outputName);
    const visualValidation = String(manifest.visual_validation || "");
    const checksPassed = acceptedLobbyManifest(manifest);
    if (manifest.character_id !== directory.name || !outputName || !checksPassed || !(await pathExists(imagePath))) continue;
    const assetId = `lobby_burst_${directory.name}`;
    inventory.set(assetId, {
      kind: "lobby-burst",
      sourceAssetId: directory.name,
      imagePath,
      manifestPath,
      sourceRelative: `lobby_burst_static/${directory.name}/${outputName}`,
      manifestRelative: `lobby_burst_static/${directory.name}/manifest.json`,
      bundleHash: String(manifest.bundle_hash || ""),
      declaredSha256: String(manifest.output_sha256 || "").toLowerCase(),
      visualCheck: visualValidation,
      visualLimitation: String(manifest.visual_limitation || ""),
      previewStatus: String(manifest.preview_status || ""),
      nativeVersion: String(manifest.native_version || ""),
      programCheck: String(manifest.program_validation || ""),
      repeatValidation: String(manifest.repeat_checks || ""),
    });
  }
  return inventory;
};

const readUnresolvedLobbyBurstSources = async (assetLibraryRoot) => {
  const reportPath = path.join(assetLibraryRoot, "lobby_burst_static", "批量处理报告.json");
  if (!(await pathExists(reportPath))) return [];
  const report = await readJson(reportPath);
  return (Array.isArray(report.items) ? report.items : [])
    .filter((item) => item?.source_status !== "ready")
    .map((item) => ({
      sourceAssetId: String(item?.character_id || ""),
      status: String(item?.source_status || item?.status || "unresolved"),
    }))
    .filter((item) => item.sourceAssetId)
    .sort((left, right) => left.sourceAssetId.localeCompare(right.sourceAssetId, "en", { numeric: true }));
};

const encodeArtwork = async (sourcePath, kind, sourceInfo = {}) => {
  const source = sharp(sourcePath, { failOn: "error" });
  const metadata = await source.metadata();
  if (kind === "lobby-burst") {
    if (!validLobbyDimensions(metadata, sourceInfo)) {
      throw new Error(`Invalid lobby burst dimensions: ${sourcePath}`);
    }
    return source
      .webp({ quality: 94, smartSubsample: true, effort: 5 })
      .toBuffer();
  }
  if (!metadata.width || !metadata.height || !metadata.hasAlpha) {
    throw new Error(`Invalid transparent artwork: ${sourcePath}`);
  }
  const prepared = await source
    .resize({ width: OUTPUT_SIZE, height: OUTPUT_SIZE, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  if (prepared.info.width > OUTPUT_SIZE || prepared.info.height > OUTPUT_SIZE) {
    throw new Error(`Artwork exceeds ${OUTPUT_SIZE}px after normalization: ${sourcePath}`);
  }
  const left = Math.floor((OUTPUT_SIZE - prepared.info.width) / 2);
  const top = Math.floor((OUTPUT_SIZE - prepared.info.height) / 2);
  const quality = kind === "favorite" ? 94 : 90;
  return sharp({
    create: {
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: prepared.data, left, top }])
    .webp({ quality, alphaQuality: 100, smartSubsample: true, effort: 5 })
    .toBuffer();
};

const catalogWithMetadata = (catalog) => {
  const characters = catalog?.characters || {};
  return {
    ...catalog,
    schemaVersion: 1,
    revision: new Date().toISOString().slice(0, 10),
    source: SOURCE_NAME,
    characterCount: Object.keys(characters).length,
    artworkCount: Object.values(characters).reduce(
      (total, artworks) => total + (Array.isArray(artworks) ? artworks.length : 0),
      0,
    ),
    characters,
  };
};

const buildProvenanceEntry = ({ entry, source, sourceSha256, outputBuffer, outputMetadata }) => ({
  type: entry.kind === "favorite"
    ? "treasure-background"
    : entry.kind === "lobby-burst"
      ? "lobby-burst-static"
      : "static-art",
  resourceNumber: entry.resourceNumber,
  sourceAssetId: source.sourceAssetId,
  source: source.sourceRelative,
  manifest: source.manifestRelative,
  bundleHash: source.bundleHash,
  sourceSha256,
  outputSha256: sha256(outputBuffer),
  outputSize: outputBuffer.length,
  width: outputMetadata.width,
  height: outputMetadata.height,
  recipe: artworkRecipe(entry.kind, source),
  ...(source.nativeVersion ? { nativeVersion: source.nativeVersion } : {}),
  ...(source.visualCheck ? { visualCheck: source.visualCheck } : {}),
  ...(source.visualLimitation ? { visualLimitation: source.visualLimitation } : {}),
  ...(source.previewStatus ? { previewStatus: source.previewStatus } : {}),
  ...(source.programCheck ? { programCheck: source.programCheck } : {}),
  ...(source.repeatValidation ? { repeatValidation: source.repeatValidation } : {}),
});

const loadPreviousProvenance = async () => {
  if (!(await pathExists(PROVENANCE_PATH))) return { assets: {} };
  try {
    return await readJson(PROVENANCE_PATH);
  } catch {
    return { assets: {} };
  }
};

const verifyIncrementalEntry = async ({ entry, source, outputPath, previous }) => {
  if (!previous || !(await pathExists(outputPath))) return null;
  const sourceBuffer = await fs.readFile(source.imagePath);
  const sourceSha256 = sha256(sourceBuffer);
  if (source.declaredSha256 && source.declaredSha256 !== sourceSha256) {
    throw new Error(`${source.sourceAssetId} does not match its validated manifest hash`);
  }
  const outputBuffer = await fs.readFile(outputPath);
  const outputSha256 = sha256(outputBuffer);
  const current = previous.sourceSha256 === sourceSha256
    && previous.outputSha256 === outputSha256
    && artworkReviewUnchanged(previous, source)
    && previous.recipe === artworkRecipe(entry.kind, source);
  return { current, sourceSha256, outputBuffer };
};

const main = async () => {
  const args = new Set(process.argv.slice(2));
  const force = args.has("--force");
  const dryRun = args.has("--dry-run");
  const check = args.has("--check");
  const regularOnly = args.has("--regular-only");
  const noCatalog = args.has("--no-catalog");
  const onlyIds = new Set(readArg("only").split(",").map((value) => value.trim()).filter(Boolean));
  const assetLibraryRoot = path.resolve(
    readArg("asset-library") || process.env.NIKKE_ASSET_LIBRARY_ROOT || DEFAULT_ASSET_LIBRARY_ROOT,
  );
  const outputDir = path.resolve(readArg("output-dir") || ARTWORK_DIR);
  const writesOfficialOutput = outputDir === ARTWORK_DIR;

  if (!(await pathExists(assetLibraryRoot))) {
    throw new Error(`Validated asset library output not found: ${assetLibraryRoot}`);
  }
  const [sourceCatalog, staticInventory, favoriteInventory, lobbyBurstInventory, reportedUnresolvedLobbyBurstSources, previousProvenance] = await Promise.all([
    readJson(SOURCE_CATALOG_PATH),
    discoverStaticArtwork(assetLibraryRoot),
    discoverFavoriteArtwork(assetLibraryRoot),
    discoverLobbyBurstArtwork(assetLibraryRoot),
    readUnresolvedLobbyBurstSources(assetLibraryRoot),
    loadPreviousProvenance(),
  ]);
  const staleRegularAssetIds = flattenCatalog(sourceCatalog)
    .filter((entry) => entry.kind === "regular" && !staticInventory.has(entry.assetId))
    .map((entry) => entry.assetId);
  // The batch report is historical evidence and can lag behind the promoted
  // output. A source that now has a validated production directory is resolved.
  const unresolvedLobbyBurstSources = reportedUnresolvedLobbyBurstSources
    .filter((item) => !lobbyBurstInventory.has(`lobby_burst_${item.sourceAssetId}`));
  const currentRegularCatalog = reconcileCatalogWithStaticInventory(sourceCatalog, staticInventory);
  const catalogWithRegionalEntries = mergeApprovedRegionalEntries(currentRegularCatalog);
  const catalog = mergeLobbyBurstEntries(catalogWithRegionalEntries, lobbyBurstInventory);
  const fullPlan = buildImportPlan(catalog, staticInventory, favoriteInventory, lobbyBurstInventory);
  const selectedPlan = fullPlan.filter((entry) => {
    if (regularOnly && entry.kind !== "regular") return false;
    return !onlyIds.size || onlyIds.has(entry.assetId);
  });
  const mappedStaticSourceIds = new Set(fullPlan
    .filter((entry) => entry.kind === "regular" && entry.source)
    .map((entry) => entry.source.sourceAssetId));
  const mappedLobbyBurstSourceIds = new Set(fullPlan
    .filter((entry) => entry.kind === "lobby-burst" && entry.source)
    .map((entry) => entry.source.sourceAssetId));
  const excludedSources = [...staticInventory.values()]
    .filter((source) => EXCLUDED_ARTWORK_IDS.has(normalizeStaticSourceAssetId(source.sourceAssetId)))
    .map((source) => source.sourceAssetId)
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  const unmappedStaticSources = [...staticInventory.values()]
    .filter((source) => !mappedStaticSourceIds.has(source.sourceAssetId) && !excludedSources.includes(source.sourceAssetId))
    .map((source) => source.sourceAssetId)
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  const unmappedLobbyBurstSources = [...lobbyBurstInventory.values()]
    .filter((source) => !mappedLobbyBurstSourceIds.has(source.sourceAssetId))
    .map((source) => source.sourceAssetId)
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  const missingValidatedSources = fullPlan
    .filter((entry) => entry.kind !== "preserved" && !entry.source)
    .map((entry) => entry.assetId);

  console.log([
    `Catalog entries: ${fullPlan.length}`,
    `validated regular sources: ${staticInventory.size}`,
    `validated favorite sources: ${favoriteInventory.size}`,
    `validated lobby burst sources: ${lobbyBurstInventory.size}`,
    `selected: ${selectedPlan.length}`,
    `unmapped static sources: ${unmappedStaticSources.length}`,
    `unmapped lobby burst sources: ${unmappedLobbyBurstSources.length}`,
    `unresolved lobby burst sources: ${unresolvedLobbyBurstSources.length}`,
    `preserved without validated source: ${missingValidatedSources.length}`,
  ].join("; "));
  if (missingValidatedSources.length) console.log(`Missing current-package source: ${missingValidatedSources.join(", ")}`);

  if (dryRun) {
    console.log(JSON.stringify({
      assetLibrary: toPortablePath(path.relative(ROOT, assetLibraryRoot) || "."),
      selected: selectedPlan.map(({ assetId, kind, source }) => ({ assetId, kind, source: source?.sourceRelative || null })),
      excludedSources,
      unmappedStaticSources,
      unmappedLobbyBurstSources,
      unresolvedLobbyBurstSources,
    }, null, 2));
    return;
  }

  const blockingMissingSources = selectedPlan
    .filter((entry) => entry.kind !== "preserved" && !entry.source)
    .map((entry) => entry.assetId);
  if (blockingMissingSources.length) {
    throw new Error(
      `Current-package validated artwork is missing; no output was changed:\n${blockingMissingSources.join(", ")}`,
    );
  }

  await fs.mkdir(outputDir, { recursive: true });
  const importableAssetIds = new Set(fullPlan.filter((entry) => entry.source).map((entry) => entry.assetId));
  const provenanceAssets = writesOfficialOutput
    ? Object.fromEntries(Object.entries(previousProvenance.assets || {})
      .filter(([assetId]) => importableAssetIds.has(assetId)))
    : {};
  const failures = [];
  let imported = 0;
  let skipped = 0;
  let preserved = 0;

  for (const entry of selectedPlan) {
    const outputPath = path.join(outputDir, `${entry.assetId}.webp`);
    if (!entry.source) {
      if (entry.kind === "preserved" && await pathExists(outputPath)) {
        preserved += 1;
        if (!check) console.log(`preserve ${entry.assetId} (no validated extracted source)`);
      } else {
        failures.push(`${entry.assetId}: output missing and no validated extracted source is available`);
      }
      continue;
    }
    try {
      const previous = writesOfficialOutput ? provenanceAssets[entry.assetId] : null;
      const verified = !force && previous
        ? await verifyIncrementalEntry({ entry, source: entry.source, outputPath, previous })
        : null;
      if (verified?.current) {
        skipped += 1;
        if (!check) console.log(`skip ${entry.assetId} (source and output hashes unchanged)`);
        continue;
      }
      if (check) {
        failures.push(`${entry.assetId}: generated output is missing or out of date`);
        continue;
      }
      const sourceBuffer = await fs.readFile(entry.source.imagePath);
      const sourceSha256 = sha256(sourceBuffer);
      if (entry.source.declaredSha256 && entry.source.declaredSha256 !== sourceSha256) {
        throw new Error("source hash does not match the validated manifest");
      }
      const outputBuffer = await encodeArtwork(entry.source.imagePath, entry.kind, entry.source);
      await fs.writeFile(outputPath, outputBuffer);
      if (writesOfficialOutput) {
        const outputMetadata = await sharp(outputBuffer).metadata();
        provenanceAssets[entry.assetId] = buildProvenanceEntry({
          entry,
          source: entry.source,
          sourceSha256,
          outputBuffer,
          outputMetadata,
        });
      }
      imported += 1;
      console.log(`import ${entry.assetId} <- ${entry.source.sourceRelative}`);
    } catch (error) {
      failures.push(`${entry.assetId}: ${error?.message || error}`);
    }
  }

  if (check) {
    if (failures.length) throw new Error(`Artwork check failed:\n${failures.join("\n")}`);
    console.log(`Artwork check passed: current=${skipped}, preserved=${preserved}.`);
    return;
  }

  if (failures.length) throw new Error(`Artwork import failed:\n${failures.join("\n")}`);

  if (writesOfficialOutput) {
    const normalizedCatalog = catalogWithMetadata(catalog);
    const preservedAssets = Object.fromEntries(fullPlan
      .filter((entry) => !entry.source)
      .map((entry) => [entry.assetId, {
        resourceNumber: entry.resourceNumber,
        reason: entry.kind === "preserved"
          ? "Reviewed local special artwork; managed by its dedicated source manifest."
          : "No matching validated output is currently available in the extracted asset library.",
      }]));
    const provenance = {
      schemaVersion: 1,
      revision: normalizedCatalog.revision,
      source: SOURCE_NAME,
      assetLibraryContract: "NIKKE_files/output only; no game-installation or runtime path dependency",
      recipes: RECIPES,
      importedCount: Object.keys(provenanceAssets).length,
      preservedCount: Object.keys(preservedAssets).length,
      excludedSources,
      unmappedStaticSources,
      unmappedLobbyBurstSources,
      unresolvedLobbyBurstSources,
      assets: Object.fromEntries(Object.entries(provenanceAssets)
        .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }))),
      preservedAssets,
    };
    const staleRegularOutputAssetIds = (await fs.readdir(ARTWORK_DIR))
      .filter((fileName) => /^c\d{3,4}(?:_\d{2})?\.webp$/.test(fileName))
      .map((fileName) => fileName.slice(0, -".webp".length))
      .filter((assetId) => !importableAssetIds.has(assetId)
        && !APPROVED_REGIONAL_ARTWORK_IDS.has(assetId));
    const staleManagedAssetIds = [...new Set([
      ...Object.keys(previousProvenance.assets || {})
        .filter((assetId) => !importableAssetIds.has(assetId)),
      ...staleRegularAssetIds,
      ...staleRegularOutputAssetIds,
    ])];
    for (const assetId of staleManagedAssetIds) {
      const stalePath = path.join(ARTWORK_DIR, `${assetId}.webp`);
      if (await pathExists(stalePath)) {
        await fs.rm(stalePath);
        console.log(`remove stale managed artwork ${assetId}`);
      }
    }
    await fs.writeFile(PROVENANCE_PATH, `${JSON.stringify(provenance, null, 2)}\n`);
    if (!noCatalog) {
      const serializedCatalog = `${JSON.stringify(normalizedCatalog, null, 2)}\n`;
      await fs.writeFile(SOURCE_CATALOG_PATH, serializedCatalog);
      await fs.writeFile(PUBLIC_CATALOG_PATH, serializedCatalog);
    }
  }
  console.log(`Artwork import complete: imported=${imported}, skipped=${skipped}, preserved=${preserved}.`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  await main();
}

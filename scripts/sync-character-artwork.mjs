// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTWORK_DIR = path.join(ROOT, "public", "ui-assets", "nikke", "character-artwork");
const PUBLIC_CATALOG_PATH = path.join(ARTWORK_DIR, "catalog.json");
const SOURCE_CATALOG_PATH = path.join(ROOT, "src", "data", "characterArtworkCatalog.json");
const BLABLA_DIRECTORY_URL = "https://sg-tools-cdn.blablalink.com/jz-26/ww-14/c4619ec83335bcfd7b23e43600520dc7.json";
const L2D_CATALOG_URL = "https://raw.githubusercontent.com/Nikke-db/nikke-db-vue/main/src/utils/json/l2d.json";
const VISUALISER_URL = "https://nikke-db.pages.dev/visualiser";
const DEFAULT_RENDER_SIZE = 1600;
const RESTART_INTERVAL = 40;

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const dryRun = args.has("--dry-run");
const onlyArg = process.argv.find((value) => value.startsWith("--only="));
const onlyIds = new Set(String(onlyArg?.split("=")[1] || "").split(",").map((value) => value.trim()).filter(Boolean));
const renderSizeArg = process.argv.find((value) => value.startsWith("--size="));
const renderSize = Math.max(960, Math.min(2400, Number(renderSizeArg?.split("=")[1]) || DEFAULT_RENDER_SIZE));

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
};

const normalizeResourceNumber = (value) => String(value ?? "").match(/\d{2,4}/)?.[0]?.padStart(3, "0") || "";

const stripBaseName = (label, baseName) => {
  const text = String(label || "").trim();
  const base = String(baseName || "").trim();
  if (!text) return "";
  if (base && text.startsWith(base)) {
    return text.slice(base.length).replace(/^[\s:：·\-—]+/, "").trim() || text;
  }
  return text;
};

const buildArtworkPlan = (directory, l2dCatalog) => {
  const standardCharacters = (Array.isArray(directory) ? directory : [])
    .map((character) => ({
      resourceNumber: normalizeResourceNumber(character?.resource_id),
      name: String(character?.name_localkey?.name || "").trim(),
    }))
    .filter((character) => character.resourceNumber);
  const characterMap = new Map(standardCharacters.map((character) => [character.resourceNumber, character]));
  const l2dBaseNameMap = new Map(
    (Array.isArray(l2dCatalog) ? l2dCatalog : [])
      .map((asset) => {
        const match = String(asset?.id || "").match(/^c(\d{3,4})$/);
        return match
          ? [normalizeResourceNumber(match[1]), String(asset?.cn || asset?.tw || asset?.name || "").trim()]
          : null;
      })
      .filter(Boolean),
  );
  return (Array.isArray(l2dCatalog) ? l2dCatalog : [])
    .map((asset) => {
      const match = String(asset?.id || "").match(/^(c(\d{3,4}))(?:_(\d+))?$/);
      if (!match) return null;
      const resourceNumber = normalizeResourceNumber(match[2]);
      const character = characterMap.get(resourceNumber);
      if (!character) return null;
      const costumeIndex = match[3] ? Number(match[3]) : 0;
      if (costumeIndex > 0 && !String(asset?.cn || asset?.tw || "").trim()) return null;
      const translatedName = String(asset?.cn || asset?.tw || asset?.name || "").trim();
      const translatedBaseName = l2dBaseNameMap.get(resourceNumber) || character.name;
      return {
        assetId: String(asset.id),
        resourceNumber,
        characterName: character.name,
        artworkId: costumeIndex > 0 ? `skin-${costumeIndex}` : "default",
        label: costumeIndex > 0
          ? stripBaseName(translatedName, translatedBaseName) || `皮肤 ${costumeIndex}`
          : "默认",
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.assetId.localeCompare(right.assetId, "en", { numeric: true }));
};

const findChromeExecutable = async () => {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue through the known browser locations.
    }
  }
  throw new Error("Chrome/Edge not found. Set CHROME_PATH before running the artwork sync.");
};

const openVisualiser = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(VISUALISER_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => document.querySelector("#app")?.__vue_app__ && document.querySelector("canvas"), null, { timeout: 60_000 });
  await page.evaluate(() => {
    window.__nikkeWorkshopGetLive2dStore = () => {
      const app = document.querySelector("#app")?.__vue_app__;
      const provides = app?._context?.provides || {};
      const pinia = Reflect.ownKeys(provides)
        .map((key) => provides[key])
        .find((value) => value?._s instanceof Map);
      return pinia?._s?.get("live2d") || null;
    };
  });
  await page.waitForTimeout(1200);
  return page;
};

const renderArtwork = async (page, item) => {
  const initial = await page.evaluate(() => {
    const store = window.__nikkeWorkshopGetLive2dStore();
    return { currentId: store?.current_id || "", finishedLoading: store?.finishedLoading || 0 };
  });
  await page.evaluate(({ assetId, assetName }) => {
    const store = window.__nikkeWorkshopGetLive2dStore();
    if (!store) throw new Error("Live2D store unavailable");
    if (store.current_id !== assetId) store.change_current_spine({ id: assetId, name: assetName });
  }, { assetId: item.assetId, assetName: item.label });
  if (initial.currentId !== item.assetId) {
    await page.waitForFunction(({ assetId, beforeValue }) => {
      const store = window.__nikkeWorkshopGetLive2dStore?.();
      return store?.current_id === assetId && Number(store.finishedLoading) > Number(beforeValue);
    }, { assetId: item.assetId, beforeValue: initial.finishedLoading }, { timeout: 45_000 });
  }
  await page.waitForTimeout(260);
  const dataUrl = await page.locator("canvas").evaluate(async (canvas, size) => {
    canvas.style.height = `${size}px`;
    await new Promise((resolve) => setTimeout(resolve, 320));
    return canvas.toDataURL("image/png");
  }, renderSize);
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Canvas export did not return a data URL");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
};

const writeCatalogs = async (plan) => {
  const characters = {};
  for (const item of plan) {
    const filePath = path.join(ARTWORK_DIR, `${item.assetId}.webp`);
    try {
      await fs.access(filePath);
    } catch {
      continue;
    }
    characters[item.resourceNumber] ||= [];
    characters[item.resourceNumber].push({
      id: item.artworkId,
      label: item.label,
      assetId: item.assetId,
      url: `/ui-assets/nikke/character-artwork/${item.assetId}.webp`,
    });
  }
  const catalog = {
    schemaVersion: 1,
    revision: new Date().toISOString().slice(0, 10),
    source: "NIKKE DB Live2D Visualiser",
    characterCount: Object.keys(characters).length,
    artworkCount: Object.values(characters).reduce((total, entries) => total + entries.length, 0),
    characters,
  };
  const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
  await fs.writeFile(PUBLIC_CATALOG_PATH, serialized);
  await fs.writeFile(SOURCE_CATALOG_PATH, serialized);
  return catalog;
};

await fs.mkdir(ARTWORK_DIR, { recursive: true });
const [directory, l2dCatalog] = await Promise.all([
  fetchJson(BLABLA_DIRECTORY_URL),
  fetchJson(L2D_CATALOG_URL),
]);
const fullPlan = buildArtworkPlan(directory, l2dCatalog);
const plan = onlyIds.size ? fullPlan.filter((item) => onlyIds.has(item.assetId)) : fullPlan;
console.log(`Artwork plan: ${plan.length} files (${fullPlan.length} total catalog assets), render size ${renderSize}px.`);

if (dryRun) {
  console.log(JSON.stringify(plan.slice(0, 20), null, 2));
  process.exit(0);
}

const chromeExecutable = await findChromeExecutable();
const browser = await chromium.launch({ headless: true, executablePath: chromeExecutable });
let page = await openVisualiser(browser);
const failures = [];
let created = 0;
let skipped = 0;

try {
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index];
    const outputPath = path.join(ARTWORK_DIR, `${item.assetId}.webp`);
    if (!force) {
      try {
        await fs.access(outputPath);
        skipped += 1;
        console.log(`[${index + 1}/${plan.length}] skip ${item.assetId}`);
        continue;
      } catch {
        // Missing output is rendered below.
      }
    }
    if (index > 0 && index % RESTART_INTERVAL === 0) {
      await page.close();
      page = await openVisualiser(browser);
    }
    let completed = false;
    for (let attempt = 1; attempt <= 3 && !completed; attempt += 1) {
      try {
        const png = await renderArtwork(page, item);
        const image = sharp(png);
        const [metadata, stats] = await Promise.all([image.metadata(), image.clone().stats()]);
        if (metadata.width !== renderSize || metadata.height !== renderSize || metadata.channels !== 4) {
          throw new Error(`unexpected canvas ${metadata.width}x${metadata.height}, channels=${metadata.channels}`);
        }
        if (Number(stats.channels?.[3]?.mean || 0) < 0.5) {
          throw new Error("canvas is empty or almost fully transparent");
        }
        await image.webp({ quality: 90, alphaQuality: 100, smartSubsample: true, effort: 5 }).toFile(outputPath);
        completed = true;
        created += 1;
        console.log(`[${index + 1}/${plan.length}] rendered ${item.assetId} (${item.label})`);
      } catch (error) {
        console.warn(`[${index + 1}/${plan.length}] ${item.assetId} attempt ${attempt} failed: ${error?.message || error}`);
        if (attempt < 3) {
          await page.close().catch(() => {});
          page = await openVisualiser(browser);
        } else {
          failures.push({ assetId: item.assetId, message: String(error?.message || error) });
        }
      }
    }
  }
} finally {
  await browser.close();
}

const catalog = await writeCatalogs(fullPlan);
console.log(`Artwork sync complete: created=${created}, skipped=${skipped}, failed=${failures.length}, catalog=${catalog.artworkCount}.`);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}

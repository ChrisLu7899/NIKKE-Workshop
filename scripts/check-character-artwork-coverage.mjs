// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTWORK_PATH = "ui-assets/nikke/character-artwork";

const resourceNumber = (value) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 9999) return "";
  return String(number).padStart(3, "0");
};

export const visibleCharacterIds = (rows) => {
  if (!Array.isArray(rows)) throw new Error("CharacterTable must be a JSON array.");
  const ids = rows
    .filter((row) => row?.IsVisible === true && row?.IsDetailClose !== true)
    .map((row) => resourceNumber(row.ResourceId));
  if (ids.includes("")) throw new Error("Visible character has an invalid ResourceId.");
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
};

export const findArtworkCoverageGaps = (ids, catalog, provenance) => ids.flatMap((id) => {
  const assetId = `c${id}`;
  const expectedUrl = `/${ARTWORK_PATH}/${assetId}.webp`;
  const defaultArtwork = catalog?.characters?.[id]?.find((entry) => entry.id === "default");
  const source = provenance?.assets?.[assetId];
  const problems = [];
  if (defaultArtwork?.assetId !== assetId || defaultArtwork?.url !== expectedUrl) {
    problems.push("default artwork mapping missing or incorrect");
  }
  if (source?.sourceAssetId !== `${assetId}_00` || !/^[a-f0-9]{64}$/i.test(source?.outputSha256 || "")) {
    problems.push("validated source provenance missing or incorrect");
  }
  return problems.map((problem) => `${assetId}: ${problem}`);
});

const argument = (name) => {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
};

const main = async () => {
  const tablePath = argument("character-table");
  const buildDir = path.resolve(argument("build-directory") || path.join(ROOT, "dist"));
  if (!tablePath) throw new Error("Pass --character-table=<latest client update CharacterTable.json>.");
  const [rows, catalog, provenance] = await Promise.all([
    fs.readFile(path.resolve(tablePath), "utf8").then(JSON.parse),
    fs.readFile(path.join(buildDir, ARTWORK_PATH, "catalog.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(buildDir, ARTWORK_PATH, "extracted-sources.json"), "utf8").then(JSON.parse),
  ]);
  const ids = visibleCharacterIds(rows);
  if (!ids.length) throw new Error("CharacterTable contains no visible characters; check the input file.");
  const gaps = findArtworkCoverageGaps(ids, catalog, provenance);
  for (const id of ids) {
    const assetId = `c${id}`;
    const filePath = path.join(buildDir, ARTWORK_PATH, `${assetId}.webp`);
    try {
      const bytes = await fs.readFile(filePath);
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== provenance?.assets?.[assetId]?.outputSha256) {
        gaps.push(`${assetId}: build image hash differs from provenance`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      gaps.push(`${assetId}: build image missing`);
    }
  }
  if (gaps.length) throw new Error(`Character artwork coverage failed (${ids.length} visible characters):\n${gaps.join("\n")}`);
  console.log(`Character artwork coverage passed: ${ids.length} visible characters have mapped, hash-verified default art.`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

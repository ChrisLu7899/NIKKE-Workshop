// SPDX-License-Identifier: GPL-3.0-or-later
// Convert the two reviewed static PNGs only; never export an animation or infer skins.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputArg = process.argv.find((arg) => arg.startsWith("--input-dir="));
const outputArg = process.argv.find((arg) => arg.startsWith("--output-dir="));
if (!inputArg) throw new Error("Provide --input-dir=PATH containing huapi-default.png and yingning-default.png extracted from the documented ZIP entries.");
const inputDir = path.resolve(inputArg.slice("--input-dir=".length));
const outputDir = outputArg
  ? path.resolve(outputArg.slice("--output-dir=".length))
  : path.join(root, "public/ui-assets/nikke/character-artwork");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const definitions = [
  { id: "cn-exclusive-huapi", name: "画皮", model: "c8005_00", input: "huapi-default.png", folder: "Huapi", width: 1378, height: 2276, sha256: "2401775b99ad17e975376c06d560adfc3d7ae424611f2805af406983cc3989bc", source: "https://www.spriters-resource.com/pc_computer/goddessofvictorynikke/asset/595578/" },
  { id: "cn-exclusive-yingning", name: "婴宁", model: "c8004_00", input: "yingning-default.png", folder: "Ying Ning", width: 1298, height: 1982, sha256: "2237b3a8907db66913edf9291b6119df5c249caa9ac86d6fa9c895f2b300bee1", source: "https://www.spriters-resource.com/pc_computer/goddessofvictorynikke/asset/551050/" },
];
// Prepare both before writing, so a missing/incorrect second source cannot partially update the set.
const prepared = await Promise.all(definitions.map(async (item) => {
  const input = await readFile(path.join(inputDir, item.input));
  const metadata = await sharp(input).metadata();
  if (sha256(input) !== item.sha256 || metadata.format !== "png" || !metadata.hasAlpha || metadata.width !== item.width || metadata.height !== item.height) {
    throw new Error(`${item.name}: source does not match the reviewed transparent full-body PNG; review the new source before changing this definition.`);
  }
  const output = await sharp(input)
    .resize(1536, 1536, { fit: "contain", background: "#00000000", withoutEnlargement: true })
    .extend({ top: 32, bottom: 32, left: 32, right: 32, background: "#00000000" })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toBuffer();
  return { output, record: {
    id: item.id, name: item.name, sourceModel: item.model,
    source: item.source, submitter: "Redtarp",
    archive: `PC _ Computer - Goddess of Victory_ Nikke - Playable Characters (Chinese Version) - ${item.folder}.zip`,
    entry: `${item.folder}/Standing/Idle/Idle (Default).png`,
    original: { width: item.width, height: item.height, bytes: input.length, sha256: sha256(input) },
    output: { file: `${item.id}.webp`, width: 1600, height: 1600, bytes: output.length, sha256: sha256(output) },
    availableCostumes: ["00"], expressionVariantsAreCostumes: false,
  } };
}));
await mkdir(outputDir, { recursive: true });
for (const { output, record } of prepared) await writeFile(path.join(outputDir, record.output.file), output);
await writeFile(path.join(outputDir, "china-exclusive-sources.json"), `${JSON.stringify({
  schemaVersion: 1, revision: "2026-08-31",
  conversion: { source: "reviewed-standing-idle-default-png", canvas: 1600, innerCanvas: 1536, padding: 32, fit: "contain", crop: false, webpQuality: 92, alphaQuality: 100 },
  rights: "Game artwork is third-party material, not GPL. Public availability is not a redistribution or commercial-use license; review ASSET_SOURCES.md before external distribution.",
  characters: prepared.map(({ record }) => record),
}, null, 2)}\n`);
for (const { record } of prepared) console.log(`${record.name}: ${record.output.width}x${record.output.height}, ${record.output.bytes} bytes, ${record.output.sha256}`);

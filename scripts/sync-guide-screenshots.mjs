// SPDX-License-Identifier: GPL-3.0-or-later
// Bind only reviewed screenshots to the offline guide. Default is read-only.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guideDir = path.join(root, "docs/guide");
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && !["--check", "--apply"].includes(args[0]))) {
  throw new Error("Usage: node scripts/sync-guide-screenshots.mjs [--check|--apply]");
}
const data = JSON.parse(fs.readFileSync(path.join(guideDir, "screenshots.json"), "utf8"));
const source = fs.readFileSync(path.join(guideDir, "index.html"), "utf8");
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ids = new Set();
let output = source;
let ready = 0;
for (const shot of data.shots) {
  if (!/^G\d{2}$/.test(shot.id) || ids.has(shot.id)) throw new Error("Invalid or duplicate screenshot id");
  ids.add(shot.id);
  if (!["pending", "approved"].includes(shot.status)) throw new Error(`Invalid review state: ${shot.id}`);
  let body;
  if (shot.status === "approved") {
    const images = [shot, ...(shot.extra_images || [])];
    body = images.map((item, index) => {
    const expected = `assets-redacted/guide-${shot.id}${index ? `-${index + 1}` : ""}.png`;
    if (item.file !== expected) throw new Error(`Unexpected image path: ${shot.id}`);
    if (!/^[a-f0-9]{64}$/.test(item.reviewed_sha256 || "")) throw new Error(`Missing reviewed SHA-256: ${shot.id}`);
    const file = path.join(guideDir, item.file);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Image must be a regular file: ${shot.id}`);
    const bytes = fs.readFileSync(file);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`PNG required: ${shot.id}`);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== item.reviewed_sha256) throw new Error(`Image changed since review: ${shot.id}`);
    const label = item.label || shot.caption;
    return `<div class="guide-shot-item">${images.length > 1 ? `<p class="guide-shot-label">${index + 1}. ${escape(label)}</p>` : ""}<a href="${escape(item.file)}" target="_blank" rel="noopener" aria-label="${escape(label)}：查看大图"><img src="${escape(item.file)}" alt="${escape(label)}" width="${bytes.readUInt32BE(16)}" height="${bytes.readUInt32BE(20)}" loading="lazy"></a></div>`;
    }).join("");
    ready++;
  } else {
    body = `<div class="screenshot-placeholder"><span>截图 ${shot.id} · 待补</span><p>${escape(shot.capture)}</p></div>`;
  }
  const block = `<figure class="guide-shot" data-shot-id="${shot.id}">${body}<figcaption>${escape(shot.caption)}${shot.status === "approved" ? " · 点击图片查看大图" : ""}</figcaption></figure>`;
  const pattern = new RegExp(`<figure class="guide-shot" data-shot-id="${shot.id}">[\\s\\S]*?<\\/figure>`, "g");
  if ([...output.matchAll(pattern)].length !== 1) throw new Error(`Expected exactly one slot: ${shot.id}`);
  output = output.replace(pattern, () => block);
}
const actual = [...source.matchAll(/data-shot-id="([^"]+)"/g)].map(m => m[1]);
if (actual.length !== ids.size || actual.some(id => !ids.has(id))) throw new Error("Guide and screenshot registry differ");
if (args[0] === "--apply") fs.writeFileSync(path.join(guideDir, "index.html"), output);
else if (source !== output) throw new Error("Screenshot slots need synchronization; review then run --apply");
console.log(`Guide screenshots: ${ready} approved, ${ids.size - ready} pending; ${args[0] === "--apply" ? "synchronized" : "check passed"}.`);

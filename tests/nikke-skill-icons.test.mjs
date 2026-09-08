// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { getNikkeSkillIconUrls } from "../src/utils/nikkeSkillIcons.js";
import catalog from "../src/data/characterSkillIconCatalog.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("character skill icon catalog resolves two skills and one character burst icon", () => {
  assert.deepEqual(getNikkeSkillIconUrls({ resource_id: 511 }), [
    { key: "skill1", label: "技能 1", url: "/ui-assets/nikke/skill-icons/generic/icn_skill_atkup_01.png" },
    { key: "skill2", label: "技能 2", url: "/ui-assets/nikke/skill-icons/generic/icn_skill_stathp_01.png" },
    { key: "burst", label: "爆裂技能", url: "/ui-assets/nikke/skill-icons/burst/c511.png" },
  ]);
});

test("unknown and custom characters keep three stable empty skill slots", () => {
  assert.deepEqual(getNikkeSkillIconUrls({ resource_id: "custom" }).map((item) => item.url), ["", "", ""]);
});

test("all localized burst assets are monochrome glyphs rather than full-colour cut-ins", async () => {
  const burstRoot = path.join(ROOT, "public", "ui-assets", "nikke", "skill-icons", "burst");
  const files = (await fs.readdir(burstRoot)).filter((file) => file.endsWith(".png"));
  assert.deepEqual(files.sort(), [...new Set(Object.values(catalog).map(x => path.basename(x.burst)))].sort());
  for (const file of files) {
    const { data, info } = await sharp(path.join(burstRoot, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let visible = 0;
    let saturated = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset + 3] <= 24) continue;
      visible += 1;
      const spread = Math.max(data[offset], data[offset + 1], data[offset + 2])
        - Math.min(data[offset], data[offset + 1], data[offset + 2]);
      if (spread > 32) saturated += 1;
    }
    assert.ok(visible >= 40, `${file} should contain a visible glyph`);
    assert.ok(saturated / visible <= 0.03, `${file} should not contain a full-colour cut-in`);
  }
});

test("Great Villain has its own native burst and explicitly verified basic skills", () => {
  assert.deepEqual(catalog[104], {
    skill1: "generic/icn_skill_damage_01.png", skill2: "generic/icn_skill_stathp_01.png", burst: "burst/c104.png",
  });
  assert.notEqual(catalog[104].burst, catalog[101].burst);
});

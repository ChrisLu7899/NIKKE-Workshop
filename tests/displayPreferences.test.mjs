// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { SHOW_NIKKE_IMAGES } from "../src/config/displayPreferences.js";
import { getNikkeAvatarUrl } from "../src/utils/nikkeAvatar.js";

test("display mode restores Nikke avatar URLs", () => {
  assert.equal(SHOW_NIKKE_IMAGES, true);
  assert.equal(
    getNikkeAvatarUrl({ resource_id: 101 }),
    "https://nikke-db.github.io/images/sprite/si_c101_00_s.png",
  );
});

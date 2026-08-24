// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { groupScreenshotFiles } from "../src/services/screenshotDirectory.js";

test("screenshot directory groups supported images by the immediate character folder", () => {
  const groups = groupScreenshotFiles([
    { name: "头部.png", webkitRelativePath: "screenshots/拉毗：小红帽/头部.png" },
    { name: "身体.JPG", webkitRelativePath: "screenshots/拉毗：小红帽/身体.JPG" },
    { name: "说明.txt", webkitRelativePath: "screenshots/拉毗：小红帽/说明.txt" },
    { name: "腿部.webp", webkitRelativePath: "screenshots/皇冠/腿部.webp" },
  ]);
  assert.deepEqual(groups.map(({ characterName, images }) => [characterName, images.length]), [
    ["拉毗：小红帽", 2],
    ["皇冠", 1],
  ]);
});

test("loose root images are ignored because a character folder is required", () => {
  assert.deepEqual(groupScreenshotFiles([{ name: "头部.png", webkitRelativePath: "头部.png" }]), []);
});

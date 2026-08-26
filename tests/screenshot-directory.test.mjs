// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { chooseScreenshotDirectory, groupScreenshotFiles } from "../src/services/screenshotDirectory.js";

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

test("screenshot directory preserves temporary-style and special-character image names", () => {
  const groups = groupScreenshotFiles([
    {
      name: "~]Z33BF{5~64N@%M(4$WLGP.png",
      webkitRelativePath: "测试/皇冠/~]Z33BF{5~64N@%M(4$WLGP.png",
    },
    {
      name: "~1UI[@EP6IS84RZBRNE~ATB.png",
      webkitRelativePath: "测试/皇冠/~1UI[@EP6IS84RZBRNE~ATB.png",
    },
    {
      name: "7d4989da-fe67-49fc-9e34-709df187eb25.png",
      webkitRelativePath: "测试/灰姑娘/7d4989da-fe67-49fc-9e34-709df187eb25.png",
    },
  ]);

  assert.deepEqual(groups.map(({ characterName, images }) => [
    characterName,
    images.map((image) => image.name),
  ]), [
    ["皇冠", ["~]Z33BF{5~64N@%M(4$WLGP.png", "~1UI[@EP6IS84RZBRNE~ATB.png"]],
    ["灰姑娘", ["7d4989da-fe67-49fc-9e34-709df187eb25.png"]],
  ]);
});

test("directory selection always uses the webkitdirectory file input", () => {
  let clicks = 0;
  const result = chooseScreenshotDirectory({
    fallbackInput: {
      click() {
        clicks += 1;
      },
    },
  });

  assert.equal(result, null);
  assert.equal(clicks, 1);
});

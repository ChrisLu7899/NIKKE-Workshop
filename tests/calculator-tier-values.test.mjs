import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const calculatorSource = fs.readFileSync(
  path.join(projectRoot, "src", "calculator", "main.js"),
  "utf8",
);

test("critical damage uses its own 1-15 tier percentages", () => {
  const match = calculatorSource.match(/"暴击伤害增加"\s*:\s*\[([^\]]+)\]/s);
  assert.ok(match, "暴击伤害增加应使用独立档位数组");
  const tiers = [...match[1].matchAll(/"([0-9.]+%)"/g)].map(item => item[1]);
  assert.deepEqual(tiers, [
    "6.64%", "7.62%", "8.60%", "9.58%", "10.56%",
    "11.54%", "12.52%", "13.50%", "14.48%", "15.46%",
    "16.44%", "17.42%", "18.40%", "19.38%", "20.36%",
  ]);
});

// SPDX-License-Identifier: GPL-3.0-or-later
// 将现有单文件计算器机械拆分为适用于 Chrome MV3 CSP 的 Vite 多页面入口。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("请提供现有计算器 HTML 的路径");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "src", "calculator");
const source = fs.readFileSync(sourcePath, "utf8");
const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/i);
const bodyMatch = source.match(/<body>([\s\S]*?)<\/body>/i);
const inlineScripts = [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];

if (!styleMatch || !bodyMatch || inlineScripts.length !== 1) {
  throw new Error("计算器 HTML 结构不符合预期，无法安全拆分");
}

const bodyMarkup = bodyMatch[1]
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
  .trim();
const inlineScript = inlineScripts[0][1].trim();

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(projectRoot, "calculator.html"),
  `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NIKKE洗词条计算器 · ExiaInvasion</title>
  </head>
  <body>
${bodyMarkup}
    <script type="module" src="/src/calculator/main.js"></script>
  </body>
</html>
`,
  "utf8",
);
fs.writeFileSync(
  path.join(outputDirectory, "calculator.css"),
  `/* SPDX-License-Identifier: GPL-3.0-or-later */\n${styleMatch[1].trim()}\n`,
  "utf8",
);
fs.writeFileSync(
  path.join(outputDirectory, "main.js"),
  `// SPDX-License-Identifier: GPL-3.0-or-later
import ExcelJS from "exceljs";
import "./calculator.css";

globalThis.ExcelJS = ExcelJS;

${inlineScript}
`,
  "utf8",
);

console.log("计算器页面已拆分到 calculator.html 与 src/calculator/");


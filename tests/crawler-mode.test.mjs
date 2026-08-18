// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCrawlerOutputMode,
  shouldOpenStandaloneCalculator,
} from "../src/utils/crawlerMode.js";

test("regular character crawl keeps configured file exports", () => {
  assert.deepEqual(resolveCrawlerOutputMode({
    calculatorMode: false,
    exportJson: true,
    saveAsZip: true,
  }), {
    directCalculator: false,
    shouldDeferExport: false,
    shouldExportExcel: true,
    shouldExportJson: true,
    shouldZip: true,
  });
});

test("direct calculator crawl skips Excel, JSON, and ZIP exports", () => {
  assert.deepEqual(resolveCrawlerOutputMode({
    calculatorMode: true,
    exportJson: true,
    saveAsZip: true,
  }), {
    directCalculator: true,
    shouldDeferExport: false,
    shouldExportExcel: false,
    shouldExportJson: false,
    shouldZip: false,
  });
});

test("staged character fetch defers every file export", () => {
  assert.deepEqual(resolveCrawlerOutputMode({
    calculatorMode: false,
    deferExport: true,
    exportJson: true,
    saveAsZip: true,
  }), {
    directCalculator: false,
    shouldDeferExport: true,
    shouldExportExcel: false,
    shouldExportJson: false,
    shouldZip: false,
  });
});

test("management calculator mode keeps the result embedded", () => {
  assert.equal(shouldOpenStandaloneCalculator({
    calculatorMode: true,
    openCalculator: false,
    calculatorCharacterCount: 3,
  }), false);
});

test("standalone calculator still opens when explicitly requested", () => {
  assert.equal(shouldOpenStandaloneCalculator({
    calculatorMode: true,
    openCalculator: true,
    calculatorCharacterCount: 3,
  }), true);
});

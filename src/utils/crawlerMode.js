// SPDX-License-Identifier: GPL-3.0-or-later

export function resolveCrawlerOutputMode({
  calculatorMode = false,
  deferExport = false,
  exportJson = false,
  saveAsZip = false,
} = {}) {
  const directCalculator = Boolean(calculatorMode);
  const shouldDeferExport = Boolean(deferExport);
  const shouldExportExcel = !directCalculator && !shouldDeferExport;
  const shouldExportJson = !directCalculator && !shouldDeferExport && Boolean(exportJson);
  const shouldZip = Boolean(saveAsZip && (shouldExportExcel || shouldExportJson));

  return {
    directCalculator,
    shouldDeferExport,
    shouldExportExcel,
    shouldExportJson,
    shouldZip,
  };
}

export function shouldOpenStandaloneCalculator({
  calculatorMode = false,
  openCalculator = true,
  calculatorCharacterCount = 0,
} = {}) {
  return Boolean(
    calculatorMode
    && openCalculator
    && Number(calculatorCharacterCount) > 0
  );
}

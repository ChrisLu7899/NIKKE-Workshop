// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField,
  Typography,
} from "@mui/material";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import {
  EQUIPMENT_FUNCTION_LABELS,
  EQUIPMENT_FUNCTION_TYPES,
  createEmptyEquipments,
  findCatalogCharacterByName,
  normalizeCharacterName,
  normalizeLocalCharacterRecord,
} from "../../domain/localCharacterRoster.js";
import {
  SCREENSHOT_EQUIPMENT_SLOTS,
  mergeOcrEntriesIntoEquipments,
  resolveEquipmentSlot,
  validateOcrPreview,
} from "../../domain/equipmentScreenshotOcr.js";
import { EQUIPMENT_TIER_VALUES, formatTierPercent, tierValue } from "../../domain/equipmentAffixes.js";
import { chooseScreenshotDirectory, groupScreenshotFiles } from "../../services/screenshotDirectory.js";
import { recognizeScreenshotGroups, releaseOcrPreviewUrls } from "../../services/localScreenshotOcr.js";

const emptyProgress = { phase: "idle", current: 0, total: 0, fileName: "" };

function progressText(progress) {
  if (progress.phase === "image") return `正在识别 ${progress.current}/${progress.total}：${progress.fileName}`;
  if (progress.phase === "locating") return `正在定位 ${progress.fileName} 的白色装备面板`;
  if (progress.phase === "recognizing") return `正在读取 ${progress.fileName} 的第 ${progress.line} 条词条`;
  if (progress.phase && progress.phase !== "idle") return `正在加载本地 OCR：${progress.phase}`;
  return "";
}

function existingRecordByName(records, characterName) {
  const normalized = normalizeCharacterName(characterName);
  return (records || []).find((record) => normalizeCharacterName(record?.base?.name) === normalized) || null;
}

export default function ScreenshotOcrImportDialog({
  open,
  onClose,
  standardCatalog,
  localRecords,
  onSaveLocalCharacterBatch,
}) {
  const fallbackInputRef = useRef(null);
  const [groups, setGroups] = useState([]);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(emptyProgress);
  const [running, setRunning] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [saveSummary, setSaveSummary] = useState(null);

  useEffect(() => () => releaseOcrPreviewUrls(results), [results]);

  const unmatchedFolders = useMemo(() => groups.map((group) => group.characterName).filter((name) => (
    !findCatalogCharacterByName(standardCatalog, name) && !existingRecordByName(localRecords, name)
  )), [groups, localRecords, standardCatalog]);
  const previewErrors = useMemo(() => validateOcrPreview(results), [results]);

  const loadGroups = (nextGroups) => {
    releaseOcrPreviewUrls(results);
    setResults([]);
    setSaveSummary(null);
    setFatalError("");
    setGroups(nextGroups);
    if (!nextGroups.length) setFatalError("所选目录中没有找到“角色文件夹/装备截图”结构。请至少保留一层角色文件夹。");
  };

  const chooseFolder = async () => {
    try {
      const selected = await chooseScreenshotDirectory({ fallbackInput: fallbackInputRef.current });
      if (selected) loadGroups(selected);
    } catch (error) {
      if (error?.name !== "AbortError") setFatalError(error?.message || "无法读取截图目录");
    }
  };

  const runOcr = async () => {
    if (!groups.length || unmatchedFolders.length) return;
    setRunning(true);
    setFatalError("");
    setSaveSummary(null);
    releaseOcrPreviewUrls(results);
    setResults([]);
    try {
      const next = await recognizeScreenshotGroups(groups, { onProgress: setProgress });
      // 识别结果进入界面前再按装备名称/角标统一归一，避免旧 Worker 或
      // 含不可见字符的 OCR 文本让已经识别出的“护臂”等名称仍显示未识别。
      setResults(next.map((entry) => {
        const slot = resolveEquipmentSlot(entry);
        return slot.equipmentSlot ? { ...entry, ...slot } : entry;
      }));
    } catch (error) {
      setFatalError(`图片识别失败：${error?.message || error}`);
    } finally {
      setRunning(false);
      setProgress(emptyProgress);
    }
  };

  const updateEntry = (entryId, updater) => setResults((current) => current.map((entry) => (
    entry.id === entryId ? updater(entry) : entry
  )));
  const updateLine = (entryId, position, patch) => updateEntry(entryId, (entry) => ({
    ...entry,
    lines: entry.lines.map((line) => line.position === position ? {
      ...line,
      ...patch,
      warnings: [],
      requiresConfirmation: false,
    } : line),
  }));

  const save = async () => {
    const validation = validateOcrPreview(results);
    if (validation.length || unmatchedFolders.length) return;
    const grouped = new Map();
    results.forEach((entry) => {
      if (!grouped.has(entry.characterName)) grouped.set(entry.characterName, []);
      grouped.get(entry.characterName).push(entry);
    });
    const items = [];
    for (const [characterName, entries] of grouped.entries()) {
      const catalogCharacter = findCatalogCharacterByName(standardCatalog, characterName);
      const existing = existingRecordByName(localRecords, characterName);
      if (!catalogCharacter && !existing) {
        continue;
      }
      const normalized = existing ? normalizeLocalCharacterRecord(existing) : null;
      const draft = {
        ...(normalized || {}),
        base: normalized?.base,
        level: normalized?.level ?? "",
        limitBreak: normalized?.limitBreak || { grade: "", core: "" },
        combat: normalized?.combat ?? "",
        affectionLevel: normalized?.affectionLevel ?? "",
        equipments: mergeOcrEntriesIntoEquipments(normalized?.equipments || createEmptyEquipments(), entries),
      };
      items.push({
        characterName,
        catalogCharacter: catalogCharacter || null,
        draft,
        custom: Boolean(existing?.custom),
        existingLocalId: existing?.localId || "",
        source: "screenshot",
      });
    }
    const result = await onSaveLocalCharacterBatch(items);
    setSaveSummary({ saved: result?.saved?.length || 0, errors: result?.errors || [] });
  };

  return (
    <Dialog open={open} onClose={running ? undefined : onClose} fullWidth maxWidth="xl">
      <DialogTitle>图片识别录入装备</DialogTitle>
      <DialogContent dividers>
        <input
          ref={fallbackInputRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp"
          multiple
          onChange={(event) => {
            loadGroups(groupScreenshotFiles([...event.target.files]));
            event.target.value = "";
          }}
          // React 会原样传递 Chromium 的目录选择属性。
          webkitdirectory=""
          directory=""
        />
        <Alert severity="info" sx={{ mb: 2 }}>
          推荐直接选择安装目录内预置的 <code>NIKKE-Workshop\screenshots</code> 文件夹，无需另外新建 screenshots 根目录。请先将装备截图放入对应的角色子文件夹；如果没有对应角色文件夹，再按图鉴中的完整角色名新建。程序会先定位截图中的白色装备面板，再读取装备图标、装备名称、三条词条名称与数值以及锁定状态。识别完全在本机完成，不会上传图片。
        </Alert>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
          <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={chooseFolder} disabled={running}>选择截图目录</Button>
          <Button variant="contained" startIcon={running ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />} onClick={runOcr} disabled={running || !groups.length || Boolean(unmatchedFolders.length)}>开始识别</Button>
          <Typography variant="body2" color="text.secondary">
            {groups.length ? `已发现 ${groups.length} 个角色文件夹、${groups.reduce((sum, group) => sum + group.images.length, 0)} 张图片` : "尚未选择目录"}
          </Typography>
        </Stack>
        {running ? <Alert severity="info" sx={{ mb: 2 }}>{progressText(progress)}</Alert> : null}
        {fatalError ? <Alert severity="error" sx={{ mb: 2 }}>{fatalError}</Alert> : null}
        {unmatchedFolders.length ? <Alert severity="error" sx={{ mb: 2 }}>未匹配角色：{unmatchedFolders.join("、")}。请将文件夹改为图鉴中的完整角色名，或先创建同名自定义角色。</Alert> : null}
        {saveSummary ? <Alert severity={saveSummary.errors.length ? "warning" : "success"} sx={{ mb: 2 }}>已保存 {saveSummary.saved} 名角色{saveSummary.errors.length ? `；${saveSummary.errors.join("；")}` : "，可在“已录入”和洗词条计算器中使用。"}</Alert> : null}
        {previewErrors.length && results.length ? <Alert severity="warning" sx={{ mb: 2 }}>保存前需处理：{previewErrors.join("；")}</Alert> : null}

        <Stack spacing={2}>
          {results.map((entry) => (
            <Box key={entry.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
              <Box sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", bgcolor: "grey.50" }}>
                <Typography sx={{ fontWeight: 700 }}>{entry.characterName}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mr: "auto" }}>{entry.fileName}</Typography>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>装备部位</InputLabel>
                  <Select label="装备部位" value={entry.equipmentSlot} onChange={(event) => updateEntry(entry.id, (current) => ({ ...current, equipmentSlot: event.target.value }))}>
                    <MenuItem value="" disabled>请选择装备部位</MenuItem>
                    {SCREENSHOT_EQUIPMENT_SLOTS.map((slot) => <MenuItem key={slot} value={slot}>{slot}</MenuItem>)}
                  </Select>
                </FormControl>
                <Chip
                  size="small"
                  variant="outlined"
                  color={entry.template?.confidence === "high" ? "success" : "warning"}
                  label={entry.template?.confidence === "high" ? "模板已定位" : "模板定位待确认"}
                />
                {validateOcrPreview([entry]).length
                  ? <Chip size="small" color="warning" label="需要处理" />
                  : entry.warnings.length
                    ? <Chip size="small" color="info" label="已按档位表校正" />
                    : <Chip size="small" color="success" label="已自动匹配" />}
              </Box>
              <Divider />
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "260px minmax(0, 1fr)" }, gap: 2, p: 2 }}>
                <Stack spacing={1}>
                  <Box component="img" src={entry.panelPreviewUrl || entry.previewUrl} alt="已定位的白色装备面板" sx={{ width: "100%", maxHeight: 430, objectFit: "contain", bgcolor: "grey.100", borderRadius: 1 }} />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box component="img" src={entry.equipmentIconPreviewUrl} alt="装备图标识别区域" sx={{ width: 48, height: 48, objectFit: "contain", bgcolor: "grey.100", borderRadius: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      图标识别：{entry.matchedEquipmentName || "未识别"}
                      {entry.equipmentIconMatch ? `（${entry.equipmentIconMatch.confidence === "high" ? "高" : entry.equipmentIconMatch.confidence === "medium" ? "中" : "低"}置信度）` : ""}
                    </Typography>
                  </Stack>
                </Stack>
                <Stack spacing={1.25}>
                  {entry.lines.map((line) => (
                    <Box key={line.position} sx={{ display: "grid", gridTemplateColumns: "36px minmax(180px, 2fr) minmax(150px, 1.2fr) minmax(110px, .9fr)", gap: 1, alignItems: "center" }}>
                      <Typography align="center" sx={{ fontWeight: 700 }}>{line.position}</Typography>
                      <TextField select size="small" label="词条" value={line.functionType} onChange={(event) => {
                        const functionType = event.target.value;
                        // 人工改词条名称后不复用旧 OCR 数字猜档位；由用户明确选择
                        // 合法档位，避免名称改变后把原来的不确定数值错误映射回来。
                        updateLine(entry.id, line.position, {
                          functionType,
                          value: null,
                          level: null,
                          valueStyle: "",
                          locked: functionType ? line.locked : null,
                        });
                      }}>
                        <MenuItem value="">空词条</MenuItem>
                        {EQUIPMENT_FUNCTION_TYPES.map((type) => <MenuItem key={type} value={type}>{EQUIPMENT_FUNCTION_LABELS[type]}</MenuItem>)}
                      </TextField>
                      <TextField select size="small" label="档位与数值" value={line.level ?? ""} disabled={!line.functionType} onChange={(event) => {
                        const level = Number(event.target.value);
                        updateLine(entry.id, line.position, {
                          level,
                          value: tierValue(line.functionType, level),
                          // 用户手动选择档位时，以人工判断覆盖自动字色分类。
                          valueStyle: "",
                        });
                      }}>
                        {(EQUIPMENT_TIER_VALUES[line.functionType] || []).map((_, index) => <MenuItem key={index + 1} value={index + 1}>{`[${index + 1}档] ${formatTierPercent(line.functionType, index + 1)}`}</MenuItem>)}
                      </TextField>
                      <TextField select size="small" label="锁定" value={line.locked === null ? "unknown" : line.locked ? "locked" : "unlocked"} disabled={!line.functionType} onChange={(event) => updateLine(entry.id, line.position, { locked: event.target.value === "unknown" ? null : event.target.value === "locked" })}>
                        <MenuItem value="unknown">待确认</MenuItem><MenuItem value="locked">已锁定</MenuItem><MenuItem value="unlocked">未锁定</MenuItem>
                      </TextField>
                    </Box>
                  ))}
                  <Typography variant="caption" color="text.secondary">
                    模板范围：{entry.template?.panel ? `${entry.template.panel.width} × ${entry.template.panel.height}` : "未定位"}；识别部位：{entry.equipmentSlot || "未识别"}
                    {entry.rawEquipmentName ? `；装备名称：${entry.rawEquipmentName}` : ""}
                    {entry.matchedEquipmentName ? `；图标匹配：${entry.matchedEquipmentName}` : ""}
                    {entry.rawSlot ? `（部位标签原始 OCR：${entry.rawSlot}）` : ""}
                    。低置信数值已按对应词条的合法档位表二次校验。
                  </Typography>
                </Stack>
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={running}>关闭</Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={running || !results.length || Boolean(previewErrors.length) || Boolean(unmatchedFolders.length)}>确认保存到已录入</Button>
      </DialogActions>
    </Dialog>
  );
}

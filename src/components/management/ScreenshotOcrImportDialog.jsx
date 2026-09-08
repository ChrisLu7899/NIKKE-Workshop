// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, FormControlLabel, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
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
import { mergeOverloadOcrMetadata } from "../../domain/equipmentCatalog.js";
import {
  TRAINING_FIELD_LABELS,
  mergeTrainingOcrEntriesIntoDraft,
} from "../../domain/trainingScreenshotOcr.js";
import { chooseScreenshotDirectory, groupScreenshotFiles } from "../../services/screenshotDirectory.js";
import { recognizeScreenshotGroups, releaseOcrPreviewUrls } from "../../services/localScreenshotOcr.js";
import { selectedOcrEntries, validateMixedOcrPreview } from "../../domain/screenshotOcrReview.js";
import TrainingOcrResultCard from "./TrainingOcrResultCard.jsx";

const emptyProgress = { phase: "idle", current: 0, total: 0, fileName: "" };

function progressText(progress) {
  if (progress.phase === "image") return `正在识别 ${progress.current}/${progress.total}：${progress.fileName}`;
  if (progress.phase === "locating") return `正在定位 ${progress.fileName} 的白色装备面板`;
  if (progress.phase === "recognizing") return `正在读取 ${progress.fileName} 的第 ${progress.line} 条词条`;
  if (progress.phase === "training-locating") return `正在定位 ${progress.fileName} 的角色信息面板`;
  if (progress.phase === "training-field") return `正在识别 ${progress.fileName}：${TRAINING_FIELD_LABELS[progress.field] || progress.field}（${progress.current}/${progress.total}）`;
  if (progress.phase === "classifying") return `正在判断 ${progress.fileName} 的截图类型`;
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
  recognize = recognizeScreenshotGroups,
}) {
  const fallbackInputRef = useRef(null);
  const [groups, setGroups] = useState([]);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(emptyProgress);
  const [running, setRunning] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [saveSummary, setSaveSummary] = useState(null);
  const [mode, setMode] = useState("auto");
  const [saving, setSaving] = useState(false);
  const abortRef = useRef(null), busyRef = useRef(false), mountedRef = useRef(true), previewRef = useRef([]);

  useEffect(() => {
    const retained = new Set(results.map((entry) => entry.previewUrl));
    releaseOcrPreviewUrls(previewRef.current.filter((entry) => !retained.has(entry.previewUrl)));
    previewRef.current = results;
  }, [results]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; abortRef.current?.abort(); releaseOcrPreviewUrls(previewRef.current); };
  }, []);

  const unmatchedFolders = useMemo(() => groups.map((group) => group.characterName).filter((name) => (
    !findCatalogCharacterByName(standardCatalog, name) && !existingRecordByName(localRecords, name)
  )), [groups, localRecords, standardCatalog]);
  const previewErrors = useMemo(() => validateMixedOcrPreview(results), [results]);
  const selected = useMemo(() => selectedOcrEntries(results), [results]);

  const loadGroups = (nextGroups) => {
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

  const runOcr = async (retryEntry = null, retryMode = mode) => {
    if (busyRef.current) return;
    const matched = groups.filter((group) => !unmatchedFolders.includes(group.characterName));
    const targets = retryEntry?.sourceFile ? [{ characterName: retryEntry.characterName, images: [retryEntry.sourceFile] }] : matched;
    if (!targets.length) return;
    busyRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setFatalError("");
    setSaveSummary(null);
    if (!retryEntry) setResults([]);
    try {
      await recognize(targets, { mode: retryMode, signal: controller.signal,
        onProgress: (event) => { if (mountedRef.current) setProgress(event); },
        onResult: (entry) => {
          if (!mountedRef.current) { releaseOcrPreviewUrls([entry]); return; }
          const resolved = entry.type === "equipment" ? { ...entry, ...resolveEquipmentSlot(entry) } : entry;
          setResults((current) => retryEntry
            ? current.map((previous) => previous.id === retryEntry.id ? resolved : previous)
            : [...current, resolved]);
        },
      });
      if (controller.signal.aborted && mountedRef.current) setFatalError("已取消；已经完成的结果仍可检查并保存。");
    } catch (error) {
      if (mountedRef.current) setFatalError(`图片识别失败：${error?.message || error}`);
    } finally {
      busyRef.current = false;
      abortRef.current = null;
      if (mountedRef.current) { setRunning(false); setProgress(emptyProgress); }
    }
  };

  const updateEntry = (entryId, updater) => { if (busyRef.current) return; setResults((current) => current.map((entry) => (
    entry.id === entryId ? updater(entry) : entry
  ))); setSaveSummary(null); };
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
    if (busyRef.current || !selected.length) return;
    const validation = validateMixedOcrPreview(results);
    if (validation.length) return;
    busyRef.current = true;
    setSaving(true);
    setFatalError("");
    try {
    const grouped = new Map();
    selected.forEach((entry) => {
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
      const baseDraft = {
        ...(normalized || {}),
        base: normalized?.base,
        level: normalized?.level ?? "",
        limitBreak: normalized?.limitBreak || { grade: "", core: "" },
        combat: normalized?.combat ?? "",
        affectionLevel: normalized?.affectionLevel ?? "",
        equipments: normalized?.equipments || createEmptyEquipments(),
      };
      const trainingEntries = entries.filter((entry) => entry.type === "training");
      const equipmentEntries = entries.filter((entry) => entry.type !== "training");
      const trainingDraft = mergeTrainingOcrEntriesIntoDraft(baseDraft, trainingEntries);
      const draft = {
        ...trainingDraft,
        equipments: mergeOcrEntriesIntoEquipments(trainingDraft.equipments, equipmentEntries),
        equipmentMetadata: mergeOverloadOcrMetadata(trainingDraft.equipmentMetadata, equipmentEntries, catalogCharacter?.class || normalized?.base?.class),
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
    if (mountedRef.current) setSaveSummary({ saved: result?.saved?.length || 0, errors: result?.errors || [] });
    } catch (error) {
      if (mountedRef.current) setFatalError(`保存失败：${error?.message || error}。识别结果已保留，可以重试。`);
    } finally { busyRef.current = false; if (mountedRef.current) setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={running || saving ? undefined : onClose} fullWidth maxWidth="xl" aria-labelledby="screenshot-ocr-title">
      <DialogTitle id="screenshot-ocr-title">图片识别录入</DialogTitle>
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
          推荐选择安装目录内预置的 <code>NIKKE-Workshop\screenshots</code> 文件夹，并将截图放入对应角色子文件夹。{mode === "auto"
            ? "智能模式会逐张判断装备、技能、魔方或完整练度截图，同一角色文件夹可以混放不同截图。"
            : mode === "training"
            ? "练度模式会分别识别珍藏品、突破、等级、好感度、战斗力、职业/企业等级、技能和魔方；截图不完整时，只保存成功识别的字段，不会清空已有数据。"
            : "装备模式会定位白色装备面板，并读取装备图标、部位、三条词条与锁定状态。"}识别完全在本机完成，不会上传图片。
        </Alert>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>识别类型</InputLabel>
            <Select label="识别类型" value={mode} disabled={running || saving} onChange={(event) => {
              setMode(event.target.value);
              setResults([]);
              setSaveSummary(null);
              setFatalError("");
            }}>
              <MenuItem value="auto">智能识别（推荐）</MenuItem>
              <MenuItem value="equipment">装备截图</MenuItem>
              <MenuItem value="training">练度截图</MenuItem>
            </Select>
          </FormControl>
          <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={chooseFolder} disabled={running || saving}>选择截图目录</Button>
          <Button variant="contained" startIcon={running ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />} onClick={() => runOcr()} disabled={running || saving || groups.length <= unmatchedFolders.length}>开始识别</Button>
          {running ? <Button color="warning" onClick={() => abortRef.current?.abort()}>取消识别</Button> : null}
          <Typography variant="body2" color="text.secondary">
            {groups.length ? `已发现 ${groups.length} 个角色文件夹、${groups.reduce((sum, group) => sum + group.images.length, 0)} 张图片` : "尚未选择目录"}
          </Typography>
        </Stack>
        {running ? <Alert severity="info" role="status" sx={{ mb: 2 }}>{progressText(progress)}</Alert> : null}
        {fatalError ? <Alert severity="error" sx={{ mb: 2 }}>{fatalError}</Alert> : null}
        {unmatchedFolders.length ? <Alert severity="warning" sx={{ mb: 2 }}>以下未匹配角色将跳过：{unmatchedFolders.join("、")}。请将文件夹改为图鉴中的完整角色名，或先创建同名自定义角色；不影响其他角色识别。</Alert> : null}
        {saveSummary ? <Alert severity={saveSummary.errors.length ? "warning" : "success"} sx={{ mb: 2 }}>已保存 {saveSummary.saved} 名角色{saveSummary.errors.length ? `；${saveSummary.errors.join("；")}` : "，可在“已录入”和洗词条计算器中使用。"}</Alert> : null}
        {previewErrors.length && results.length ? <Alert severity="warning" sx={{ mb: 2 }}>保存前需处理：{previewErrors.join("；")}</Alert> : null}

        <Stack spacing={2}>
          {results.map((entry) => <Box key={entry.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, minWidth: 0 }}>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ p: 1.5 }}>
              <FormControlLabel control={<Checkbox checked={!entry.excluded && ["training", "equipment"].includes(entry.type)} disabled={running || saving || !["training", "equipment"].includes(entry.type)}
                onChange={(event) => updateEntry(entry.id, (current) => ({ ...current, excluded: !event.target.checked }))} />} label="导入此图" />
              <Typography sx={{ fontWeight: 700 }}>{entry.characterName}</Typography>
              <Typography variant="body2" sx={{ overflowWrap: "anywhere", mr: "auto" }}>{entry.fileName}</Typography>
              <Typography variant="caption" color="text.secondary">{((entry.elapsedMs || 0) / 1000).toFixed(1)} 秒</Typography>
              <Button disabled={running || saving} onClick={() => runOcr(entry)}>重试此图</Button>
              {["unknown", "error"].includes(entry.type) ? <>
                <Button disabled={running || saving} onClick={() => runOcr(entry, "training")}>按练度重试</Button>
                <Button disabled={running || saving} onClick={() => runOcr(entry, "equipment")}>按装备重试</Button>
              </> : null}
            </Stack>
            <Box component="fieldset" disabled={running || saving} sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
            {entry.type === "training" ? <TrainingOcrResultCard entry={entry} existing={existingRecordByName(localRecords, entry.characterName)}
              onFieldChange={(field, result) => updateEntry(entry.id, (current) => ({ ...current, fields: { ...current.fields, [field]: result } }))} /> : entry.type === "equipment" ? (
            <Box>
              <Box sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", bgcolor: "grey.50" }}>
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
                <Stack spacing={1.25} sx={{ minWidth: 0 }}>
                  {entry.lines.map((line) => (
                    <Box key={line.position} sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "36px minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, .9fr)" }, gap: 1, alignItems: "center" }}>
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
            ) : <Alert severity={entry.type === "error" ? "error" : "warning"} sx={{ m: 2 }}>{entry.error || "未得到可靠识别结果；此图不会保存。"}</Alert>}
            </Box>
          </Box>)}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={running || saving}>关闭</Button>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={18} /> : <SaveIcon />} onClick={save} disabled={running || saving || !selected.length || Boolean(previewErrors.length)}>{saving ? "正在保存" : "确认保存到已录入"}</Button>
      </DialogActions>
    </Dialog>
  );
}

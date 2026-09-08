// SPDX-License-Identifier: GPL-3.0-or-later
import { Box, Checkbox, Chip, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { CUBE_ICON_CATALOG } from "../../domain/cubeIconCatalog.js";
import { TRAINING_FIELD_LABELS, formatTrainingFieldValue } from "../../domain/trainingScreenshotOcr.js";
import { editTrainingField, existingTrainingValue, TRAINING_NUMERIC_RANGES } from "../../domain/screenshotOcrReview.js";

function FieldEditor({ result, onChange }) {
  const field = result.field, value = result.value;
  const number = (label, current, change, min, max) => <TextField size="small" type="number" fullWidth label={label}
    value={current ?? ""} onChange={(event) => change(event.target.value)} slotProps={{ htmlInput: { min, max, step: 1 } }} />;
  if (TRAINING_NUMERIC_RANGES[field]) return number(TRAINING_FIELD_LABELS[field], value, onChange, ...TRAINING_NUMERIC_RANGES[field]);
  if (field === "cubeType") return <TextField select fullWidth size="small" label="魔方类型" value={value?.cubeId ?? ""} onChange={(event) => onChange({ cubeId: Number(event.target.value) })}>
    <MenuItem value="">未确认</MenuItem>{CUBE_ICON_CATALOG.map((cube) => <MenuItem key={cube.cubeId} value={cube.cubeId}>{cube.nameCn}</MenuItem>)}
  </TextField>;
  if (field === "limitBreak") return <Stack direction="row" spacing={1}>
    {number("突破星级", value?.stars, (stars) => onChange({ ...value, stars }), 0, 3)}
    {number("核心突破", value?.core, (core) => onChange({ ...value, core }), 0, 7)}
  </Stack>;
  if (field === "collectible") return <Stack direction="row" spacing={1}>
    <TextField select fullWidth size="small" label="收藏品稀有度" value={value?.rarity ?? ""} onChange={(event) => onChange({ ...value, rarity: event.target.value })}>
      <MenuItem value="">未确认</MenuItem>{["R", "SR", "SSR"].map((rarity) => <MenuItem key={rarity} value={rarity}>{rarity}</MenuItem>)}
    </TextField>
    {number("收藏品星级", value?.stars, (stars) => onChange({ ...value, stars }), value?.rarity === "SSR" ? 1 : 0, 3)}
  </Stack>;
  return null;
}

export default function TrainingOcrResultCard({ entry, existing, onFieldChange }) {
  return <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "260px minmax(0, 1fr)" }, gap: 2, p: 2 }}>
    {entry.panelPreviewUrl || entry.previewUrl ? <Box component="img" loading="lazy" src={entry.panelPreviewUrl || entry.previewUrl} alt={`${entry.characterName}练度截图`} sx={{ width: "100%", maxHeight: 520, objectFit: "contain", bgcolor: "action.hover" }} /> : <Typography color="text.secondary">无截图预览</Typography>}
    <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />} spacing={1.5} sx={{ minWidth: 0 }}>
      {Object.entries(entry.fields || {}).map(([field, result]) => {
        const previous = existingTrainingValue(existing, field);
        const ready = result.status === "recognized";
        const original = result.original || result;
        return <Box key={field} sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1 }}>
            <FormControlLabel sx={{ mr: 0 }} control={<Checkbox checked={ready && !result.excluded} disabled={!ready}
              onChange={(event) => onFieldChange(field, { ...result, excluded: !event.target.checked })} />}
              label={`导入${TRAINING_FIELD_LABELS[field]}`} />
            <Chip size="small" variant="outlined" color={result.manual ? "info" : ready ? "success" : result.status === "error" ? "error" : "default"}
              label={result.manual ? "人工修改" : ready ? "已识别" : result.status === "not_visible" ? "未定位" : result.status === "error" ? "识别失败" : "待确认"} />
          </Stack>
          <FieldEditor result={result} onChange={(value) => onFieldChange(field, editTrainingField(result, value))} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: "anywhere" }}>
            原值：{field === "collectible" ? previous || "—" : formatTrainingFieldValue(field, previous)} → {ready && !result.excluded ? formatTrainingFieldValue(field, result.value) : "保留原值"}
          </Typography>
          {original.value != null ? <Typography variant="caption" color="text.secondary">原始识别：{formatTrainingFieldValue(field, original.value)}（置信度 {Math.round((original.confidence || 0) * 100)}%）</Typography> : null}
          {result.warnings?.[0] ? <Typography variant="caption" color="text.secondary" display="block">{result.warnings[0]}</Typography> : null}
          {field === "collectible" ? <Typography variant="caption" color="text.secondary" display="block">星级单独记录；不会把 R／SR 星级换算成精确等级覆盖已有数据。</Typography> : null}
        </Box>;
      })}
    </Stack>
  </Box>;
}

// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, Divider, Drawer, FormControl, InputLabel, MenuItem,
  Select, Stack, TextField, Typography,
} from "@mui/material";
import {
  EQUIPMENT_FUNCTION_LABELS,
  EQUIPMENT_FUNCTION_TYPES,
  catalogCharacterToBaseProfile,
  createEmptyEquipments,
  normalizeLocalCharacterRecord,
} from "../../domain/localCharacterRoster.js";

const SLOT_NAMES = ["头部装备", "身体装备", "手部装备", "足部装备"];
const PROFILE_FIELDS = [
  ["element", "属性", "elements"], ["class", "职业", "classes"],
  ["burstStage", "爆裂阶段", "bursts"], ["corporation", "企业", "corporations"],
  ["weaponType", "武器类型", "weapons"], ["rarity", "稀有度", "rarities"],
];

function emptyDraft(catalogCharacter, custom) {
  return {
    base: custom ? { name: "", nameCn: "", nameEn: "", element: "", class: "", burstStage: "", corporation: "", weaponType: "", rarity: "" }
      : catalogCharacterToBaseProfile(catalogCharacter),
    level: "", limitBreak: { grade: "", core: "" }, combat: "", affectionLevel: "",
    equipments: createEmptyEquipments(),
  };
}

function recordToDraft(record) {
  const normalized = normalizeLocalCharacterRecord(record);
  return {
    base: { ...normalized.base }, level: normalized.level ?? "",
    limitBreak: { grade: normalized.limitBreak.grade ?? "", core: normalized.limitBreak.core ?? "" },
    combat: normalized.combat ?? "", affectionLevel: normalized.affectionLevel ?? "",
    equipments: normalized.equipments.map((slot) => slot.map((line) => ({ ...line, value: line.value ?? "", level: line.level ?? "" }))),
  };
}

export default function LocalCharacterEntryDrawer({
  open, onClose, catalogCharacter, record, custom = false, catalogOptions, optionLabels, onSave, onDelete,
}) {
  const [draft, setDraft] = useState(() => record ? recordToDraft(record) : emptyDraft(catalogCharacter, custom));
  const [errors, setErrors] = useState([]);
  const title = custom ? (record ? "编辑自定义角色" : "新建自定义角色") : (record ? "编辑角色录入" : "录入标准角色");
  const standardBase = useMemo(() => catalogCharacter ? catalogCharacterToBaseProfile(catalogCharacter) : null, [catalogCharacter]);

  const updateBase = (key, value) => setDraft((current) => ({
    ...current,
    base: { ...current.base, [key]: value, ...(key === "name" ? { nameCn: value, nameEn: value } : {}) },
  }));
  const updateLine = (slotIndex, lineIndex, key, value) => setDraft((current) => ({
    ...current,
    equipments: current.equipments.map((slot, currentSlot) => currentSlot !== slotIndex ? slot : slot.map((line, currentLine) => (
      currentLine === lineIndex ? { ...line, [key]: value } : line
    ))),
  }));
  const save = async () => {
    const result = await onSave(draft);
    if (result?.errors?.length) setErrors(result.errors);
    else onClose();
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "min(96vw, 620px)", sm: 620 }, p: 2.5 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
        <Box><Typography variant="h6">{title}</Typography><Typography variant="body2" color="text.secondary">数据只保存在当前浏览器本地。</Typography></Box>
        {record?.syncMissing ? <Chip color="warning" size="small" label="同步未发现" /> : null}
      </Stack>
      <Divider sx={{ my: 2 }} />
      {errors.length ? <Alert severity="error" sx={{ mb: 2 }}>{errors.join("；")}</Alert> : null}
      {custom ? (
        <Stack spacing={1.5}>
          <TextField label="名称" required value={draft.base.name} onChange={(event) => updateBase("name", event.target.value)} />
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 }}>
            {PROFILE_FIELDS.map(([key, label, optionKey]) => (
              <FormControl key={key} required size="small"><InputLabel>{label}</InputLabel><Select label={label} value={draft.base[key]} onChange={(event) => updateBase(key, event.target.value)}>
                {(catalogOptions?.[optionKey] || []).map((value) => <MenuItem key={value} value={value}>{optionLabels?.[key]?.(value) || value}</MenuItem>)}
              </Select></FormControl>
            ))}
          </Box>
        </Stack>
      ) : (
        <Box><Typography variant="h5" sx={{ fontWeight: 600 }}>{standardBase?.name}</Typography><Stack direction="row" gap={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
          {[standardBase?.element, standardBase?.class, standardBase?.burstStage, standardBase?.corporation, standardBase?.weaponType, standardBase?.rarity].filter(Boolean).map((value) => <Chip key={value} size="small" label={value} />)}
        </Stack></Box>
      )}
      <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 600 }}>账号数据</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 }}>
        <TextField type="number" label="等级（可留空）" value={draft.level} onChange={(event) => setDraft((value) => ({ ...value, level: event.target.value }))} />
        <TextField type="number" label="战斗力（可留空）" value={draft.combat} onChange={(event) => setDraft((value) => ({ ...value, combat: event.target.value }))} />
        <TextField type="number" label="突破（可留空）" value={draft.limitBreak.grade} onChange={(event) => setDraft((value) => ({ ...value, limitBreak: { ...value.limitBreak, grade: event.target.value } }))} />
        <TextField type="number" label="核心突破（可留空）" value={draft.limitBreak.core} onChange={(event) => setDraft((value) => ({ ...value, limitBreak: { ...value.limitBreak, core: event.target.value } }))} />
        <TextField type="number" label="好感度（可留空）" value={draft.affectionLevel} onChange={(event) => setDraft((value) => ({ ...value, affectionLevel: event.target.value }))} />
      </Box>
      <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 600 }}>四件装备</Typography>
      <Stack spacing={2}>
        {draft.equipments.map((slot, slotIndex) => (
          <Box key={SLOT_NAMES[slotIndex]} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{SLOT_NAMES[slotIndex]}</Typography>
            <Stack spacing={1}>{slot.map((line, lineIndex) => (
              <Box key={line.position} sx={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1.7fr) minmax(80px, 1fr) minmax(70px, .8fr)", gap: 1, alignItems: "center" }}>
                <Typography color="text.secondary">{lineIndex + 1}</Typography>
                <TextField select size="small" label="词条" value={line.functionType} onChange={(event) => updateLine(slotIndex, lineIndex, "functionType", event.target.value)}>
                  <MenuItem value="">空词条</MenuItem>{EQUIPMENT_FUNCTION_TYPES.map((type) => <MenuItem key={type} value={type}>{EQUIPMENT_FUNCTION_LABELS[type]}</MenuItem>)}
                </TextField>
                <TextField type="number" size="small" label="数值" value={line.value} onChange={(event) => updateLine(slotIndex, lineIndex, "value", event.target.value)} inputProps={{ step: "0.01" }} />
                <TextField type="number" size="small" label="档位" value={line.level} onChange={(event) => updateLine(slotIndex, lineIndex, "level", event.target.value)} inputProps={{ min: 1, max: 15 }} />
              </Box>
            ))}</Stack>
          </Box>
        ))}
      </Stack>
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 3 }}>
        {record ? <Button color="error" onClick={onDelete}>删除录入</Button> : null}
        <Button onClick={onClose}>取消</Button><Button variant="contained" onClick={save}>保存</Button>
      </Stack>
    </Drawer>
  );
}

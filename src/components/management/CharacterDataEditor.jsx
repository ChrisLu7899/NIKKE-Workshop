// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, FormControl, FormControlLabel, InputLabel, MenuItem,
  Select, Stack, TextField, Typography,
} from "@mui/material";
import {
  EQUIPMENT_FUNCTION_LABELS,
  EQUIPMENT_FUNCTION_TYPES,
  catalogCharacterToBaseProfile,
  createEmptyEquipments,
  normalizeLocalCharacterRecord,
} from "../../domain/localCharacterRoster.js";
import { EQUIPMENT_TIER_VALUES } from "../../domain/equipmentAffixes.js";

const SLOT_NAMES = ["头部", "身躯", "臂部", "腿部"];
const PROFILE_FIELDS = [
  ["element", "属性", "elements"], ["class", "职业", "classes"],
  ["burstStage", "爆裂阶段", "bursts"], ["corporation", "企业", "corporations"],
  ["weaponType", "武器类型", "weapons"], ["rarity", "稀有度", "rarities"],
];

const emptyDraft = (catalogCharacter, custom) => ({
  base: custom
    ? { name: "", nameCn: "", nameEn: "", element: "", class: "", burstStage: "", corporation: "", weaponType: "", rarity: "" }
    : catalogCharacterToBaseProfile(catalogCharacter),
  level: "", limitBreak: { grade: "", core: "" }, combat: "", affectionLevel: "",
  equipments: createEmptyEquipments(),
});

const characterToDraft = (character, catalogCharacter, custom) => {
  if (!character) return emptyDraft(catalogCharacter, custom);
  const normalized = normalizeLocalCharacterRecord({
    ...character,
    base: custom ? character.base : catalogCharacterToBaseProfile(catalogCharacter),
  });
  return {
    base: { ...normalized.base }, level: normalized.level ?? "",
    limitBreak: { grade: normalized.limitBreak.grade ?? "", core: normalized.limitBreak.core ?? "" },
    combat: normalized.combat ?? "", affectionLevel: normalized.affectionLevel ?? "",
    equipments: normalized.equipments.map((slot) => slot.map((line) => ({ ...line, value: line.value ?? "", level: line.level ?? "" }))),
  };
};

export default function CharacterDataEditor({
  catalogCharacter, record, initialCharacterData, custom = false, catalogOptions, optionLabels,
  onSave, onDelete, onCancel, embedded = false,
}) {
  const [draft, setDraft] = useState(() => characterToDraft(record || initialCharacterData, catalogCharacter, custom));
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const standardBase = useMemo(() => catalogCharacter ? catalogCharacterToBaseProfile(catalogCharacter) : null, [catalogCharacter]);

  const updateBase = (key, value) => setDraft((current) => ({
    ...current, base: { ...current.base, [key]: value, ...(key === "name" ? { nameCn: value, nameEn: value } : {}) },
  }));
  const updateLine = (slotIndex, lineIndex, key, value) => setDraft((current) => ({
    ...current,
    equipments: current.equipments.map((slot, currentSlot) => currentSlot !== slotIndex ? slot : slot.map((line, currentLine) => (
      currentLine === lineIndex ? { ...line, [key]: value } : line
    ))),
  }));
  const updateLineType = (slotIndex, lineIndex, functionType) => setDraft((current) => ({
    ...current,
    equipments: current.equipments.map((slot, currentSlot) => currentSlot !== slotIndex ? slot : slot.map((line, currentLine) => (
      currentLine === lineIndex ? { ...line, functionType, value: "", level: "", locked: functionType ? false : null } : line
    ))),
  }));
  const updateLineTier = (slotIndex, lineIndex, functionType, selectedLevel) => {
    const level = Number(selectedLevel);
    const value = EQUIPMENT_TIER_VALUES[functionType]?.[level - 1];
    setDraft((current) => ({
      ...current,
      equipments: current.equipments.map((slot, currentSlot) => currentSlot !== slotIndex ? slot : slot.map((line, currentLine) => (
        currentLine === lineIndex ? { ...line, level: Number.isInteger(level) && value !== undefined ? level : "", value: value ?? "" } : line
      ))),
    }));
  };
  const save = async () => {
    setSaving(true);
    try {
      const result = await onSave(draft);
      if (result?.errors?.length) setErrors(result.errors);
      else {
        setErrors([]);
        if (!embedded) onCancel?.();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
        <Box><Typography variant="h6">{custom ? (record ? "编辑自定义角色" : "新建自定义角色") : "角色数据"}</Typography><Typography variant="body2" color="text.secondary">同步或导入的数据会自动带入；保存后仅写入当前浏览器本地。</Typography></Box>
        {record?.syncMissing ? <Chip color="warning" size="small" label="同步未发现" sx={{ flexShrink: 0 }} /> : null}
      </Stack>
      {errors.length ? <Alert severity="error" sx={{ mt: 2 }}>{errors.join("；")}</Alert> : null}
      {custom ? (
        <Stack spacing={1.5} sx={{ mt: 2.5 }}>
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
        <Box sx={{ mt: 2.5 }}><Typography variant="h5" sx={{ fontWeight: 600 }}>{standardBase?.name}</Typography><Stack direction="row" gap={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
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
              <Box key={line.position} sx={{ display: "grid", gridTemplateColumns: "24px minmax(0, 240px) minmax(0, 170px) minmax(84px, max-content)", gap: 0.75, alignItems: "center" }}>
                <Typography color="text.secondary">{lineIndex + 1}</Typography>
                <TextField select size="small" label="词条" value={line.functionType} onChange={(event) => updateLineType(slotIndex, lineIndex, event.target.value)}>
                  <MenuItem value="">空词条</MenuItem>{EQUIPMENT_FUNCTION_TYPES.map((type) => <MenuItem key={type} value={type}>{EQUIPMENT_FUNCTION_LABELS[type]}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="档位与数值" value={line.level || ""} disabled={!line.functionType} onChange={(event) => updateLineTier(slotIndex, lineIndex, line.functionType, event.target.value)}>
                  <MenuItem value="">请选择</MenuItem>{(EQUIPMENT_TIER_VALUES[line.functionType] || []).map((value, index) => <MenuItem key={index + 1} value={index + 1}>[{index + 1}档] {value.toFixed(2)}%</MenuItem>)}
                </TextField>
                <FormControlLabel control={<Checkbox checked={line.locked === true} disabled={!line.functionType} onChange={(event) => updateLine(slotIndex, lineIndex, "locked", event.target.checked)} />} label="已锁" />
              </Box>
            ))}</Stack>
          </Box>
        ))}
      </Stack>
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 3, pb: embedded ? 1 : 0 }}>
        {record && onDelete ? <Button color="error" onClick={onDelete}>删除录入</Button> : null}
        {onCancel ? <Button onClick={onCancel}>取消</Button> : null}
        <Button variant="contained" disabled={saving} onClick={save}>{saving ? "保存中…" : "保存"}</Button>
      </Stack>
    </Box>
  );
}

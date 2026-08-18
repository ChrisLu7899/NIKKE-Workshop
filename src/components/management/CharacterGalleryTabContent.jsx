// SPDX-License-Identifier: GPL-3.0-or-later

import { memo, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  ListSubheader,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import LibraryAddCheckIcon from "@mui/icons-material/LibraryAddCheck";
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SyncIcon from "@mui/icons-material/Sync";
import TuneIcon from "@mui/icons-material/Tune";
import {
  RECOMMENDATION_PRESETS,
  RECOMMENDATION_PRESET_GROUPS,
  getRecommendationPreset,
  recommendationCollectionId,
} from "../../data/recommendationPresets.js";
import {
  SYSTEM_COLLECTION_IDS,
  buildCharactersConfig,
  characterCodeSet,
  flattenCharacterConfig,
  mergeNikkesIntoCharacters,
  removeCodesFromCharacters,
} from "../../utils/characterCollections.js";
import { resolveShowStats } from "../../utils/showStats.js";
import { isCommonCharacterTemplate } from "../../data/commonCharacterList.js";

const STAT_TYPE_NAMES = {
  IncElementDmg: "优越代码伤害增加",
  StatAtk: "攻击力增加",
  StatAmmoLoad: "最大装弹数增加",
  StatChargeTime: "蓄力速度增加",
  StatChargeDamage: "蓄力伤害增加",
  StatCritical: "暴击率增加",
  StatCriticalDamage: "暴击伤害增加",
  StatAccuracyCircle: "命中率增加",
  StatDef: "防御力增加",
};

const FALLBACK_COPY = {
  zh: {
    title: "妮姬图鉴",
    catalog: "全图鉴",
    defaultCollection: "默认",
    owned: "已获得",
    search: "搜索妮姬",
    filters: "筛选",
    sortCombat: "战斗力",
    defaultSort: "默认",
    sortLevel: "等级",
    sortLimitBreak: "极限突破",
    sortRarity: "级别",
    sortAffection: "好感度",
    multi: "自选列表",
    finish: "完成",
    resetFilters: "重置",
    filterTitle: "筛选",
    sortTitle: "排序",
    element: "属性",
    class: "职业",
    burst: "爆裂阶段",
    corporation: "企业",
    ownedState: "已拥有",
    selectedState: "当前列表",
    weapon: "武器",
    noResults: "没有符合当前条件的妮姬",
    sync: "同步账号数据",
    addToList: "加入列表",
    createList: "新建列表",
    removeFromList: "移出当前列表",
    cancel: "取消",
    listName: "列表名称",
    selectedCount: "已选择 {count} 名妮姬",
    ownedCount: "已拥有 {count}",
    catalogCount: "图鉴 {count}",
    details: "角色信息",
    notOwned: "账号尚未获得",
    noOwnedData: "同步账号数据后可查看当前装备并创建列表。",
    equipment: "装备 {slot}",
    noEquipmentLines: "暂无词条",
    customLists: "自建列表",
    listEmpty: "这个列表暂时没有妮姬。可以进入多选模式后添加。",
    selectOwnedOnly: "自建列表只能加入账号已获得的妮姬。",
    globalOutputHint: "输出字段应用于当前列表",
    outputSettings: "输出设置",
    outputSettingsHint: "选择下载当前列表时需要包含的数据字段。",
    downloadScopeHint: "下载当前列表的全部已获得妮姬；如需部分角色，请先建立单独列表。",
    selectAll: "全选",
    clearSelection: "全不选",
  },
  en: {
    title: "Nikke Gallery",
    catalog: "Full catalog",
    defaultCollection: "Default",
    owned: "Owned",
    search: "Search Nikkes",
    filters: "Filters",
    sortCombat: "Combat power",
    defaultSort: "Default",
    sortLevel: "Level",
    sortLimitBreak: "Limit break",
    sortRarity: "Rarity",
    sortAffection: "Bond",
    multi: "Custom list",
    finish: "Done",
    resetFilters: "Reset",
    filterTitle: "Filters",
    sortTitle: "Sort",
    element: "Element",
    class: "Class",
    burst: "Burst stage",
    corporation: "Manufacturer",
    ownedState: "Owned",
    selectedState: "In current list",
    weapon: "Weapon",
    noResults: "No Nikkes match the current filters",
    sync: "Sync account data",
    addToList: "Add to list",
    createList: "Create list",
    removeFromList: "Remove from current list",
    cancel: "Cancel",
    listName: "List name",
    selectedCount: "{count} selected",
    ownedCount: "{count} owned",
    catalogCount: "{count} catalog entries",
    details: "Character details",
    notOwned: "Not owned on this account",
    noOwnedData: "Sync account data to inspect equipment and create lists.",
    equipment: "Equipment {slot}",
    noEquipmentLines: "No effects",
    customLists: "Custom lists",
    listEmpty: "This list is empty. Enter selection mode to add Nikkes.",
    selectOwnedOnly: "Only owned Nikkes can be added to a custom list.",
    globalOutputHint: "Output fields apply to the current list",
    outputSettings: "Output fields",
    outputSettingsHint: "Choose the fields included when downloading the current list.",
    downloadScopeHint: "Downloads include every owned Nikke in the current list. Create a separate list for a smaller scope.",
    selectAll: "Select all",
    clearSelection: "Clear all",
  },
};

const normalizeCode = (value) => String(value ?? "").trim();

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getLimitBreakScore = (character) => {
  const grade = toFiniteNumber(character?.limitBreak?.grade);
  const core = toFiniteNumber(character?.limitBreak?.core);
  if (grade === null && core === null) return null;
  return Math.max(0, grade || 0) + Math.max(0, core || 0);
};

const formatLimitBreak = (character) => {
  const grade = Math.max(0, toFiniteNumber(character?.limitBreak?.grade) || 0);
  const core = Math.max(0, toFiniteNumber(character?.limitBreak?.core) || 0);
  if (grade < 3) return `${grade}★`;
  if (core >= 7) return "MAX";
  if (core > 0) return `+${core}`;
  return "3★";
};

const matchesBurstFilter = (burst, selectedBursts) => {
  if (!selectedBursts.length) return true;
  if (burst === "AllStep") return true;
  return selectedBursts.includes(burst);
};

const filterButtonSx = (active) => ({
  minHeight: 36,
  borderColor: active ? "primary.main" : "divider",
  bgcolor: active ? "#e3f2fd" : "background.paper",
  color: active ? "primary.main" : "text.primary",
  "&:hover": { bgcolor: active ? "#e3f2fd" : "action.hover" },
});

function FilterGroup({ title, values, selected, labelFor, onToggle }) {
  if (!values.length) return null;
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{title}</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {values.map((value) => {
          const active = selected.includes(value);
          return (
            <Button
              key={value}
              variant="outlined"
              size="small"
              aria-pressed={active}
              onClick={() => onToggle(value)}
              sx={filterButtonSx(active)}
            >
              {labelFor(value)}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}

const CharacterGalleryTabContent = ({
  t,
  lang,
  nikkeList,
  templates,
  defaultTemplateId,
  selectedTemplateId,
  activeCollectionId,
  onCollectionChange,
  isRenaming,
  renameId,
  renameValue,
  setRenameValue,
  confirmRename,
  setIsRenaming,
  setRenameId,
  startRenameTemplate,
  handleDuplicateTemplate,
  handleDeleteTemplate,
  handleCreateTemplateFromData,
  handleUpdateTemplateData,
  characters,
  getElementName,
  getClassName,
  getCorporationName,
  getBurstStageName,
  getNikkeAvatarUrl,
  getDisplayName,
  updateAllCharactersShowStats,
  equipStatKeys,
  equipStatLabels,
  basicStatKeys,
  simulatedStatKeys,
  ownedSnapshot,
  ownedShowStats,
  onOwnedShowStatChange,
  recommendationShowStats,
  onRecommendationShowStatChange,
  fetchLoading,
  downloadLoading,
  dataReady,
  onFetchCharacterData,
  onDownloadCharacterData,
  onOpenSettings,
  actionsDisabled,
  syncBlockedReason,
}) => {
  const copy = FALLBACK_COPY[lang === "en" ? "en" : "zh"];
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState(() => (
    getRecommendationPreset(activeCollectionId) ? "default" : "combat"
  ));
  const [sortDirection, setSortDirection] = useState("desc");
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [outputAnchorEl, setOutputAnchorEl] = useState(null);
  const [detailNikke, setDetailNikke] = useState(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState(() => new Set());
  const [targetTemplateId, setTargetTemplateId] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [filters, setFilters] = useState({
    elements: [],
    classes: [],
    bursts: [],
    corporations: [],
    weapons: [],
  });

  const ownedCharacterMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(ownedSnapshot?.accounts) ? ownedSnapshot.accounts : []).forEach((account) => {
      (Array.isArray(account?.characters) ? account.characters : []).forEach((character) => {
        const code = normalizeCode(character?.nameCode);
        if (code && !map.has(code)) map.set(code, { ...character, accountName: account.accountName });
      });
    });
    return map;
  }, [ownedSnapshot]);
  const ownedCodes = useMemo(() => new Set(ownedCharacterMap.keys()), [ownedCharacterMap]);

  const currentTemplate = useMemo(() => {
    if (!String(activeCollectionId).startsWith("template:")) return null;
    const id = String(activeCollectionId).slice("template:".length);
    return templates.find((template) => template.id === id) || null;
  }, [activeCollectionId, templates]);
  const currentRecommendation = useMemo(
    () => getRecommendationPreset(activeCollectionId),
    [activeCollectionId],
  );
  const currentTemplateFixed = isCommonCharacterTemplate(currentTemplate);
  const effectiveSortMode = !currentRecommendation && sortMode === "default"
    ? "combat"
    : sortMode;
  const currentListCodes = useMemo(
    () => currentTemplate ? characterCodeSet(currentTemplate.data) : new Set(),
    [currentTemplate],
  );

  const catalogValues = useMemo(() => {
    const unique = (key) => [...new Set((nikkeList || []).map((nikke) => nikke?.[key]).filter(Boolean))];
    return {
      elements: unique("element"),
      classes: unique("class"),
      bursts: unique("use_burst_skill"),
      corporations: unique("corporation"),
      weapons: unique("weapon_type"),
    };
  }, [nikkeList]);

  const collectionNikkes = useMemo(() => {
    if (activeCollectionId === SYSTEM_COLLECTION_IDS.catalog) return nikkeList || [];
    if (activeCollectionId === SYSTEM_COLLECTION_IDS.owned) {
      return (nikkeList || []).filter((nikke) => ownedCodes.has(normalizeCode(nikke?.name_code)));
    }
    if (currentRecommendation) {
      const recommendationOrder = new Map(
        currentRecommendation.items.map((entry, index) => [normalizeCode(entry.nameCode), index]),
      );
      return (nikkeList || [])
        .filter((nikke) => recommendationOrder.has(normalizeCode(nikke?.name_code)))
        .sort((left, right) => (
          recommendationOrder.get(normalizeCode(left?.name_code))
          - recommendationOrder.get(normalizeCode(right?.name_code))
        ));
    }
    if (currentTemplate) {
      return (nikkeList || []).filter((nikke) => currentListCodes.has(normalizeCode(nikke?.name_code)));
    }
    return [];
  }, [activeCollectionId, currentListCodes, currentRecommendation, currentTemplate, nikkeList, ownedCodes]);

  const visibleNikkes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = collectionNikkes.filter((nikke) => {
      if (query) {
        const names = [nikke?.name_cn, nikke?.name_en, nikke?.name_code]
          .map((value) => String(value || "").toLocaleLowerCase());
        if (!names.some((name) => name.includes(query))) return false;
      }
      if (filters.elements.length && !filters.elements.includes(nikke?.element)) return false;
      if (filters.classes.length && !filters.classes.includes(nikke?.class)) return false;
      if (!matchesBurstFilter(nikke?.use_burst_skill, filters.bursts)) return false;
      if (filters.corporations.length && !filters.corporations.includes(nikke?.corporation)) return false;
      if (filters.weapons.length && !filters.weapons.includes(nikke?.weapon_type)) return false;
      return true;
    });
    if (currentRecommendation && effectiveSortMode === "default") return filtered;
    return [...filtered].sort((left, right) => {
      const leftOwned = ownedCharacterMap.get(normalizeCode(left?.name_code));
      const rightOwned = ownedCharacterMap.get(normalizeCode(right?.name_code));
      const rarityScore = (nikke) => ({ SSR: 3, SR: 2, R: 1 }[String(nikke?.original_rare || "").toUpperCase()] || 0);
      const valueFor = (nikke, owned) => {
        if (effectiveSortMode === "combat") return toFiniteNumber(owned?.combat);
        if (effectiveSortMode === "level") return toFiniteNumber(owned?.level);
        if (effectiveSortMode === "limitBreak") return getLimitBreakScore(owned);
        if (effectiveSortMode === "affection") return toFiniteNumber(owned?.affectionLevel);
        if (effectiveSortMode === "rarity") return rarityScore(nikke);
        return null;
      };
      const leftValue = valueFor(left, leftOwned);
      const rightValue = valueFor(right, rightOwned);
      if (leftValue === null && rightValue !== null) return 1;
      if (leftValue !== null && rightValue === null) return -1;
      if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
        return sortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }
      return (nikkeList || []).indexOf(left) - (nikkeList || []).indexOf(right);
    });
  }, [collectionNikkes, currentRecommendation, effectiveSortMode, filters, nikkeList, ownedCharacterMap, search, sortDirection]);

  const simulatedStatLabels = useMemo(
    () => [t("simulatedHp"), t("simulatedAtk"), t("simulatedDef")],
    [t],
  );
  const globalStatColumns = useMemo(() => {
    const basicLabels = {
      limit_break: t("limitBreak"),
      skill1_level: t("skill1"),
      skill2_level: t("skill2"),
      skill_burst_level: t("burst"),
    };
    return [
      { key: "AtkElemLbScore", label: t("atkElemLbScore") },
      ...(basicStatKeys || []).map((key) => ({ key, label: basicLabels[key] || key })),
      ...(simulatedStatKeys || []).map((key, index) => ({ key, label: simulatedStatLabels[index] || key })),
      ...(equipStatKeys || []).map((key, index) => ({ key, label: equipStatLabels[index] || key })),
    ];
  }, [basicStatKeys, equipStatKeys, equipStatLabels, simulatedStatKeys, simulatedStatLabels, t]);
  const configuredCharacters = useMemo(() => {
    if (activeCollectionId === SYSTEM_COLLECTION_IDS.owned) {
      return ownedCodes.size ? [{ showStats: ownedShowStats }] : [];
    }
    if (currentRecommendation) {
      return [{ showStats: recommendationShowStats }];
    }
    return currentTemplate ? flattenCharacterConfig(characters) : [];
  }, [activeCollectionId, characters, currentRecommendation, currentTemplate, ownedCodes.size, ownedShowStats, recommendationShowStats]);
  const globalStatStates = useMemo(() => Object.fromEntries(globalStatColumns.map(({ key }) => {
    const visibleCount = configuredCharacters.filter((character) =>
      resolveShowStats(character.showStats).effective.includes(key)).length;
    return [key, {
      checked: configuredCharacters.length > 0 && visibleCount === configuredCharacters.length,
      indeterminate: visibleCount > 0 && visibleCount < configuredCharacters.length,
    }];
  })), [configuredCharacters, globalStatColumns]);
  const globalOutputEnabled = Boolean(
    activeCollectionId !== SYSTEM_COLLECTION_IDS.catalog,
  );
  const updateGlobalShowStat = (key, checked) => {
    if (activeCollectionId === SYSTEM_COLLECTION_IDS.owned) {
      onOwnedShowStatChange(key, checked);
      return;
    }
    if (currentRecommendation) {
      onRecommendationShowStatChange(activeCollectionId, key, checked);
      return;
    }
    updateAllCharactersShowStats(key, checked);
  };

  const selectableVisibleCodes = useMemo(
    () => visibleNikkes
      .map((nikke) => normalizeCode(nikke?.name_code))
      .filter((code) => ownedCodes.has(code)),
    [ownedCodes, visibleNikkes],
  );
  const allVisibleSelected = Boolean(
    selectableVisibleCodes.length
    && selectableVisibleCodes.every((code) => selectedCodes.has(code)),
  );
  const toggleSelectAll = () => {
    setSelectedCodes(allVisibleSelected ? new Set() : new Set(selectableVisibleCodes));
  };

  const activeFilterCount = filters.elements.length
    + filters.classes.length
    + filters.bursts.length
    + filters.corporations.length
    + filters.weapons.length;

  const editableTemplates = templates.filter((template) => !isCommonCharacterTemplate(template));
  const effectiveTargetTemplateId = editableTemplates.some((template) => template.id === targetTemplateId)
    ? targetTemplateId
    : (editableTemplates.some((template) => template.id === selectedTemplateId)
        ? selectedTemplateId
        : (editableTemplates[0]?.id || ""));

  const changeCollection = (collectionId) => {
    setSelectedCodes(new Set());
    setMultiSelectMode(false);
    setOutputAnchorEl(null);
    setSortMode((current) => {
      if (getRecommendationPreset(collectionId)) return "default";
      return current === "default" ? "combat" : current;
    });
    onCollectionChange(collectionId);
  };

  const toggleFilterValue = (key, value) => {
    setFilters((previous) => ({
      ...previous,
      [key]: previous[key].includes(value)
        ? previous[key].filter((item) => item !== value)
        : [...previous[key], value],
    }));
  };

  const resetFilters = () => setFilters({
    elements: [], classes: [], bursts: [], corporations: [], weapons: [],
  });

  const handleCardClick = (nikke) => {
    const code = normalizeCode(nikke?.name_code);
    if (!multiSelectMode) {
      setDetailNikke(nikke);
      return;
    }
    if (!ownedCodes.has(code)) return;
    setSelectedCodes((previous) => {
      const next = new Set(previous);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectedNikkes = useMemo(
    () => (nikkeList || []).filter((nikke) => selectedCodes.has(normalizeCode(nikke?.name_code))),
    [nikkeList, selectedCodes],
  );

  const handleAddToList = async () => {
    const target = templates.find((template) => template.id === effectiveTargetTemplateId);
    if (!target || !selectedNikkes.length) return;
    const nextData = mergeNikkesIntoCharacters(target.data, selectedNikkes);
    await handleUpdateTemplateData(target.id, nextData);
    changeCollection(`template:${target.id}`);
  };

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name || !selectedNikkes.length) return;
    const id = await handleCreateTemplateFromData({
      name,
      data: buildCharactersConfig(selectedNikkes),
    });
    setCreateDialogOpen(false);
    setNewListName("");
    changeCollection(`template:${id}`);
  };

  const handleRemoveFromCurrentList = async () => {
    if (!currentTemplate || !selectedCodes.size) return;
    const nextData = removeCodesFromCharacters(currentTemplate.data, selectedCodes);
    await handleUpdateTemplateData(currentTemplate.id, nextData);
    setSelectedCodes(new Set());
  };

  const selectedDetail = detailNikke
    ? ownedCharacterMap.get(normalizeCode(detailNikke?.name_code))
    : null;

  return (
    <Box sx={{ pb: multiSelectMode ? 12 : 3 }}>
      <Box sx={{ display: "flex", alignItems: { xs: "flex-start", md: "center" }, gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>{copy.title}</Typography>
          <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, color: "text.secondary", flexWrap: "wrap" }}>
            <Typography variant="body2">{copy.catalogCount.replace("{count}", String((nikkeList || []).length))}</Typography>
            <Typography variant="body2">{copy.ownedCount.replace("{count}", String(ownedCodes.size))}</Typography>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
        <TextField
          select
          size="small"
          value={currentRecommendation ? "recommendation-default" : activeCollectionId}
          onChange={(event) => changeCollection(event.target.value)}
          sx={{ minWidth: 250, flex: "0 1 310px" }}
          inputProps={{ "aria-label": copy.title }}
        >
          {currentRecommendation ? <MenuItem value="recommendation-default" disabled>{copy.defaultCollection}</MenuItem> : null}
          <MenuItem value={SYSTEM_COLLECTION_IDS.catalog}>{copy.catalog}</MenuItem>
          <MenuItem value={SYSTEM_COLLECTION_IDS.owned} disabled={!ownedCodes.size}>{copy.owned}</MenuItem>
          {templates.length ? <Divider component="li" /> : null}
          {templates.map((template) => (
            <MenuItem key={template.id} value={`template:${template.id}`}>{template.name}</MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          value={currentRecommendation ? recommendationCollectionId(currentRecommendation.id) : ""}
          onChange={(event) => {
            if (event.target.value) changeCollection(event.target.value);
          }}
          sx={{ minWidth: 220 }}
          inputProps={{ "aria-label": "推荐方案" }}
          SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="" disabled>推荐方案</MenuItem>
          {RECOMMENDATION_PRESET_GROUPS.flatMap((group) => [
            <ListSubheader
              key={`group-${group.id}`}
              disableSticky
              sx={{
                color: "text.disabled",
                fontSize: "0.75rem",
                fontWeight: 600,
                lineHeight: "28px",
                bgcolor: "background.paper",
              }}
            >
              {lang === "en" ? group.nameEn : group.name}
            </ListSubheader>,
            ...group.presetIds.map((presetId) => {
              const preset = RECOMMENDATION_PRESETS.find((entry) => entry.id === presetId);
              return preset ? (
                <MenuItem key={preset.id} value={recommendationCollectionId(preset.id)}>{preset.name}</MenuItem>
              ) : null;
            }).filter(Boolean),
          ])}
        </TextField>

        {currentTemplate ? (
          <Stack direction="row" spacing={0.25}>
            <Tooltip title={currentTemplateFixed ? "“常用”是固定列表" : t("templateRename")}><span><IconButton disabled={currentTemplateFixed} onClick={() => startRenameTemplate(currentTemplate.id)}><EditIcon fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title={t("copy")}><IconButton onClick={() => handleDuplicateTemplate(currentTemplate.id)}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title={currentTemplateFixed || currentTemplate.id === defaultTemplateId ? t("templateDefaultLocked") : t("templateDelete")}>
              <span><IconButton color="error" disabled={currentTemplateFixed || currentTemplate.id === defaultTemplateId} onClick={() => handleDeleteTemplate(currentTemplate.id)}><DeleteIcon fontSize="small" /></IconButton></span>
            </Tooltip>
          </Stack>
        ) : null}

        <TextField
          size="small"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={copy.search}
          sx={{ flex: "1 1 240px", maxWidth: 360 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />

        {["Step1", "Step2", "Step3"].map((burst, index) => {
          const active = filters.bursts.includes(burst);
          return (
            <Button
              key={burst}
              variant="outlined"
              aria-pressed={active}
              aria-label={`${copy.burst} ${index + 1}`}
              onClick={() => toggleFilterValue("bursts", burst)}
              sx={{ ...filterButtonSx(active), minWidth: 42, px: 1, fontFamily: "serif", fontWeight: 700 }}
            >
              {index === 0 ? "Ⅰ" : index === 1 ? "Ⅱ" : "Ⅲ"}
            </Button>
          );
        })}

        <Badge badgeContent={activeFilterCount} color="primary">
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={(event) => setFilterAnchorEl(event.currentTarget)}
            aria-haspopup="dialog"
            aria-expanded={Boolean(filterAnchorEl)}
            sx={{
              minWidth: 132,
              justifyContent: "flex-start",
              ...(effectiveSortMode === "default" ? {
                color: "text.secondary",
                bgcolor: "action.hover",
                borderColor: "divider",
                "&:hover": { bgcolor: "action.selected", borderColor: "divider" },
              } : {}),
            }}
          >
            {{
              combat: copy.sortCombat,
              default: copy.defaultSort,
              level: copy.sortLevel,
              limitBreak: copy.sortLimitBreak,
              rarity: copy.sortRarity,
              affection: copy.sortAffection,
            }[effectiveSortMode] || copy.sortCombat}
          </Button>
        </Badge>
        <Tooltip title={sortDirection === "desc" ? "当前：降序" : "当前：升序"}>
          <IconButton
            onClick={() => setSortDirection((current) => current === "desc" ? "asc" : "desc")}
            disabled={effectiveSortMode === "default"}
            aria-label={sortDirection === "desc" ? "切换为升序" : "切换为降序"}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
          >
            {sortDirection === "desc" ? <ArrowDownwardIcon fontSize="small" /> : <ArrowUpwardIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title={t("managementSettings")}><IconButton onClick={onOpenSettings}><SettingsOutlinedIcon /></IconButton></Tooltip>
        <Button
          variant={multiSelectMode ? "contained" : "outlined"}
          startIcon={multiSelectMode ? <CheckIcon /> : <LibraryAddCheckIcon />}
          onClick={() => {
            setMultiSelectMode((current) => !current);
            setSelectedCodes(new Set());
          }}
          disabled={!ownedCodes.size}
          sx={{ minHeight: 40, ml: "auto" }}
        >
          {multiSelectMode ? copy.finish : copy.multi}
        </Button>
      </Box>

      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={() => setFilterAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: { xs: "min(92vw, 520px)", sm: 520 }, maxHeight: "min(72vh, 680px)", p: 2, mt: 0.75 } } }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>{copy.filterTitle}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>{copy.sortTitle}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
          {[
            ...(currentRecommendation ? [["default", copy.defaultSort]] : []),
            ["combat", copy.sortCombat],
            ["level", copy.sortLevel],
            ["limitBreak", copy.sortLimitBreak],
            ["rarity", copy.sortRarity],
            ["affection", copy.sortAffection],
          ].map(([value, label]) => (
            <Button
              key={value}
              variant="outlined"
              size="small"
              aria-pressed={effectiveSortMode === value}
              onClick={() => setSortMode(value)}
              sx={value === "default"
                ? { ...filterButtonSx(false), color: "text.secondary", bgcolor: "action.hover", borderColor: "divider" }
                : filterButtonSx(effectiveSortMode === value)}
            >
              {label}
            </Button>
          ))}
        </Box>
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>{copy.filters}</Typography>
        <Stack spacing={2}>
          <FilterGroup title={copy.class} values={catalogValues.classes} selected={filters.classes} labelFor={getClassName} onToggle={(value) => toggleFilterValue("classes", value)} />
          <FilterGroup title={copy.element} values={catalogValues.elements} selected={filters.elements} labelFor={getElementName} onToggle={(value) => toggleFilterValue("elements", value)} />
          <FilterGroup title={copy.weapon} values={catalogValues.weapons} selected={filters.weapons} labelFor={(value) => value} onToggle={(value) => toggleFilterValue("weapons", value)} />
          <FilterGroup title={copy.corporation} values={catalogValues.corporations} selected={filters.corporations} labelFor={getCorporationName} onToggle={(value) => toggleFilterValue("corporations", value)} />
        </Stack>
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2.5, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
          <Button variant="text" onClick={resetFilters} disabled={!activeFilterCount}>{copy.resetFilters}</Button>
        </Box>
      </Popover>

      {multiSelectMode ? <Alert severity="info" sx={{ mb: 2 }}>{copy.selectOwnedOnly}</Alert> : null}

      {visibleNikkes.length ? (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(178px, 1fr))", gap: 1.25 }}>
          {visibleNikkes.map((nikke) => {
            const code = normalizeCode(nikke?.name_code);
            const accountCharacter = ownedCharacterMap.get(code);
            const owned = Boolean(accountCharacter);
            const selected = selectedCodes.has(code);
            const avatar = getNikkeAvatarUrl(nikke);
            return (
              <Box
                component="button"
                type="button"
                key={`${nikke?.id || code}:${code}`}
                onClick={() => handleCardClick(nikke)}
                aria-pressed={multiSelectMode ? selected : undefined}
                aria-label={`${getDisplayName(nikke)}${owned ? `，${copy.ownedState}` : ""}`}
                sx={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: "72px minmax(0, 1fr)",
                  gap: 1,
                  minHeight: 104,
                  p: 1,
                  textAlign: "left",
                  border: selected ? "2px solid" : "1px solid",
                  borderColor: selected ? "primary.main" : "divider",
                  borderRadius: 1.5,
                  bgcolor: "background.paper",
                  color: "text.primary",
                  cursor: multiSelectMode && !owned ? "not-allowed" : "pointer",
                  opacity: multiSelectMode && !owned ? 0.55 : 1,
                  boxShadow: selected ? "0 0 0 2px rgba(25, 118, 210, 0.08)" : "none",
                  transition: "border-color 140ms ease-out, background-color 140ms ease-out",
                  "&:hover": { borderColor: owned || !multiSelectMode ? "primary.light" : "divider", bgcolor: "#fbfdff" },
                  "&:focus-visible": { outline: "2px solid #1976d2", outlineOffset: 2 },
                  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
                }}
              >
                <Box sx={{ width: 72, height: 86, borderRadius: 1, bgcolor: "action.hover", overflow: "hidden" }}>
                  {avatar ? (
                    <Box
                      component="img"
                      src={avatar}
                      alt=""
                      loading="lazy"
                      width={72}
                      height={86}
                      sx={{ display: "block", width: 72, height: 86, objectFit: "cover" }}
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                  ) : null}
                </Box>
                <Box sx={{ minWidth: 0, pt: 0.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pr: 2 }} title={getDisplayName(nikke)}>{getDisplayName(nikke)}</Typography>
                  <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    <Chip size="small" label={getElementName(nikke?.element)} sx={{ height: 22, borderRadius: 1, bgcolor: "#e3f2fd", color: "#0d47a1", "& .MuiChip-label": { px: 0.75, fontSize: "0.7rem" } }} />
                    <Chip size="small" variant="outlined" label={getBurstStageName(nikke?.use_burst_skill)} sx={{ height: 22, borderRadius: 1, "& .MuiChip-label": { px: 0.75, fontSize: "0.7rem" } }} />
                  </Stack>
                  {owned && toFiniteNumber(accountCharacter?.level) !== null ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, fontVariantNumeric: "tabular-nums" }}>
                      {`Lv. ${accountCharacter.level} · ${formatLimitBreak(accountCharacter)}`}
                    </Typography>
                  ) : null}
                </Box>
                {multiSelectMode ? (
                  <Checkbox checked={selected} disabled={!owned} size="small" tabIndex={-1} sx={{ position: "absolute", top: 2, right: 2, p: 0.5 }} />
                ) : null}
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box sx={{ minHeight: 280, display: "grid", placeItems: "center", borderBlock: "1px solid", borderColor: "divider" }}>
          <Box sx={{ textAlign: "center", color: "text.secondary" }}>
            <ManageSearchIcon sx={{ fontSize: 48, mb: 1 }} />
            <Typography>{currentTemplate && !collectionNikkes.length ? copy.listEmpty : copy.noResults}</Typography>
          </Box>
        </Box>
      )}

      {!multiSelectMode && syncBlockedReason ? (
        <Alert severity="warning" sx={{ mt: 2 }}>{syncBlockedReason}</Alert>
      ) : null}

      {!multiSelectMode ? (
        <Box sx={{ position: "sticky", bottom: 0, zIndex: 5, mt: 2, px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", border: "1px solid", borderColor: "divider", bgcolor: "rgba(255,255,255,0.96)", boxShadow: "0 -4px 8px rgba(23,32,51,0.06)" }}>
          <Button variant="contained" startIcon={fetchLoading ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />} onClick={onFetchCharacterData} disabled={!nikkeList?.length || fetchLoading || downloadLoading || actionsDisabled || Boolean(syncBlockedReason)}>{copy.sync}</Button>
          <Button variant="outlined" startIcon={downloadLoading ? <CircularProgress size={18} color="inherit" /> : <DownloadOutlinedIcon />} onClick={onDownloadCharacterData} disabled={!dataReady || activeCollectionId === SYSTEM_COLLECTION_IDS.catalog || fetchLoading || downloadLoading || actionsDisabled}>{t("downloadCharacterData")}</Button>
          <Button
            variant="outlined"
            startIcon={<TuneIcon />}
            disabled={!globalOutputEnabled}
            onClick={(event) => setOutputAnchorEl(event.currentTarget)}
            aria-haspopup="dialog"
            aria-expanded={Boolean(outputAnchorEl)}
          >
            {copy.outputSettings}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ flex: "1 1 360px", maxWidth: 620, lineHeight: 1.4 }}>
            {copy.downloadScopeHint}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ ml: { md: "auto" } }}>{copy.selectedCount.replace("{count}", String(collectionNikkes.length))}</Typography>
        </Box>
      ) : (
        <Box sx={{ position: "fixed", left: { xs: 16, md: 40 }, right: { xs: 16, md: 40 }, bottom: 18, zIndex: 20, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", px: 2, py: 1.25, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", boxShadow: "0 6px 16px rgba(23,32,51,0.14)", borderRadius: 1.5 }}>
          <Typography sx={{ fontWeight: 600, mr: 1 }}>{copy.selectedCount.replace("{count}", String(selectedCodes.size))}</Typography>
          <Button variant="outlined" disabled={!selectableVisibleCodes.length} onClick={toggleSelectAll}>
            {allVisibleSelected ? copy.clearSelection : copy.selectAll}
          </Button>
          <Select size="small" value={effectiveTargetTemplateId} onChange={(event) => setTargetTemplateId(event.target.value)} displayEmpty sx={{ minWidth: 180 }}>
            <MenuItem value="" disabled>{copy.customLists}</MenuItem>
            {editableTemplates.map((template) => <MenuItem key={template.id} value={template.id}>{template.name}</MenuItem>)}
          </Select>
          <Button variant="contained" disabled={!selectedCodes.size || !effectiveTargetTemplateId} onClick={handleAddToList}>{copy.addToList}</Button>
          <Button variant="outlined" startIcon={<AddIcon />} disabled={!selectedCodes.size} onClick={() => setCreateDialogOpen(true)}>{copy.createList}</Button>
          {currentTemplate && !currentTemplateFixed ? <Button color="error" variant="outlined" disabled={!selectedCodes.size} onClick={handleRemoveFromCurrentList}>{copy.removeFromList}</Button> : null}
          <Button sx={{ ml: { md: "auto" } }} onClick={() => { setMultiSelectMode(false); setSelectedCodes(new Set()); }}>{copy.cancel}</Button>
        </Box>
      )}

      <Popover
        open={Boolean(outputAnchorEl)}
        anchorEl={outputAnchorEl}
        onClose={() => setOutputAnchorEl(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { width: { xs: "min(92vw, 560px)", sm: 560 }, maxHeight: "min(70vh, 620px)", p: 2, mb: 0.75 } } }}
      >
        <Typography variant="subtitle2">{copy.outputSettings}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>{copy.outputSettingsHint}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 1, rowGap: 0.25 }}>
          {globalStatColumns.map(({ key, label }) => {
            const state = globalStatStates[key] || { checked: false, indeterminate: false };
            return (
              <FormControlLabel
                key={key}
                sx={{ m: 0, minWidth: 0, "& .MuiFormControlLabel-label": { fontSize: "0.82rem" } }}
                control={<Checkbox size="small" checked={state.checked} indeterminate={state.indeterminate} onChange={() => updateGlobalShowStat(key, !state.checked)} />}
                label={label}
              />
            );
          })}
        </Box>
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="caption" color="text.secondary">{copy.globalOutputHint}</Typography>
      </Popover>

      <Drawer anchor="right" open={Boolean(detailNikke)} onClose={() => setDetailNikke(null)} PaperProps={{ sx: { width: { xs: "min(94vw, 440px)", sm: 440 }, p: 2.5 } }}>
        {detailNikke ? (
          <>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="h6">{copy.details}</Typography>
              <IconButton onClick={() => setDetailNikke(null)} aria-label={copy.cancel}><CloseIcon /></IconButton>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "grid", gridTemplateColumns: "112px 1fr", gap: 2 }}>
              <Box sx={{ width: 112, height: 140, borderRadius: 1.5, bgcolor: "action.hover", overflow: "hidden" }}>
                {getNikkeAvatarUrl(detailNikke) ? (
                  <Box
                    component="img"
                    src={getNikkeAvatarUrl(detailNikke)}
                    alt=""
                    width={112}
                    height={140}
                    sx={{ display: "block", width: 112, height: 140, objectFit: "cover" }}
                    onError={(event) => { event.currentTarget.style.display = "none"; }}
                  />
                ) : null}
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 600, textWrap: "balance" }}>{getDisplayName(detailNikke)}</Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                  <Chip size="small" label={getElementName(detailNikke.element)} />
                  <Chip size="small" label={getClassName(detailNikke.class)} />
                  <Chip size="small" label={getBurstStageName(detailNikke.use_burst_skill)} />
                  <Chip size="small" label={getCorporationName(detailNikke.corporation)} />
                  {detailNikke.weapon_type ? <Chip size="small" label={detailNikke.weapon_type} /> : null}
                </Stack>
                {selectedDetail ? (
                  <Stack spacing={0.25} sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary">{`Lv. ${selectedDetail.level ?? "—"} · ${formatLimitBreak(selectedDetail)}`}</Typography>
                    <Typography variant="body2" color="text.secondary">{`${copy.sortCombat} ${selectedDetail.combat ?? "—"} · ${copy.sortAffection} ${selectedDetail.affectionLevel ?? "—"}`}</Typography>
                  </Stack>
                ) : <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{copy.notOwned}</Typography>}
              </Box>
            </Box>
            {selectedDetail ? (
              <Stack spacing={1.5} sx={{ mt: 3 }}>
                {(Array.isArray(selectedDetail.equipments) ? selectedDetail.equipments : []).map((equipment, slotIndex) => (
                  <Box key={slotIndex} sx={{ p: 1.5, bgcolor: "#f6f8fb", borderRadius: 1.5 }}>
                    <Typography variant="subtitle2">{copy.equipment.replace("{slot}", String(slotIndex + 1))}</Typography>
                    {(Array.isArray(equipment) ? equipment : []).length ? (equipment.map((line, lineIndex) => (
                      <Typography key={`${line?.functionType}:${lineIndex}`} variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {STAT_TYPE_NAMES[line?.functionType] || line?.functionType || "未知词条"} · {Number(line?.value || 0).toFixed(2)}% · {Number(line?.level || 0) > 0 ? `${line.level}档` : "档位未知"}
                      </Typography>
                    ))) : <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{copy.noEquipmentLines}</Typography>}
                  </Box>
                ))}
              </Stack>
            ) : <Alert severity="info" sx={{ mt: 3 }}>{copy.noOwnedData}</Alert>}
          </>
        ) : null}
      </Drawer>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{copy.createList}</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth label={copy.listName} value={newListName} onChange={(event) => setNewListName(event.target.value)} sx={{ mt: 1 }} /></DialogContent>
        <DialogActions><Button onClick={() => setCreateDialogOpen(false)}>{copy.cancel}</Button><Button variant="contained" disabled={!newListName.trim()} onClick={handleCreateList}>{copy.createList}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(isRenaming && renameId)} onClose={() => { setIsRenaming(false); setRenameId(""); }} fullWidth maxWidth="xs">
        <DialogTitle>{t("templateRename")}</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth value={renameValue} onChange={(event) => setRenameValue(event.target.value)} sx={{ mt: 1 }} /></DialogContent>
        <DialogActions><Button onClick={() => { setIsRenaming(false); setRenameId(""); }}>{copy.cancel}</Button><Button variant="contained" onClick={confirmRename}>{t("save") || "保存"}</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default memo(CharacterGalleryTabContent);

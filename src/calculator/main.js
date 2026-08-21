// SPDX-License-Identifier: GPL-3.0-or-later
import "./calculator.css";
import { adaptCalculatorSnapshot } from "./snapshotAdapter.js";
import { createRunRecordsWorkbook } from "./exportWorkbook.js";
import {
  chooseAvailableGlobalStat,
  GLOBAL_STAT_DEFAULTS,
  GLOBAL_TARGET_PRESETS,
} from "./globalPresets.js";
import {
  CALCULATOR_RUN_RECORDS_KEY,
  listRunRecords,
  normalizeRunRecordStore,
  sortRunRecords,
  upsertRunRecord,
} from "./resultRecords.js";
import {
  listRecommendationAdvice,
  mergeRecommendationAdvice,
  RECOMMENDATION_PRESET_GROUPS,
} from "../data/recommendationPresets.js";
import {
  effectiveTargetGoal,
  forcedRetentionMask,
  includesForcedRetention,
  lockTransitionCost,
  rerollStoneCost,
  validateForcedRetention,
} from "./forcedRetention.js";
import { createPolicyStageSummary } from "./policySummary.js";
import {
  expandGlobalPlanNeighbors,
  selectDiversifiedAssignments,
  selectDiversifiedPlans,
} from "./globalPlanSearch.js";
import {
  createManualFourEquipmentCharacter,
  MANUAL_FOUR_EQUIPMENT_COLLECTION_ID,
} from "./manualEquipment.js";
import { createPolicyBranchStage } from "./policyTree.js";
import { unavailableStatsForRow } from "./statOptions.js";

"use strict";

    if (new URLSearchParams(window.location.search).get("embedded") === "1") {
      document.documentElement.classList.add("embedded");
    }

    const STAT_PROBS_BASE = {
      "优越代码伤害增加": 10,
      "攻击力增加": 10,
      "最大装弹数增加": 12,
      "暴击伤害增加": 10,
      "暴击率增加": 12,
      "防御力增加": 10,
      "命中率增加": 12,
      "蓄力速度增加": 12,
      "蓄力伤害增加": 12
    };

    const STAT_NAMES = ["空词条", ...Object.keys(STAT_PROBS_BASE)];
    const COMMON_TIERS = ["4.77%", "5.47%", "6.18%", "6.88%", "7.59%", "8.29%", "9.00%", "9.70%", "10.40%", "11.11%", "11.81%", "12.52%", "13.22%", "13.93%", "14.63%"];
    const STAT_TIER_VALUES = {
      "优越代码伤害增加": ["9.54%", "10.94%", "12.34%", "13.75%", "15.15%", "16.55%", "17.95%", "19.35%", "20.75%", "22.15%", "23.56%", "24.96%", "26.36%", "27.76%", "29.16%"],
      "蓄力伤害增加": COMMON_TIERS,
      "最大装弹数增加": ["27.84%", "31.95%", "36.06%", "40.17%", "44.28%", "48.39%", "52.50%", "56.60%", "60.71%", "64.82%", "68.93%", "73.04%", "77.15%", "81.26%", "85.37%"],
      "蓄力速度增加": ["1.98%", "2.28%", "2.57%", "2.86%", "3.16%", "3.45%", "3.75%", "4.04%", "4.33%", "4.63%", "4.92%", "5.21%", "5.51%", "5.80%", "6.09%"],
      "暴击率增加": ["2.30%", "2.64%", "2.98%", "3.32%", "3.66%", "4.00%", "4.35%", "4.69%", "5.03%", "5.37%", "5.71%", "6.05%", "6.39%", "6.73%", "7.07%"],
      "暴击伤害增加": ["6.64%", "7.62%", "8.60%", "9.58%", "10.56%", "11.54%", "12.52%", "13.50%", "14.48%", "15.46%", "16.44%", "17.42%", "18.40%", "19.38%", "20.36%"],
      "攻击力增加": COMMON_TIERS,
      "命中率增加": COMMON_TIERS,
      "防御力增加": COMMON_TIERS
    };

    const EQUIPMENT_SLOT_NAMES = ["头部装备", "身体装备", "手部装备", "足部装备"];
    const TARGET_PRESETS = {
      "superior-attack": ["优越代码伤害增加", "攻击力增加"],
      superior: ["优越代码伤害增加"],
      attack: ["攻击力增加"]
    };
    const GLOBAL_DEFAULT_CONDITIONS = [
      { stat: "优越代码伤害增加", ...GLOBAL_STAT_DEFAULTS["优越代码伤害增加"] },
      { stat: "攻击力增加", ...GLOBAL_STAT_DEFAULTS["攻击力增加"] },
      { stat: "最大装弹数增加", ...GLOBAL_STAT_DEFAULTS["最大装弹数增加"] }
    ];
    const GLOBAL_ASSIGNMENTS_PER_MASK = 12;
    const GLOBAL_PLAN_BEAM_PER_LINE_COUNT = 64;
    const GLOBAL_EXACT_PLAN_LIMIT = 10;
    const GLOBAL_EXACT_SEARCH_ROUNDS = 4;
    const GLOBAL_EXACT_SEARCH_BEAM = 3;
    const GLOBAL_EXACT_NEIGHBOR_LIMIT = 12;
    const GLOBAL_EXACT_SEARCH_PATIENCE = 2;
    const SINGLE_EQUIPMENT_COLLECTION_ID = "single-equipment";
    const DEFAULT_COLLECTION_SELECTOR_ID = "recommendation-default";
    const RECOMMENDATION_COLLECTION_PREFIX = "recommendation:";
    const manualFourEquipmentCharacter = createManualFourEquipmentCharacter(EQUIPMENT_SLOT_NAMES);

    const SLOT_PROBS = [1, 0.5, 0.3];
    const TIER_PROBS = [...Array(5).fill(12), ...Array(5).fill(7), ...Array(5).fill(1)];

    const app = document.querySelector("#app");
    const initialRows = document.querySelector("#initial-rows");
    const targetRows = document.querySelector("#target-rows");
    const calculateButton = document.querySelector("#calculate");
    const resetButton = document.querySelector("#reset");
    const message = document.querySelector("#message");
    const result = document.querySelector("#result");
    const details = document.querySelector("#details");
    const resultTab = document.querySelector("#result-tab");
    const detailsTab = document.querySelector("#details-tab");
    const resultPanel = document.querySelector("#result-panel");
    const detailsPanel = document.querySelector("#details-panel");
    const allResultsTab = document.querySelector("#all-results-tab");
    const allResultsPanel = document.querySelector("#all-results-panel");
    const savedResultsCount = document.querySelector("#saved-results-count");
    const savedResultsList = document.querySelector("#saved-results-list");
    const resultsSortSelect = document.querySelector("#results-sort");
    const downloadAllResultsButton = document.querySelector("#download-all-results");
    const progressWrap = document.querySelector("#progress-wrap");
    const progressTrack = progressWrap.querySelector("[role='progressbar']");
    const progressBar = document.querySelector("#progress-bar");
    const progressText = document.querySelector("#progress-text");
    const collectionSelect = document.querySelector("#collection-select");
    const recommendationSelect = document.querySelector("#recommendation-select");
    const characterSelect = document.querySelector("#character-select");
    const characterAdvice = document.querySelector("#character-advice");
    const characterAdviceSummary = document.querySelector("#character-advice-summary");
    const characterAdviceFields = {
      note: document.querySelector("#character-advice-note"),
      equipment: document.querySelector("#character-advice-equipment"),
      lines: document.querySelector("#character-advice-lines"),
      skills: document.querySelector("#character-advice-skills"),
      cube: document.querySelector("#character-advice-cube"),
      collectible: document.querySelector("#character-advice-collectible"),
    };
    const classicEquipmentMode = document.querySelector("#classic-equipment-mode");
    const characterEquipmentMode = document.querySelector("#character-equipment-mode");
    const setupDescription = document.querySelector("#setup-description");
    const calculationModeSelect = document.querySelector("#calculation-mode");
    const targetPresetSelect = document.querySelector("#target-preset");
    const globalTargetPresetSelect = document.querySelector("#global-target-preset");
    const classicOptimalResult = document.querySelector("#classic-optimal-result");
    const classicOptimalResultSection = document.querySelector("#classic-optimal-result-section");
    const globalTargetMode = document.querySelector("#global-target-mode");
    const globalConditionRows = document.querySelector("#global-condition-rows");
    const addGlobalConditionButton = document.querySelector("#add-global-condition");
    const globalTargetStatus = document.querySelector("#global-target-status");
    let importedCharacters = [];
    let importedCollections = [];
    let selectedCharacterAdvice = [];
    let runRecordStore = normalizeRunRecordStore(null);
    const characterExactSolutionCache = new Map();
    const DEFAULT_DETAILS = [
      "使用说明",
      "=".repeat(36),
      "• 有限状态 MDP：枚举完整概率，并在每个盘面比较锁定、洗名称和洗数值。",
      "• 实际执行一次建议后，请按新的盘面重新计算下一步。"
    ].join("\n");

    function optionsHtml(values) {
      return values.map(value => `<option value="${value}">${value}</option>`).join("");
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]);
    }

    function selectedCharacterIndex() {
      if (!characterSelect.value.startsWith("excel-character-")) return -1;
      return Number(characterSelect.value.replace("excel-character-", ""));
    }

    function selectedCharacter() {
      if (characterSelect.value === MANUAL_FOUR_EQUIPMENT_COLLECTION_ID) {
        return manualFourEquipmentCharacter;
      }
      const index = selectedCharacterIndex();
      return Number.isInteger(index) && index >= 0 ? importedCharacters[index] : null;
    }

    function selectedCharacterKey() {
      const character = selectedCharacter();
      if (!character) return "";
      return String(character.key || `character::${character.name}`);
    }

    function hideCharacterAdvice() {
      selectedCharacterAdvice = [];
      characterAdvice.open = false;
      characterAdvice.hidden = true;
      characterAdviceSummary.textContent = "";
    }

    function renderCharacterAdviceDetails() {
      const advice = mergeRecommendationAdvice(selectedCharacterAdvice);
      characterAdviceSummary.textContent = advice.lines;
      Object.entries(characterAdviceFields).forEach(([field, element]) => {
        element.textContent = String(advice[field] || "—");
      });
    }

    function updateCharacterAdvice(character) {
      const recommendations = listRecommendationAdvice(character?.nameCode, recommendationSelect.value);
      if (!recommendations.length) {
        hideCharacterAdvice();
        return;
      }

      selectedCharacterAdvice = recommendations;
      characterAdvice.open = false;
      characterAdvice.hidden = false;
      renderCharacterAdviceDetails();
    }

    function compactTargets(targets) {
      return (targets || [])
        .filter(target => target?.stat && target.stat !== "空词条")
        .map(target => ({
          stat: target.stat,
          tier: Number(target.tier || 0),
          flagged: Boolean(target.flagged),
        }));
    }

    function compactCurrentLines(lines) {
      return (lines || [])
        .filter(line => line?.stat && line.stat !== "空词条")
        .map(line => ({
          stat: line.stat,
          tier: Number(line.tier || 0),
          valueText: Number(line.tier || 0) > 0 ? statTierText(line.stat, Number(line.tier)) : "",
          locked: Boolean(line.flagged ?? line.locked),
          forceKeep: Boolean(line.forceKeep),
        }));
    }

    function recordsWithCurrentLineFallback(records) {
      const charactersByKey = new Map(importedCharacters.map(character => [String(character.key || ""), character]));
      return records.map(record => {
        const character = charactersByKey.get(String(record.characterKey || ""));
        if (!character) return record;
        return {
          ...record,
          equipmentResults: (record.equipmentResults || []).map((equipment, index) => ({
            ...equipment,
            currentLines: Array.isArray(equipment.currentLines)
              ? equipment.currentLines
              : compactCurrentLines(character.equipments?.[index]?.lines),
          })),
        };
      });
    }

    function targetText(target) {
      const tierText = target.tier > 0 ? `[${target.tier}档]` : "";
      const requiredText = target.flagged ? "（必选）" : "";
      return `${target.stat}${tierText}${requiredText}`;
    }

    function independentTargetSummary(equipments) {
      return equipments.map(equipment => {
        if (equipment.skipped) return `${equipment.label}：不跑`;
        const targets = compactTargets(equipment.targetInput);
        return `${equipment.label}：${targets.map(targetText).join("、") || "未设置目标"}`;
      }).join("；");
    }

    function globalTargetSummary(conditions) {
      return (conditions || []).map(condition => {
        const parts = [];
        if (Number(condition.minCount) > 0) parts.push(`至少 ${condition.minCount} 条`);
        if (Number(condition.minTotal) > 0) parts.push(`合计 ≥ ${Number(condition.minTotal).toFixed(2)}%`);
        return `${condition.stat}：${parts.join("，")}`;
      }).join("；");
    }

    function equipmentExpectedCost(item) {
      if (!item || item.skipped) return 0;
      return Number(item.exactSolution?.value ?? 0);
    }

    function equipmentRecommendation(item) {
      if (!item || item.skipped) return "本次已跳过";
      const expectedCost = equipmentExpectedCost(item);
      if (expectedCost <= 1e-9) return "当前盘面已经满足目标";
      return item.exactSolution?.firstActionText || "—";
    }

    function formatSavedAt(timestamp) {
      if (!timestamp) return "";
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(timestamp));
    }

    function renderRunRecords() {
      const records = sortRunRecords(listRunRecords(runRecordStore), resultsSortSelect.value);
      savedResultsCount.textContent = records.length
        ? `已保存 ${records.length} 名妮姬的最后一次结果`
        : "尚无已保存结果";
      downloadAllResultsButton.disabled = records.length === 0;

      if (!records.length) {
        savedResultsList.innerHTML = '<p class="saved-results-empty">每名妮姬成功运行后，这里会保留其最后一次目标条件和最优结果。</p>';
        return;
      }

      savedResultsList.innerHTML = records.map(record => `
        <article class="saved-result-item">
          <div class="saved-result-heading">
            <div>
              <h3 class="saved-result-name">${escapeHtml(record.characterName || "未知妮姬")}</h3>
              <div class="saved-result-meta">${record.mode === "global" ? "全局" : "独立"} · ${escapeHtml(formatSavedAt(record.savedAt))}</div>
            </div>
            <div class="saved-result-cost">约 ${Number(record.totalExpectedCost || 0).toFixed(1)} 颗石头</div>
          </div>
          <p class="saved-result-target">${escapeHtml(record.targetSummary || "未记录目标条件")}</p>
          <details>
            <summary>查看最优结果</summary>
            <pre class="saved-result-detail">${escapeHtml(record.resultText || "—")}</pre>
          </details>
        </article>
      `).join("");
    }

    function readStoredRunRecords() {
      if (globalThis.chrome?.storage?.local) {
        return new Promise(resolve => {
          chrome.storage.local.get(CALCULATOR_RUN_RECORDS_KEY, stored => {
            resolve(stored?.[CALCULATOR_RUN_RECORDS_KEY]);
          });
        });
      }
      try {
        return Promise.resolve(JSON.parse(localStorage.getItem(CALCULATOR_RUN_RECORDS_KEY) || "null"));
      } catch {
        return Promise.resolve(null);
      }
    }

    function writeStoredRunRecords(store) {
      if (globalThis.chrome?.storage?.local) {
        return new Promise(resolve => {
          chrome.storage.local.set({ [CALCULATOR_RUN_RECORDS_KEY]: store }, resolve);
        });
      }
      localStorage.setItem(CALCULATOR_RUN_RECORDS_KEY, JSON.stringify(store));
      return Promise.resolve();
    }

    async function loadRunRecords() {
      runRecordStore = normalizeRunRecordStore(await readStoredRunRecords());
      renderRunRecords();
      const character = selectedCharacter();
      if (character) restoreCharacterRunRecord(character);
    }

    async function saveRunRecord(record) {
      try {
        runRecordStore = upsertRunRecord(runRecordStore, record);
        await writeStoredRunRecords(runRecordStore);
        renderRunRecords();
      } catch (error) {
        console.error("保存妮姬测试结果失败", error);
      }
    }

    async function downloadRunRecords() {
      const records = sortRunRecords(listRunRecords(runRecordStore), resultsSortSelect.value);
      if (!records.length) return;

      const workbook = createRunRecordsWorkbook(recordsWithCurrentLineFallback(records), formatSavedAt);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `NIKKE洗词条测试汇总_${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function clearGlobalPlanOutputs() {
      characterEquipmentMode.querySelectorAll(".global-assignment-output").forEach(output => {
        output.textContent = "运行全局测试后显示。";
      });
      characterEquipmentMode.querySelectorAll(".equipment-optimal-result").forEach(output => {
        setInlineOptimalResult(output, "运行算法测试后显示。", true);
      });
      if (calculationModeSelect.value === "global") {
        globalTargetStatus.textContent = "全局条件已更改，请重新运行算法测试。";
        setResult("设置全局目标后，点击“运行算法测试”。", true);
      }
    }

    function selectedGlobalStats(excludeRow = null) {
      return [...globalConditionRows.querySelectorAll(".global-condition-row")]
        .filter(row => row !== excludeRow)
        .map(row => row.querySelector(".global-stat-select")?.value)
        .filter(Boolean);
    }

    function syncGlobalStatOptions() {
      globalConditionRows.querySelectorAll(".global-condition-row").forEach(row => {
        const statSelect = row.querySelector(".global-stat-select");
        const usedByOtherRows = new Set(selectedGlobalStats(row));
        [...statSelect.options].forEach(option => {
          option.disabled = usedByOtherRows.has(option.value);
        });
      });
    }

    function addGlobalCondition(condition = {}) {
      if (globalConditionRows.children.length >= 6) {
        globalTargetStatus.textContent = "测试版暂时最多支持 6 个全局条件。";
        return;
      }
      const availableStats = STAT_NAMES.slice(1);
      const initialStat = chooseAvailableGlobalStat(
        availableStats,
        selectedGlobalStats(),
        condition.stat || STAT_NAMES[1]
      );
      if (!initialStat) {
        globalTargetStatus.textContent = "所有词条都已添加，不能继续添加重复条件。";
        return;
      }
      const defaults = GLOBAL_STAT_DEFAULTS[initialStat] || { minCount: 1, minTotal: 0 };
      const row = document.createElement("div");
      row.className = "global-condition-row";
      row.innerHTML = `
        <select class="global-stat-select" aria-label="全局目标词条">
          ${optionsHtml(STAT_NAMES.slice(1))}
        </select>
        <input class="global-min-count" type="number" inputmode="numeric" min="0" max="4" step="1" aria-label="至少条数" value="${Number(condition.minCount ?? defaults.minCount)}">
        <input class="global-min-total" type="number" inputmode="decimal" min="0" step="0.01" aria-label="合计数值至少" value="${Number(condition.minTotal ?? defaults.minTotal)}">
        <button class="button button-secondary global-remove-condition" type="button" aria-label="删除全局条件">×</button>
      `;
      const statSelect = row.querySelector(".global-stat-select");
      const minCountInput = row.querySelector(".global-min-count");
      const minTotalInput = row.querySelector(".global-min-total");
      statSelect.value = initialStat;
      statSelect.addEventListener("change", () => {
        const nextDefaults = GLOBAL_STAT_DEFAULTS[statSelect.value] || { minCount: 1, minTotal: 0 };
        minCountInput.value = String(nextDefaults.minCount);
        minTotalInput.value = String(nextDefaults.minTotal);
        syncGlobalStatOptions();
        globalTargetPresetSelect.value = "";
        clearGlobalPlanOutputs();
      });
      row.querySelectorAll("input").forEach(control => {
        control.addEventListener("change", () => {
          globalTargetPresetSelect.value = "";
          clearGlobalPlanOutputs();
        });
      });
      row.querySelector(".global-remove-condition").addEventListener("click", () => {
        row.remove();
        if (!globalConditionRows.children.length) addGlobalCondition();
        syncGlobalStatOptions();
        globalTargetPresetSelect.value = "";
        clearGlobalPlanOutputs();
      });
      globalConditionRows.append(row);
      syncGlobalStatOptions();
    }

    function resetGlobalConditions() {
      globalConditionRows.replaceChildren();
      GLOBAL_DEFAULT_CONDITIONS.forEach(condition => addGlobalCondition(condition));
      globalTargetPresetSelect.value = "";
      globalTargetStatus.textContent = "全局模式会自动分配四件装备的目标和档位。";
    }

    function applyGlobalTargetPreset(presetName) {
      const conditions = GLOBAL_TARGET_PRESETS[presetName];
      if (!conditions) return;
      globalConditionRows.replaceChildren();
      conditions.forEach(condition => addGlobalCondition(condition));
      globalTargetPresetSelect.value = presetName;
      clearGlobalPlanOutputs();
      globalTargetStatus.textContent = "已应用全局目标预设，请运行算法测试。";
      showMessage("");
    }

    function setCalculationMode(mode) {
      const useGlobalMode = mode === "global" && characterSelect.value !== "current";
      calculationModeSelect.value = useGlobalMode ? "global" : "equipment";
      globalTargetMode.hidden = !useGlobalMode;
      targetPresetSelect.hidden = useGlobalMode || characterSelect.value === "current";
      globalTargetPresetSelect.hidden = !useGlobalMode || characterSelect.value === "current";
      characterEquipmentMode.querySelectorAll(".fixed-target-block").forEach(block => {
        block.hidden = useGlobalMode;
      });
      characterEquipmentMode.querySelectorAll(".global-assignment-block").forEach(block => {
        block.hidden = !useGlobalMode;
      });

      if (useGlobalMode) {
        setupDescription.textContent = "设置跨四件装备的最低条数、合计数值和总目标词条数。";
        clearGlobalPlanOutputs();
      } else {
        setupDescription.textContent = "词条不可重复；选择词条后，档位默认设为第 10 档。";
        if (characterSelect.value !== "current") {
          setResult("设置四件装备的目标词条后，点击“运行算法测试”。可勾选“不跑”跳过单件装备。", true);
        }
      }
      showMessage("");
    }

    function findTierForPercent(statName, percent) {
      const values = STAT_TIER_VALUES[statName] || [];
      if (!values.length || !Number.isFinite(percent)) return 0;
      let closestTier = 0;
      let closestDifference = Infinity;
      values.forEach((value, index) => {
        const difference = Math.abs(Number.parseFloat(value) - percent);
        if (difference < closestDifference) {
          closestDifference = difference;
          closestTier = index + 1;
        }
      });
      return closestDifference <= 0.06 ? closestTier : 0;
    }

    function collectionCharacterIndexes() {
      const activeCollectionId = recommendationSelect.value || collectionSelect.value;
      if (activeCollectionId === SINGLE_EQUIPMENT_COLLECTION_ID) return [];
      const collection = importedCollections.find(item => item.id === activeCollectionId);
      if (!collection) return [];
      if (collection.allCharacters) return importedCharacters.map((_, index) => index);
      if (String(collection.id || "").startsWith("recommendation:")) {
        const indexByCode = new Map(importedCharacters.map((character, index) => [
          String(character.nameCode || ""),
          index,
        ]));
        return (collection.characterCodes || []).flatMap(code => {
          const index = indexByCode.get(String(code || ""));
          return Number.isInteger(index) ? [index] : [];
        });
      }
      const allowedCodes = new Set(collection.characterCodes || []);
      if (!allowedCodes.size) return [];
      return importedCharacters.flatMap((character, index) => (
        allowedCodes.has(String(character.nameCode || "")) ? [index] : []
      ));
    }

    function refreshCharacterSelect() {
      const fragment = document.createDocumentFragment();
      if (!recommendationSelect.value && collectionSelect.value === MANUAL_FOUR_EQUIPMENT_COLLECTION_ID) {
        const manualOption = document.createElement("option");
        manualOption.value = MANUAL_FOUR_EQUIPMENT_COLLECTION_ID;
        manualOption.textContent = "四装备全局模拟";
        fragment.append(manualOption);
        characterSelect.replaceChildren(fragment);
        characterSelect.value = MANUAL_FOUR_EQUIPMENT_COLLECTION_ID;
        characterSelect.hidden = true;
        showCharacterEquipmentMode(manualFourEquipmentCharacter);
        return;
      }
      if (!recommendationSelect.value && collectionSelect.value === SINGLE_EQUIPMENT_COLLECTION_ID) {
        const classicOption = document.createElement("option");
        classicOption.value = "current";
        classicOption.textContent = "单装备模拟";
        fragment.append(classicOption);
        characterSelect.replaceChildren(fragment);
        characterSelect.value = "current";
        characterSelect.hidden = true;
        showClassicEquipmentMode();
        return;
      }

      characterSelect.hidden = false;
      const characterIndexes = collectionCharacterIndexes();
      characterIndexes.forEach((index) => {
        const character = importedCharacters[index];
        const option = document.createElement("option");
        option.value = `excel-character-${index}`;
        option.textContent = character.name;
        option.dataset.column = String(character.column);
        fragment.append(option);
      });

      characterSelect.replaceChildren(fragment);
      if (characterIndexes.length) {
        characterSelect.value = `excel-character-${characterIndexes[0]}`;
        showCharacterEquipmentMode(importedCharacters[characterIndexes[0]]);
      } else {
        const emptyOption = document.createElement("option");
        emptyOption.value = "current";
        emptyOption.textContent = "当前列表暂无可计算妮姬";
        fragment.append(emptyOption);
        characterSelect.replaceChildren(fragment);
        characterSelect.value = "current";
        showClassicEquipmentMode();
      }
    }

    function populateCharacterSelect(characters, snapshot) {
      importedCharacters = characters;
      const snapshotCollections = Array.isArray(snapshot?.collections)
        ? snapshot.collections.filter(item => item?.id && Array.isArray(item.characterCodes))
        : [];
      importedCollections = snapshotCollections.length
        ? snapshotCollections
        : [{
            id: "owned",
            name: "已获得",
            characterCodes: characters.map(character => String(character.nameCode || "")).filter(Boolean),
            allCharacters: true,
          }];

      const collectionFragment = document.createDocumentFragment();
      const singleEquipmentOption = document.createElement("option");
      singleEquipmentOption.value = SINGLE_EQUIPMENT_COLLECTION_ID;
      singleEquipmentOption.textContent = "单装备模拟";
      collectionFragment.append(singleEquipmentOption);
      const manualFourEquipmentOption = document.createElement("option");
      manualFourEquipmentOption.value = MANUAL_FOUR_EQUIPMENT_COLLECTION_ID;
      manualFourEquipmentOption.textContent = "四装备全局模拟";
      collectionFragment.append(manualFourEquipmentOption);
      const defaultOption = document.createElement("option");
      defaultOption.value = DEFAULT_COLLECTION_SELECTOR_ID;
      defaultOption.textContent = "默认";
      defaultOption.disabled = true;
      defaultOption.hidden = true;
      collectionFragment.append(defaultOption);
      const recommendationCollections = importedCollections.filter((collection) =>
        String(collection.id).startsWith(RECOMMENDATION_COLLECTION_PREFIX));
      const regularCollections = importedCollections.filter((collection) =>
        !String(collection.id).startsWith(RECOMMENDATION_COLLECTION_PREFIX));
      regularCollections.forEach((collection) => {
        const option = document.createElement("option");
        option.value = collection.id;
        option.textContent = collection.name || "未命名列表";
        collectionFragment.append(option);
      });
      collectionSelect.replaceChildren(collectionFragment);

      const recommendationFragment = document.createDocumentFragment();
      const recommendationPlaceholder = document.createElement("option");
      recommendationPlaceholder.value = "";
      recommendationPlaceholder.textContent = "推荐方案";
      recommendationPlaceholder.disabled = true;
      recommendationFragment.append(recommendationPlaceholder);
      const recommendationCollectionById = new Map(
        recommendationCollections.map((collection) => [collection.id, collection]),
      );
      RECOMMENDATION_PRESET_GROUPS.forEach((group) => {
        const groupedCollections = group.presetIds
          .map((presetId) => recommendationCollectionById.get(`${RECOMMENDATION_COLLECTION_PREFIX}${presetId}`))
          .filter(Boolean);
        if (!groupedCollections.length) return;
        const optionGroup = document.createElement("optgroup");
        optionGroup.label = group.name;
        groupedCollections.forEach((collection) => {
          const option = document.createElement("option");
          option.value = collection.id;
          option.textContent = collection.name || "未命名推荐方案";
          optionGroup.append(option);
        });
        recommendationFragment.append(optionGroup);
      });
      recommendationSelect.replaceChildren(recommendationFragment);
      recommendationSelect.disabled = !recommendationCollections.length;

      const defaultCollectionId = String(snapshot?.defaultCollectionId || "");
      if (recommendationCollections.some((collection) => collection.id === defaultCollectionId)) {
        recommendationSelect.value = defaultCollectionId;
        collectionSelect.value = DEFAULT_COLLECTION_SELECTOR_ID;
      } else {
        recommendationSelect.value = "";
        collectionSelect.value = regularCollections.some((collection) => collection.id === defaultCollectionId)
          ? defaultCollectionId
          : (regularCollections[0]?.id || SINGLE_EQUIPMENT_COLLECTION_ID);
      }
      refreshCharacterSelect();
    }

    function calculatorSnapshotToCharacters(snapshot) {
      return adaptCalculatorSnapshot(snapshot, {
        equipmentSlotNames: EQUIPMENT_SLOT_NAMES,
        findTierForPercent,
      });
    }

    function applyCalculatorSnapshot(snapshot) {
      const characters = calculatorSnapshotToCharacters(snapshot);
      if (!characters.length) return false;
      populateCharacterSelect(characters, snapshot);
      return true;
    }

    function loadCalculatorSnapshot() {
      if (!globalThis.chrome?.storage?.local) return;
      chrome.storage.local.get("calculatorData", result => {
        applyCalculatorSnapshot(result.calculatorData);
      });
    }

    function fillRows(container, lines) {
      const rows = [...container.querySelectorAll(".form-row")];
      rows.forEach((row, index) => {
        const line = lines[index];
        const statSelect = row.querySelector(".stat-select");
        const tierSelect = row.querySelector(".tier-select");
        const flagInput = row.querySelector(".flag-input");
        const forceKeepButton = row.querySelector(".force-retain-toggle");

        statSelect.value = line?.stat && STAT_NAMES.includes(line.stat) ? line.stat : "空词条";
        updateTierOptions(statSelect, tierSelect);
        if (line?.tier && tierSelect.querySelector(`option[value="${line.tier}"]`)) {
          tierSelect.value = String(line.tier);
        }
        flagInput.checked = Boolean(line?.locked);
        if (forceKeepButton) {
          setForceRetention(forceKeepButton, Boolean(line?.forceKeep));
          syncForceRetentionAvailability(row);
        }
      });
      syncEquipmentStatOptions(container);
    }

    function characterExactSolutionCacheKey(characterKey, mode, equipmentIndex) {
      return `${characterKey}::${mode}::${equipmentIndex}`;
    }

    function cacheCharacterExactSolutions(characterKey, mode, equipmentResults) {
      const prefix = `${characterKey}::`;
      [...characterExactSolutionCache.keys()].forEach(key => {
        if (key.startsWith(prefix)) characterExactSolutionCache.delete(key);
      });
      (equipmentResults || []).forEach((item, fallbackIndex) => {
        if (item?.skipped || !item?.exactSolution) return;
        const equipmentIndex = Number(item.index ?? fallbackIndex);
        characterExactSolutionCache.set(
          characterExactSolutionCacheKey(characterKey, mode, equipmentIndex),
          item.exactSolution,
        );
      });
    }

    function cachedCharacterExactSolution(characterKey, mode, equipmentIndex) {
      return characterExactSolutionCache.get(
        characterExactSolutionCacheKey(characterKey, mode, equipmentIndex),
      );
    }

    function restoreCharacterRunRecord(character) {
      const characterKey = String(character?.key || `character::${character?.name || ""}`);
      const record = runRecordStore.entries[characterKey];
      if (!record) return false;

      targetPresetSelect.value = "";
      setCalculationMode(record.mode === "global" ? "global" : "equipment");

      const resultByIndex = new Map(
        (record.equipmentResults || []).map(item => [Number(item.index), item]),
      );
      const equipmentConfigs = record.targetConfig?.equipments || [];
      equipmentConfigs.forEach((config, index) => {
        const section = characterEquipmentMode.querySelector(`[data-equipment-index="${index}"]`);
        if (!section) return;
        const skipInput = section.querySelector(".equipment-skip-input");
        skipInput.checked = Boolean(config.skipped);
        setEquipmentSkipped(section, skipInput.checked);
        if (record.mode !== "global") {
          fillRows(section.querySelector(".equipment-target-rows"), config.targets || []);
        }

        const savedEquipment = resultByIndex.get(index);
        const cachedSolution = cachedCharacterExactSolution(characterKey, record.mode, index);
        const output = section.querySelector(".equipment-optimal-result");
        if (cachedSolution && !skipInput.checked) {
          renderInlineOptimalResult(output, cachedSolution);
        } else {
          setInlineOptimalResult(
            output,
            savedEquipment?.optimalText || (skipInput.checked ? "本次已跳过。" : "运行算法测试后显示。"),
            !savedEquipment,
          );
        }
        if (record.mode === "global") {
          section.querySelector(".global-assignment-output").textContent = skipInput.checked
            ? "本次已跳过。"
            : globalAssignmentText(savedEquipment?.targets || []);
        }
      });

      if (record.mode === "global") {
        globalConditionRows.replaceChildren();
        (record.targetConfig?.conditions || GLOBAL_DEFAULT_CONDITIONS)
          .forEach(condition => addGlobalCondition(condition));
        globalTargetStatus.textContent = "已恢复该妮姬最后一次成功运行的全局条件与最优结果。";
      }

      setResult(record.resultText || "已恢复最后一次测试结果。", false);
      setDetails(record.detailsText || DEFAULT_DETAILS);
      activateOutputTab("result");
      return true;
    }

    function renderCharacterEquipment(character) {
      characterEquipmentMode.innerHTML = character.equipments.map((equipment, index) => `
        <section class="character-equipment-slot" data-equipment-index="${index}">
          <div class="equipment-slot-heading">
            <h3>${escapeHtml(equipment.label)}</h3>
            <label class="equipment-skip-label">
              <input class="equipment-skip-input" type="checkbox">
              不跑
            </label>
          </div>
          <div class="equipment-editor-block">
            <h4 class="equipment-block-title">当前词条</h4>
            <div class="rows equipment-current-rows"></div>
          </div>
          <div class="equipment-editor-block fixed-target-block">
            <h4 class="equipment-block-title">目标词条池</h4>
            <div class="rows equipment-target-rows"></div>
          </div>
          <div class="equipment-editor-block global-assignment-block" hidden>
            <h4 class="equipment-block-title">算法分配目标</h4>
            <pre class="global-assignment-output">运行全局测试后显示。</pre>
          </div>
          <div class="equipment-editor-block equipment-result-block">
            <h4 class="equipment-block-title">最优结果</h4>
            <div class="inline-optimal-result empty-result equipment-optimal-result" aria-live="polite">运行算法测试后显示。</div>
          </div>
        </section>
      `).join("");

      character.equipments.forEach((equipment, index) => {
        const section = characterEquipmentMode.querySelector(`[data-equipment-index="${index}"]`);
        const currentRows = section.querySelector(".equipment-current-rows");
        const equipmentTargetRows = section.querySelector(".equipment-target-rows");
        createRows(currentRows, 3, "initial");
        createRows(equipmentTargetRows, 5, "target");
        fillRows(currentRows, equipment.lines);
        const skipInput = section.querySelector(".equipment-skip-input");
        skipInput.addEventListener("change", () => {
          setEquipmentSkipped(section, skipInput.checked);
          setInlineOptimalResult(
            section.querySelector(".equipment-optimal-result"),
            skipInput.checked ? "本次已跳过。" : "运行算法测试后显示。",
            true
          );
          if (calculationModeSelect.value === "global") clearGlobalPlanOutputs();
        });
      });
    }

    function setInlineOptimalResult(element, text, isEmpty = false) {
      if (!element) return;
      element.textContent = text;
      element.classList.toggle("empty-result", isEmpty);
    }

    function exactBranchStateText(state, model) {
      if (!state?.slots) return "盘面状态不可用";
      return state.slots.map((slot, index) => {
        let name = slot.statName || "非目标词条";
        if (isTargetCode(slot.code)) {
          name = model.targets[targetIndexFromCode(slot.code)]?.name || "目标词条";
          name += slot.ok ? "（达标）" : "（未达标）";
        }
        const locked = slot.locked ? " · 已锁" : "";
        return `词条${index + 1}：${name}${locked}`;
      }).join("；");
    }

    function policyTreeStageElement(exactSolution, stateIndex, depth, ancestorIndexes) {
      const policyData = exactSolution.policyData;
      const stage = createPolicyBranchStage({
        records: policyData.records,
        policy: policyData.policy,
        values: policyData.values,
        startIndex: stateIndex,
        describeAction: exactActionDescription,
      });
      const wrap = document.createElement("div");
      wrap.className = "policy-stage";
      if (!stage) {
        wrap.textContent = "该分支暂时无法展开。";
        return wrap;
      }
      if (stage.terminal) {
        wrap.classList.add("policy-stage-complete");
        wrap.textContent = "目标已经完成，无需继续操作。";
        return wrap;
      }

      const heading = document.createElement("div");
      heading.className = "policy-stage-heading";
      heading.innerHTML = `<strong>本阶段：${compactStageActionText(stage.actionText)}</strong><span>本阶段约 ${stage.stageExpectedCost.toFixed(1)} 颗 · 从此处完成约 ${stage.totalExpectedCost.toFixed(1)} 颗</span>`;
      wrap.append(heading);

      const note = document.createElement("p");
      note.className = "policy-stage-note";
      note.textContent = "以下概率表示反复执行本阶段操作后，最终进入各分支的概率。";
      wrap.append(note);

      const list = document.createElement("div");
      list.className = "policy-branch-list";
      stage.branches.forEach(branch => {
        const details = document.createElement("details");
        details.className = `policy-branch${branch.terminal ? " policy-branch-complete" : ""}`;
        const summary = document.createElement("summary");
        const probability = `${(branch.probability * 100).toFixed(branch.probability < 0.01 ? 2 : 1)}%`;
        const stateText = exactBranchStateText(branch.state, exactSolution.model);
        summary.innerHTML = `<span class="policy-branch-probability">${probability}</span><span class="policy-branch-copy"><strong>${branch.terminal ? "目标完成" : compactStageActionText(branch.nextActionText)}</strong><span>${stateText}</span><small>${branch.terminal ? "无需继续消耗" : `从该分支完成约 ${branch.remainingExpectedCost.toFixed(1)} 颗石头`}</small></span>`;
        details.append(summary);

        if (!branch.terminal) {
          details.addEventListener("toggle", () => {
            if (!details.open || details.dataset.loaded === "true") return;
            details.dataset.loaded = "true";
            if (depth >= 10 || ancestorIndexes.has(branch.stateIndex)) {
              const cycle = document.createElement("p");
              cycle.className = "policy-stage-note";
              cycle.textContent = "该分支会回到已显示的策略状态，请继续按上方相同操作执行。";
              details.append(cycle);
              return;
            }
            const nextAncestors = new Set(ancestorIndexes);
            nextAncestors.add(branch.stateIndex);
            details.append(policyTreeStageElement(exactSolution, branch.stateIndex, depth + 1, nextAncestors));
          });
        }
        list.append(details);
      });
      wrap.append(list);
      return wrap;
    }

    function renderInlineOptimalResult(element, exactSolution) {
      if (!element) return;
      const expectedCost = exactSolution?.value ?? 0;
      if (!exactSolution?.policyData || expectedCost <= 1e-9) {
        setInlineOptimalResult(element, inlineOptimalResultText({ exactSolution }));
        return;
      }
      element.replaceChildren();
      element.classList.remove("empty-result");

      const text = document.createElement("div");
      text.className = "inline-optimal-result-text";
      text.textContent = inlineOptimalResultText({ exactSolution });
      element.append(text);

      const tree = document.createElement("details");
      tree.className = "policy-tree";
      const treeSummary = document.createElement("summary");
      treeSummary.textContent = "查看完整决策树";
      tree.append(treeSummary);
      tree.addEventListener("toggle", () => {
        if (!tree.open || tree.dataset.loaded === "true") return;
        tree.dataset.loaded = "true";
        tree.append(policyTreeStageElement(
          exactSolution,
          exactSolution.policyData.startIndex,
          0,
          new Set([exactSolution.policyData.startIndex]),
        ));
      });
      element.append(tree);
    }

    function compactStageActionText(text) {
      return text
        .replace(/(\d+)号位/g, "词条$1")
        .replace(/锁定\s+/g, "锁定")
        .replace(/强制保留\s+/g, "强制保留")
        .replace("洗词条名称", "洗名称");
    }

    function inlineOptimalResultText({ exactSolution }) {
      const expectedCost = exactSolution?.value ?? 0;
      if (expectedCost <= 1e-9) return "当前盘面已经满足目标，无需消耗石头。";
      const stages = exactSolution.policyStagePreview?.stages || [];
      if (!stages.length) return `预计从当前盘面达标：约 ${expectedCost.toFixed(1)} 颗石头\n第一步：${exactSolution.firstActionText}`;
      const numerals = ["一", "二", "三", "四", "五", "六", "七", "八"];
      const lines = [];
      stages.forEach((stage, index) => {
        const operation = compactStageActionText(stage.actionText);
        const milestone = stage.milestoneText || "";
        const conditional = index > 0 && stages[index - 1].continuationProbability < 1 - 1e-9
          ? stage.conditionText || "若上一步尚未完成全部目标，"
          : "";
        lines.push(
          `${numerals[index] || index + 1}、${conditional}${operation}${milestone}`,
          `   约 ${stage.stageExpectedCost.toFixed(1)} 颗石头（总计约 ${stage.totalExpectedCost.toFixed(1)} 颗石头）`,
        );
        if (index < stages.length - 1) lines.push("");
      });
      if (exactSolution.policyStagePreview?.branched) {
        lines.push("后续存在多种最优操作分支，均已计入上述期望耗石。");
      }
      return lines.join("\n");
    }

    function clearScopedOptimalResult(control) {
      const section = control.closest(".character-equipment-slot");
      if (section) {
        const skipped = section.querySelector(".equipment-skip-input")?.checked;
        setInlineOptimalResult(
          section.querySelector(".equipment-optimal-result"),
          skipped ? "本次已跳过。" : "运行算法测试后显示。",
          true
        );
        if (calculationModeSelect.value === "global") {
          section.querySelector(".global-assignment-output").textContent = "运行全局测试后显示。";
          globalTargetStatus.textContent = "当前盘面已更改，请重新运行算法测试。";
        }
        return;
      }
      setInlineOptimalResult(classicOptimalResult, "运行算法测试后显示。", true);
    }

    function applyTargetPreset(presetName) {
      const stats = TARGET_PRESETS[presetName];
      if (!stats) return;

      characterEquipmentMode.querySelectorAll(".character-equipment-slot").forEach(section => {
        const equipmentTargetRows = section.querySelector(".equipment-target-rows");
        fillRows(equipmentTargetRows, stats.map(stat => ({ stat, tier: 10, locked: true })));
        const skipInput = section.querySelector(".equipment-skip-input");
        setEquipmentSkipped(section, skipInput.checked);
        clearScopedOptimalResult(section);
      });
      showMessage("");
    }

    function setEquipmentSkipped(section, skipped) {
      section.classList.toggle("is-skipped", skipped);
      section.querySelectorAll(".form-row select, .form-row input, .form-row button").forEach(control => {
        if (skipped) {
          control.disabled = true;
          return;
        }
        if (control.classList.contains("tier-select")) {
          const statSelect = control.closest(".form-row").querySelector(".stat-select");
          control.disabled = statSelect.value === "空词条";
        } else {
          control.disabled = false;
        }
      });
    }

    function showClassicEquipmentMode() {
      hideCharacterAdvice();
      document.body.classList.remove("character-layout-active");
      app.classList.remove("character-layout");
      classicEquipmentMode.hidden = false;
      classicOptimalResultSection.hidden = false;
      allResultsTab.hidden = true;
      if (allResultsTab.getAttribute("aria-selected") === "true") activateOutputTab("result");
      characterEquipmentMode.hidden = true;
      characterEquipmentMode.replaceChildren();
      calculationModeSelect.hidden = true;
      targetPresetSelect.hidden = true;
      targetPresetSelect.value = "";
      globalTargetPresetSelect.hidden = true;
      globalTargetPresetSelect.value = "";
      globalTargetMode.hidden = true;
      setCalculationMode("equipment");
      calculateButton.disabled = false;
      showMessage("");
    }

    function showCharacterEquipmentMode(character) {
      updateCharacterAdvice(character);
      renderCharacterEquipment(character);
      document.body.classList.add("character-layout-active");
      app.classList.add("character-layout");
      classicEquipmentMode.hidden = true;
      classicOptimalResultSection.hidden = true;
      allResultsTab.hidden = false;
      characterEquipmentMode.hidden = false;
      calculationModeSelect.hidden = false;
      targetPresetSelect.value = "";
      globalTargetPresetSelect.value = "";
      setCalculationMode("global");
      calculateButton.disabled = false;
      showMessage("");
      if (character.transient || !restoreCharacterRunRecord(character)) {
        setResult("设置四件装备的目标词条后，点击“运行算法测试”。可勾选“不跑”跳过单件装备。", true);
        setDetails(DEFAULT_DETAILS);
      }
    }

    function createRows(container, count, type) {
      const isInitial = type === "initial";
      container.innerHTML = Array.from({ length: count }, (_, index) => `
        <div class="form-row" data-row="${index}">
          ${isInitial
            ? `<button class="row-number force-retain-toggle" type="button" aria-pressed="false" aria-label="强制保留第 ${index + 1} 个当前词条" title="点击后，算法会锁定并保留此词条">${index + 1}</button>`
            : `<span class="row-number" aria-hidden="true">${index + 1}</span>`}
          <select class="stat-select" aria-label="${isInitial ? "当前" : "目标"}第 ${index + 1} 个词条">
            ${optionsHtml(STAT_NAMES)}
          </select>
          <select class="tier-select" aria-label="${isInitial ? "当前" : "目标"}第 ${index + 1} 个档位" disabled>
            <option value="0">空</option>
          </select>
          <label class="check-label">
            <input class="flag-input" type="checkbox">
            ${isInitial ? "已锁" : "必选"}
          </label>
        </div>
      `).join("");

      container.querySelectorAll(".form-row").forEach(row => {
        const statSelect = row.querySelector(".stat-select");
        const tierSelect = row.querySelector(".tier-select");
        statSelect.addEventListener("change", () => {
          updateTierOptions(statSelect, tierSelect);
          if (isInitial) syncForceRetentionAvailability(row);
          syncEquipmentStatOptions(container);
          clearScopedOptimalResult(statSelect);
        });
        tierSelect.addEventListener("change", () => clearScopedOptimalResult(tierSelect));
      });

      if (!isInitial) {
        container.querySelectorAll(".flag-input").forEach(checkbox => {
          checkbox.addEventListener("change", () => {
            enforceMandatoryLimit(checkbox);
            clearScopedOptimalResult(checkbox);
          });
        });
      } else {
        container.querySelectorAll(".flag-input").forEach(checkbox => {
          checkbox.addEventListener("change", () => clearScopedOptimalResult(checkbox));
        });
        container.querySelectorAll(".force-retain-toggle").forEach(button => {
          button.addEventListener("click", () => {
            setForceRetention(button, button.getAttribute("aria-pressed") !== "true");
            clearScopedOptimalResult(button);
          });
        });
      }
      syncEquipmentStatOptions(container);
    }

    function syncEquipmentStatOptions(container) {
      if (!container) return;
      const rows = [...container.querySelectorAll(".form-row")];
      const selectedStats = rows.map(row => row.querySelector(".stat-select")?.value || "空词条");
      rows.forEach((row, rowIndex) => {
        const statSelect = row.querySelector(".stat-select");
        const unavailableStats = unavailableStatsForRow(selectedStats, rowIndex);
        [...statSelect.options].forEach(option => {
          option.disabled = option.value !== "空词条" && unavailableStats.has(option.value);
        });
      });
    }

    function setForceRetention(button, forceKeep) {
      if (!button) return;
      button.setAttribute("aria-pressed", String(Boolean(forceKeep)));
      button.title = forceKeep
        ? "已强制保留；再次点击取消"
        : "点击后，算法会锁定并保留此词条";
    }

    function syncForceRetentionAvailability(row) {
      const button = row.querySelector(".force-retain-toggle");
      if (!button) return;
      const isEmpty = row.querySelector(".stat-select")?.value === "空词条";
      button.disabled = isEmpty;
      if (isEmpty) setForceRetention(button, false);
    }

    function updateTierOptions(statSelect, tierSelect) {
      const values = STAT_TIER_VALUES[statSelect.value];
      if (!values) {
        tierSelect.innerHTML = '<option value="0">空</option>';
        tierSelect.disabled = true;
        return;
      }

      tierSelect.innerHTML = values.map((value, index) =>
        `<option value="${index + 1}">[${index + 1}档] ${value}</option>`
      ).join("");
      tierSelect.disabled = false;
      tierSelect.value = "10";
    }

    function enforceMandatoryLimit(changedCheckbox) {
      const rowsContainer = changedCheckbox.closest(".rows") || targetRows;
      const checked = [...rowsContainer.querySelectorAll(".flag-input:checked")];
      if (checked.length > 3) {
        changedCheckbox.checked = false;
        showMessage("必选词条不能超过 3 个。", true);
      } else {
        showMessage("");
      }
    }

    function showMessage(text, isError = false) {
      message.textContent = text;
      message.style.color = isError ? "var(--error)" : "var(--muted)";
    }

    function setResult(text, isEmpty = false) {
      result.textContent = text;
      result.classList.toggle("empty-result", isEmpty);
    }

    function setDetails(text) {
      details.textContent = text;
    }

    function activateOutputTab(tabName, focus = false) {
      const tabs = [
        { name: "result", tab: resultTab, panel: resultPanel },
        { name: "details", tab: detailsTab, panel: detailsPanel },
        { name: "all", tab: allResultsTab, panel: allResultsPanel },
      ];
      const availableTabs = tabs.filter(item => !item.tab.hidden);
      const active = availableTabs.find(item => item.name === tabName) || availableTabs[0] || tabs[0];
      tabs.forEach(item => {
        const selected = item === active;
        item.tab.setAttribute("aria-selected", String(selected));
        item.tab.tabIndex = selected ? 0 : -1;
        item.panel.hidden = !selected;
      });
      if (focus) active.tab.focus();
    }

    function resetAll() {
      [...document.querySelectorAll(".form-row")].forEach(row => {
        row.querySelector(".stat-select").value = "空词条";
        const tier = row.querySelector(".tier-select");
        tier.innerHTML = '<option value="0">空</option>';
        tier.disabled = true;
        row.querySelector(".flag-input").checked = false;
        setForceRetention(row.querySelector(".force-retain-toggle"), false);
        syncForceRetentionAvailability(row);
      });
      document.querySelectorAll(".rows").forEach(syncEquipmentStatOptions);
      document.querySelectorAll(".equipment-skip-input").forEach(input => {
        input.checked = false;
        setEquipmentSkipped(input.closest(".character-equipment-slot"), false);
      });
      targetPresetSelect.value = "";
      globalTargetPresetSelect.value = "";
      if (calculationModeSelect.value === "global") {
        resetGlobalConditions();
        clearGlobalPlanOutputs();
      }
      setInlineOptimalResult(classicOptimalResult, "运行算法测试后显示。", true);
      characterEquipmentMode.querySelectorAll(".equipment-optimal-result").forEach(output => {
        setInlineOptimalResult(output, "运行算法测试后显示。", true);
      });
      showMessage("");
      setResult(
        calculationModeSelect.value === "global"
          ? "设置全局目标后，点击“运行算法测试”。"
          : "设置目标词条后，点击“运行算法测试”。",
        true
      );
      setDetails(DEFAULT_DETAILS);
      activateOutputTab("result");
    }

    function readRows(container) {
      return [...container.querySelectorAll(".form-row")].map(row => ({
        stat: row.querySelector(".stat-select").value,
        tier: Number(row.querySelector(".tier-select").value || 0),
        flagged: row.querySelector(".flag-input").checked,
        forceKeep: row.querySelector(".force-retain-toggle")?.getAttribute("aria-pressed") === "true",
      }));
    }

    function validateInputs(initial, targets) {
      const initialStats = initial.filter(item => item.stat !== "空词条").map(item => item.stat);
      const targetStats = targets.filter(item => item.stat !== "空词条").map(item => item.stat);

      if (new Set(initialStats).size !== initialStats.length) return "当前装备存在重复词条。";
      if (new Set(targetStats).size !== targetStats.length) return "目标池存在重复词条。";
      if (targetStats.length === 0) return "请至少设置 1 个目标词条。";
      if (targets.filter(item => item.stat !== "空词条" && item.flagged).length > 3) return "必选词条不能超过 3 个。";
      const forcedRetentionError = validateForcedRetention(initial, targets);
      if (forcedRetentionError) return forcedRetentionError;
      return "";
    }
    function tierSuccessProbability(minimumTier) {
      if (minimumTier <= 1) return 1;
      return TIER_PROBS.slice(minimumTier - 1).reduce((sum, probability) => sum + probability, 0) / 100;
    }

    function buildExactModel(targetInput) {
      const targets = targetInput
        .filter(item => item.stat !== "空词条")
        .map((item, index) => ({
          code: `T${index}`,
          name: item.stat,
          mandatory: item.flagged,
          minimumTier: item.tier,
          successProbability: tierSuccessProbability(item.tier),
          weight: STAT_PROBS_BASE[item.stat]
        }));
      const targetByName = new Map(targets.map((target, index) => [target.name, index]));
      return {
        targets,
        targetByName,
        mandatoryCodes: new Set(targets.filter(target => target.mandatory).map(target => target.code)),
        goal: Math.min(3, targets.length),
        actualStats: Object.keys(STAT_PROBS_BASE)
      };
    }

    function isTargetCode(code) {
      return code.startsWith("T");
    }

    function targetIndexFromCode(code) {
      return Number(code.slice(1));
    }

    function exactCodeForStat(stat, model) {
      if (stat === "空词条") return "X";
      if (model.targetByName.has(stat)) return `T${model.targetByName.get(stat)}`;
      return "X";
    }

    function buildExactInitialState(initialInput, model) {
      return {
        slots: initialInput.map(item => {
          const code = exactCodeForStat(item.stat, model);
          const targetIndex = isTargetCode(code) ? targetIndexFromCode(code) : -1;
          const forced = Boolean(item.forceKeep);
          return {
            code,
            ok: targetIndex >= 0 ? item.tier >= model.targets[targetIndex].minimumTier : false,
            locked: Boolean(item.flagged) && (targetIndex >= 0 || forced),
            forced,
            statName: forced && targetIndex < 0 ? item.stat : "",
          };
        })
      };
    }

    function exactStateKey(state) {
      return state.slots.map(slot => `${slot.code}:${slot.ok ? 1 : 0}:${slot.locked ? 1 : 0}:${slot.forced ? 1 : 0}:${slot.statName || ""}`).join("|");
    }

    function exactBaseKey(state) {
      return state.slots.map(slot => `${slot.code}:${slot.ok ? 1 : 0}:${slot.forced ? 1 : 0}:${slot.statName || ""}`).join("|");
    }

    function exactLockMask(state) {
      return state.slots.reduce((mask, slot, index) => mask | (slot.locked ? 1 << index : 0), 0);
    }

    function bitCount(mask) {
      let count = 0;
      for (let value = mask; value; value >>>= 1) count += value & 1;
      return count;
    }

    function exactNamesReady(state, model) {
      const present = new Set(state.slots.filter(slot => isTargetCode(slot.code)).map(slot => slot.code));
      const goal = effectiveTargetGoal(state.slots, model.goal, isTargetCode);
      return [...model.mandatoryCodes].every(code => present.has(code)) && present.size >= goal;
    }

    function exactTerminal(state, model) {
      const qualified = new Set(state.slots.filter(slot => isTargetCode(slot.code) && slot.ok).map(slot => slot.code));
      const goal = effectiveTargetGoal(state.slots, model.goal, isTargetCode);
      return [...model.mandatoryCodes].every(code => qualified.has(code)) && qualified.size >= goal;
    }

    function applyExactLocks(state, lockMask) {
      return {
        slots: state.slots.map((slot, index) => ({
          ...slot,
          locked: (isTargetCode(slot.code) || slot.forced) && Boolean(lockMask & 1 << index)
        }))
      };
    }

    function exactLockChangeCost(state, newMask) {
      return lockTransitionCost(exactLockMask(state), newMask);
    }

    function exactMasksForEligible(state, model, eligibleMask) {
      const masks = [];
      const requiredMask = forcedRetentionMask(state.slots);
      const optionalLockQuota = effectiveTargetGoal(state.slots, model.goal, isTargetCode) - model.mandatoryCodes.size;
      eligibleMask |= requiredMask;
      for (let mask = 0; mask < 8; mask += 1) {
        if ((mask & ~eligibleMask) !== 0 || bitCount(mask) >= 3) continue;
        if (!includesForcedRetention(mask, state.slots)) continue;
        const optionalLocks = state.slots.filter((slot, index) => {
          return Boolean(mask & 1 << index) && isTargetCode(slot.code) && !model.mandatoryCodes.has(slot.code);
        }).length;
        if (optionalLocks <= optionalLockQuota) masks.push(mask);
      }
      return masks;
    }

    function exactActionChoices(state, model) {
      let targetMask = 0;
      let qualifiedMask = 0;
      let hasUnqualifiedTarget = false;
      state.slots.forEach((slot, index) => {
        if (!isTargetCode(slot.code)) return;
        targetMask |= 1 << index;
        if (slot.ok) {
          qualifiedMask |= 1 << index;
        } else {
          hasUnqualifiedTarget = true;
        }
      });

      const choices = exactMasksForEligible(state, model, targetMask).map(lockMask => ({ mode: "name", lockMask }));
      if (hasUnqualifiedTarget) {
        exactMasksForEligible(state, model, qualifiedMask).forEach(lockMask => {
          choices.push({ mode: "value", lockMask });
        });
      }
      return choices;
    }

    function addExactOutcome(outcomes, state, probability) {
      if (probability <= 0) return;
      const key = exactStateKey(state);
      const existing = outcomes.get(key);
      if (existing) {
        existing.probability += probability;
      } else {
        outcomes.set(key, { state, probability });
      }
    }

    function enumerateExactNameTransitions(state, lockMask, model) {
      const prepared = applyExactLocks(state, lockMask);
      const outcomes = new Map();
      const outputSlots = Array(3);
      const usedActualStats = new Set();
      prepared.slots.forEach(slot => {
        if (slot.locked && isTargetCode(slot.code)) {
          usedActualStats.add(model.targets[targetIndexFromCode(slot.code)].name);
        } else if (slot.locked && slot.statName) {
          usedActualStats.add(slot.statName);
        }
      });

      function visit(slotIndex, probability) {
        if (slotIndex === 3) {
          addExactOutcome(outcomes, { slots: outputSlots.map(slot => ({ ...slot })) }, probability);
          return;
        }

        const currentSlot = prepared.slots[slotIndex];
        if (currentSlot.locked) {
          outputSlots[slotIndex] = { ...currentSlot };
          visit(slotIndex + 1, probability);
          return;
        }

        const appearanceProbability = SLOT_PROBS[slotIndex];
        if (appearanceProbability < 1) {
          outputSlots[slotIndex] = { code: "X", ok: false, locked: false, forced: false, statName: "" };
          visit(slotIndex + 1, probability * (1 - appearanceProbability));
        }

        const available = model.actualStats.filter(name => !usedActualStats.has(name));
        const remainingWeight = available.reduce((sum, name) => sum + STAT_PROBS_BASE[name], 0);
        for (const statName of available) {
          const statProbability = appearanceProbability * STAT_PROBS_BASE[statName] / remainingWeight;
          usedActualStats.add(statName);
          if (model.targetByName.has(statName)) {
            const targetIndex = model.targetByName.get(statName);
            const successProbability = model.targets[targetIndex].successProbability;
            if (successProbability > 0) {
              outputSlots[slotIndex] = { code: `T${targetIndex}`, ok: true, locked: false, forced: false, statName: "" };
              visit(slotIndex + 1, probability * statProbability * successProbability);
            }
            if (successProbability < 1) {
              outputSlots[slotIndex] = { code: `T${targetIndex}`, ok: false, locked: false, forced: false, statName: "" };
              visit(slotIndex + 1, probability * statProbability * (1 - successProbability));
            }
          } else {
            outputSlots[slotIndex] = { code: "X", ok: false, locked: false, forced: false, statName: "" };
            visit(slotIndex + 1, probability * statProbability);
          }
          usedActualStats.delete(statName);
        }
      }

      visit(0, 1);
      return outcomes;
    }

    function enumerateExactValueTransitions(state, lockMask, model) {
      const prepared = applyExactLocks(state, lockMask);
      const outcomes = new Map();
      const outputSlots = Array(3);

      function visit(slotIndex, probability) {
        if (slotIndex === 3) {
          addExactOutcome(outcomes, { slots: outputSlots.map(slot => ({ ...slot })) }, probability);
          return;
        }

        const slot = prepared.slots[slotIndex];
        if (slot.locked || !isTargetCode(slot.code)) {
          outputSlots[slotIndex] = { ...slot };
          visit(slotIndex + 1, probability);
          return;
        }

        const successProbability = model.targets[targetIndexFromCode(slot.code)].successProbability;
        if (successProbability > 0) {
          outputSlots[slotIndex] = { ...slot, ok: true, locked: false };
          visit(slotIndex + 1, probability * successProbability);
        }
        if (successProbability < 1) {
          outputSlots[slotIndex] = { ...slot, ok: false, locked: false };
          visit(slotIndex + 1, probability * (1 - successProbability));
        }
      }

      visit(0, 1);
      return outcomes;
    }

    function exactActionDescription(state, action) {
      const forcedSlots = state.slots
        .map((slot, index) => slot.forced && action.lockMask & 1 << index ? `${index + 1}号位` : "")
        .filter(Boolean);
      const lockedSlots = state.slots
        .map((slot, index) => !slot.forced && action.lockMask & 1 << index ? `${index + 1}号位` : "")
        .filter(Boolean);
      const lockParts = [];
      if (forcedSlots.length) lockParts.push(`强制保留 ${forcedSlots.join("、")}`);
      if (lockedSlots.length) lockParts.push(`锁定 ${lockedSlots.join("、")}`);
      const lockText = lockParts.length ? lockParts.join("，") : "全不锁";
      return `${lockText}，${action.mode === "name" ? "洗词条名称" : "洗数值"}`;
    }

    function exactStageMilestoneText(stage, recordList, model) {
      function statusProbability(distribution, targetCode, predicate) {
        return distribution.reduce((sum, item) => {
          const state = recordList[item.stateIndex]?.state;
          const matches = state?.slots.some(slot => slot.code === targetCode && predicate(slot));
          return sum + (matches ? item.probability : 0);
        }, 0);
      }

      const completedTargets = model.targets.filter(target => {
        const before = statusProbability(stage.startDistribution, target.code, slot => slot.ok);
        const after = statusProbability(stage.exitDistribution, target.code, slot => slot.ok);
        return before < 1 - 1e-9 && after >= 1 - 1e-9;
      });
      if (completedTargets.length) {
        return `直到达标（${completedTargets.map(target => target.name).join("、")}）`;
      }

      const acquiredTargets = model.targets.filter(target => {
        const before = statusProbability(stage.startDistribution, target.code, () => true);
        const after = statusProbability(stage.exitDistribution, target.code, () => true);
        return before < 1 - 1e-9 && after >= 1 - 1e-9;
      });
      return acquiredTargets.length
        ? `直到获得（${acquiredTargets.map(target => target.name).join("、")}）`
        : "";
    }

    function exactStageConditionText(stage, recordList, model) {
      const unqualifiedTargets = model.targets.filter(target => {
        return stage.startDistribution.every(item => {
          const state = recordList[item.stateIndex]?.state;
          return state?.slots.some(slot => slot.code === target.code && !slot.ok);
        });
      });
      return unqualifiedTargets.length
        ? `若${unqualifiedTargets.map(target => target.name).join("、")}数值未达标，`
        : "";
    }

    async function solveExactOptimal(initialState, model, onProgress = () => {}, retainPolicy = false) {
      const startKey = exactStateKey(initialState);
      const records = new Map();
      const queue = [];
      const transitionCache = new Map();

      function registerState(state) {
        const key = exactStateKey(state);
        if (!records.has(key)) {
          const record = { key, state, actions: [], terminal: exactTerminal(state, model) };
          records.set(key, record);
          queue.push(record);
        }
        return key;
      }

      registerState(initialState);
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const record = queue[cursor];
        if (!record.terminal) {
          const choices = exactActionChoices(record.state, model);
          if (!choices.length) {
            throw new Error("强制保留占满了可锁位置，当前目标没有可执行的洗练动作");
          }
          for (const { mode, lockMask } of choices) {
            const cacheKey = `${mode}|${exactBaseKey(record.state)}|${lockMask}`;
            let outcomes = transitionCache.get(cacheKey);
            if (!outcomes) {
              outcomes = mode === "name"
                ? enumerateExactNameTransitions(record.state, lockMask, model)
                : enumerateExactValueTransitions(record.state, lockMask, model);
              transitionCache.set(cacheKey, outcomes);
            }

            let probabilitySum = 0;
            const transitions = [];
            for (const outcome of outcomes.values()) {
              probabilitySum += outcome.probability;
              transitions.push({ key: registerState(outcome.state), probability: outcome.probability });
            }
            if (Math.abs(probabilitySum - 1) > 1e-9) {
              throw new Error(`状态转移概率未归一：${probabilitySum}`);
            }

            record.actions.push({
              mode,
              lockMask,
              immediateCost: exactLockChangeCost(record.state, lockMask) + rerollStoneCost(lockMask),
              transitions
            });
          }
        }

        if (records.size > 24000) throw new Error("有限状态 MDP 超过 24,000 个状态，请减少目标候选后重试");
        if (cursor % 32 === 0) {
          onProgress("graph", cursor + 1, queue.length);
          await nextFrame();
        }
      }

      const recordList = [...records.values()];
      const indexByKey = new Map(recordList.map((record, index) => [record.key, index]));
      const values = new Float64Array(recordList.length);
      const policy = new Int16Array(recordList.length);
      policy.fill(-1);
      recordList.forEach(record => {
        record.actions.forEach(action => {
          action.transitions = action.transitions.map(transition => ({
            index: indexByKey.get(transition.key),
            probability: transition.probability
          }));
        });
      });

      const tolerance = 1e-9;
      const maxIterations = 20000;
      let residual = Infinity;
      let completedIterations = 0;
      for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
        residual = 0;
        for (let stateIndex = recordList.length - 1; stateIndex >= 0; stateIndex -= 1) {
          const record = recordList[stateIndex];
          if (record.terminal) continue;
          let bestValue = Infinity;
          let bestActionIndex = -1;

          record.actions.forEach((action, actionIndex) => {
            let selfProbability = 0;
            let futureValue = 0;
            action.transitions.forEach(transition => {
              if (transition.index === stateIndex) {
                selfProbability += transition.probability;
              } else {
                futureValue += transition.probability * values[transition.index];
              }
            });
            const denominator = 1 - selfProbability;
            if (denominator > 1e-14) {
              const candidate = (action.immediateCost + futureValue) / denominator;
              if (candidate < bestValue) {
                bestValue = candidate;
                bestActionIndex = actionIndex;
              }
            }
          });

          const difference = Math.abs(bestValue - values[stateIndex]);
          if (difference > residual) residual = difference;
          values[stateIndex] = bestValue;
          policy[stateIndex] = bestActionIndex;
        }

        completedIterations = iteration;
        if (residual < tolerance) break;
        if (iteration % 20 === 0) {
          onProgress("solve", iteration, residual);
          await nextFrame();
        }
      }

      if (!Number.isFinite(values[indexByKey.get(startKey)])) throw new Error("有限状态 MDP 未得到有限期望");
      if (residual >= tolerance) throw new Error(`有限状态 MDP 未收敛，剩余误差 ${residual}`);
      const startIndex = indexByKey.get(startKey);
      const firstActionIndex = policy[startIndex];
      const firstAction = firstActionIndex >= 0 ? recordList[startIndex].actions[firstActionIndex] : null;
      const policyStagePreview = createPolicyStageSummary({
        recordList,
        policy,
        values,
        startIndex,
        describeAction: exactActionDescription,
      });
      policyStagePreview.stages.forEach(stage => {
        stage.milestoneText = exactStageMilestoneText(stage, recordList, model);
        stage.conditionText = exactStageConditionText(stage, recordList, model);
      });
      return {
        value: values[startIndex],
        firstAction,
        firstActionText: firstAction ? exactActionDescription(initialState, firstAction) : "目标已经完成",
        policyStagePreview,
        model,
        stateCount: recordList.length,
        iterations: completedIterations,
        residual,
        policyData: retainPolicy ? { records: recordList, policy, values, startIndex } : null
      };
    }

    function formulaFastPath(initialState, model, firstAction) {
      if (forcedRetentionMask(initialState.slots)) return null;
      if (!firstAction || firstAction.mode !== "name" || model.targets.length !== 3 || model.goal !== 3) return null;
      if (exactNamesReady(initialState, model)) return null;
      if (bitCount(firstAction.lockMask) !== 2) return null;
      const lockedSlots = initialState.slots.filter((slot, index) => firstAction.lockMask & 1 << index);
      if (lockedSlots.some(slot => !isTargetCode(slot.code) || !slot.ok)) return null;
      const lockedCodes = new Set(lockedSlots.map(slot => slot.code));
      const missingTarget = model.targets.find(target => !lockedCodes.has(target.code));
      const openIndex = [0, 1, 2].find(index => !(firstAction.lockMask & 1 << index));
      if (!missingTarget || openIndex === undefined || missingTarget.successProbability <= 0) return null;

      const remainingWeight = 100 - lockedSlots.reduce((sum, slot) => {
        return sum + model.targets[targetIndexFromCode(slot.code)].weight;
      }, 0);
      const nameProbability = SLOT_PROBS[openIndex] * missingTarget.weight / remainingWeight;
      if (nameProbability <= 0) return null;
      const rerollCost = rerollStoneCost(firstAction.lockMask);
      const lockCost = exactLockChangeCost(initialState, firstAction.lockMask);
      const nameCost = rerollCost / nameProbability;
      const valueCost = rerollCost * (1 - missingTarget.successProbability) / missingTarget.successProbability;
      return {
        value: lockCost + nameCost + valueCost,
        lockCost,
        nameCost,
        valueCost,
        nameProbability,
        tierProbability: missingTarget.successProbability,
        targetName: missingTarget.name,
        slot: openIndex + 1
      };
    }

    function findFormulaFastPath(initialState, model) {
      const candidates = [];
      for (let lockMask = 0; lockMask < 8; lockMask += 1) {
        if (bitCount(lockMask) !== 2) continue;
        const result = formulaFastPath(initialState, model, { mode: "name", lockMask });
        if (result) candidates.push({ ...result, lockMask });
      }
      candidates.sort((left, right) => left.value - right.value);
      return candidates[0] ?? null;
    }
    function runExactSelfChecks() {
      const statWeight = Object.values(STAT_PROBS_BASE).reduce((sum, value) => sum + value, 0);
      const tierWeight = TIER_PROBS.reduce((sum, value) => sum + value, 0);
      if (statWeight !== 100 || tierWeight !== 100) throw new Error("基础概率总和不是 100%");
      if (Math.abs(tierSuccessProbability(10) - 0.12) > 1e-12) throw new Error("第 10 档累计概率校验失败");

      const targetInput = [
        { stat: "攻击力增加", tier: 10, flagged: false },
        { stat: "优越代码伤害增加", tier: 10, flagged: false },
        { stat: "最大装弹数增加", tier: 10, flagged: false }
      ];
      const initialInput = [
        { stat: "攻击力增加", tier: 10, flagged: true },
        { stat: "优越代码伤害增加", tier: 10, flagged: false },
        { stat: "空词条", tier: 0, flagged: false }
      ];
      const model = buildExactModel(targetInput);
      const state = buildExactInitialState(initialInput, model);
      const formula = findFormulaFastPath(state, model);
      if (!formula || Math.abs(formula.value - 91.66666666666667) > 1e-9) {
        throw new Error("91.666667 理论基准校验失败");
      }
      return true;
    }
    function nextFrame() {
      return new Promise(resolve => requestAnimationFrame(resolve));
    }

    function setProgress(completed, total) {
      const percent = total ? Math.min(100, Math.round(completed / total * 100)) : 0;
      progressBar.style.width = `${percent}%`;
      progressTrack.setAttribute("aria-valuenow", String(percent));
      progressText.textContent = `计算中… ${percent}%`;
    }
    function setCalculating(isCalculating) {
      app.setAttribute("aria-busy", String(isCalculating));
      [...app.querySelectorAll("button, input, select")].forEach(control => {
        if (control === downloadAllResultsButton) return;
        if (isCalculating) {
          control.dataset.wasDisabled = control.disabled ? "1" : "0";
          control.disabled = true;
        } else {
          control.disabled = control.dataset.wasDisabled === "1";
          delete control.dataset.wasDisabled;
        }
      });
      progressWrap.hidden = !isCalculating;
      calculateButton.textContent = isCalculating ? "正在计算…" : "运行算法测试";
      if (!isCalculating) renderRunRecords();
    }
    function resultHeader(targetInput, methodText) {
      const candidateCount = targetInput.filter(item => item.stat !== "空词条").length;
      const targetCount = Math.min(3, candidateCount);
      return `最佳动作演算完毕（目标数:${targetCount}条/从${candidateCount}个候选选出，${methodText}），版本号V2.81:`;
    }

    function resultFooter() {
      return [
        "（执行一次后，请按新的盘面重新计算下一步）",
        "👑 伟大的皇冠王国国王为本次计算负责( ゜- ゜)",
        "💡 钟鸣提供技术支持ヽ(`Д´)ﾉKISAMAAAAA！"
      ].join("\n");
    }

    function buildExactResultOutput(exactSolution, targetInput) {
      const separator = "=".repeat(40);
      const lines = [resultHeader(targetInput, "有限状态 MDP"), separator];
      if (exactSolution.value <= 1e-9) {
        lines.push("🎉 当前盘面已经满足全部目标，无需继续消耗石头。");
      } else {
        lines.push(`🔒 最佳动作 [${exactSolution.firstActionText}]：约需 ${exactSolution.value.toFixed(1)} 颗石头 👈【最佳期望策略】`);
      }
      lines.push(separator, resultFooter());
      return lines.join("\n");
    }
    function buildDetailsOutput({ exactSolution, formulaResult }) {
      const lines = [DEFAULT_DETAILS, "", "本次计算明细", "=".repeat(36), "模型自检：通过"];
      if (exactSolution) {
        lines.push(
          `有限状态 MDP 期望：${exactSolution.value.toFixed(6)} 颗石头`,
          `当前最佳动作：${exactSolution.firstActionText}`,
          `状态数量：${exactSolution.stateCount}；求解轮数：${exactSolution.iterations}`,
          `Bellman 残差：${exactSolution.residual.toExponential(3)}`
        );
      }

      if (formulaResult) {
        const difference = exactSolution ? formulaResult.value - exactSolution.value : 0;
        lines.push(
          "",
          "公式快速通道（固定两锁方案）",
          `目标：${formulaResult.slot}号位 ${formulaResult.targetName}`,
          `名称成功率：${(formulaResult.nameProbability * 100).toFixed(4)}%；档位成功率：${(formulaResult.tierProbability * 100).toFixed(2)}%`,
          `锁定 ${formulaResult.lockCost.toFixed(3)} + 名称 ${formulaResult.nameCost.toFixed(3)} + 数值 ${formulaResult.valueCost.toFixed(3)}`,
          `公式结果：${formulaResult.value.toFixed(6)}；比有限状态 MDP 多：${difference.toFixed(6)}`
        );
      }

      lines.push(
        "",
        "算法说明",
        "有限状态 MDP 枚举每次洗练的完整离散概率，并在每个盘面同时比较洗名称、洗数值和锁定动作。"
      );
      return lines.join("\n");
    }

    function readCharacterEquipmentInputs() {
      return [...characterEquipmentMode.querySelectorAll(".character-equipment-slot")].map((section, index) => ({
        index,
        label: EQUIPMENT_SLOT_NAMES[index] || `装备 ${index + 1}`,
        skipped: section.querySelector(".equipment-skip-input").checked,
        initialInput: readRows(section.querySelector(".equipment-current-rows")),
        targetInput: readRows(section.querySelector(".equipment-target-rows"))
      }));
    }

    function statTierBasisPoints(stat, tier) {
      if (!stat || tier <= 0) return 0;
      const text = STAT_TIER_VALUES[stat]?.[tier - 1];
      return Math.round(Number.parseFloat(text || "0") * 100);
    }

    function statTierText(stat, tier) {
      return STAT_TIER_VALUES[stat]?.[tier - 1] || "0%";
    }

    function currentTierForStat(initialInput, stat) {
      return initialInput.find(item => item.stat === stat)?.tier || 0;
    }

    function readGlobalConditionConfig(activeEquipmentCount) {
      const rows = [...globalConditionRows.querySelectorAll(".global-condition-row")];
      if (!rows.length) return { error: "请至少添加一个全局词条条件。" };

      const conditions = [];
      const seenStats = new Set();
      for (const row of rows) {
        const stat = row.querySelector(".global-stat-select").value;
        const minCount = Number(row.querySelector(".global-min-count").value);
        const minTotal = Number(row.querySelector(".global-min-total").value);
        if (seenStats.has(stat)) return { error: `${stat} 重复出现，请合并成一条条件。` };
        if (!Number.isInteger(minCount) || minCount < 0 || minCount > activeEquipmentCount) {
          return { error: `${stat} 的至少条数应为 0～${activeEquipmentCount} 的整数。` };
        }
        if (!Number.isFinite(minTotal) || minTotal < 0) {
          return { error: `${stat} 的合计数值不能小于 0。` };
        }
        if (minCount === 0 && minTotal === 0) {
          return { error: `${stat} 的至少条数与合计数值不能同时为 0。` };
        }
        const minTotalBasis = Math.round(minTotal * 100);
        const maximumTotalBasis = activeEquipmentCount * statTierBasisPoints(stat, 15);
        if (minTotalBasis > maximumTotalBasis) {
          return { error: `${stat} 在 ${activeEquipmentCount} 件装备上的理论最高合计为 ${(maximumTotalBasis / 100).toFixed(2)}%。` };
        }
        seenStats.add(stat);
        conditions.push({ stat, minCount, minTotal, minTotalBasis });
      }

      const requiredLines = conditions.reduce((sum, condition) => sum + condition.minCount, 0);
      return { conditions, requiredLines };
    }

    function estimateGlobalTargetCost(equipment, stat, tier) {
      const currentTier = currentTierForStat(equipment.initialInput, stat);
      if (currentTier >= tier) return 0;
      const tierProbability = Math.max(tierSuccessProbability(tier), 0.000001);
      if (currentTier > 0) return 1 / tierProbability;
      const totalWeight = Object.values(STAT_PROBS_BASE).reduce((sum, value) => sum + value, 0);
      const statProbability = STAT_PROBS_BASE[stat] / totalWeight;
      return 1 / Math.max(statProbability * tierProbability, 0.000001);
    }

    function enumerateGlobalStatAssignments(condition, activeEquipments) {
      const equipmentCount = activeEquipments.length;
      const assignmentCount = 16 ** equipmentCount;
      const groupedByMask = new Map();

      for (let code = 0; code < assignmentCount; code += 1) {
        let remainder = code;
        const tiers = [];
        let count = 0;
        let totalBasis = 0;
        let mask = 0;
        let approximateCost = 0;

        for (let index = 0; index < equipmentCount; index += 1) {
          const tier = remainder % 16;
          remainder = Math.floor(remainder / 16);
          tiers.push(tier);
          if (tier <= 0) continue;
          count += 1;
          mask |= 1 << index;
          totalBasis += statTierBasisPoints(condition.stat, tier);
          approximateCost += estimateGlobalTargetCost(activeEquipments[index], condition.stat, tier);
        }

        if (count < condition.minCount || totalBasis < condition.minTotalBasis) continue;
        approximateCost += Math.max(0, totalBasis - condition.minTotalBasis) * 0.00001;
        const assignment = { tiers, count, totalBasis, mask, approximateCost };
        const group = groupedByMask.get(mask) || [];
        group.push(assignment);
        groupedByMask.set(mask, group);
      }

      return [...groupedByMask.values()]
        .flatMap(group => selectDiversifiedAssignments(group, GLOBAL_ASSIGNMENTS_PER_MASK))
        .sort((left, right) => left.approximateCost - right.approximateCost || left.totalBasis - right.totalBasis);
    }

    function globalPlanSignature(plan) {
      return plan.targetsByEquipment
        .map(targets => targets.map(target => `${target.stat}:${target.tier}`).sort().join("|"))
        .join("/");
    }

    function pruneGlobalPlans(plans, requiredLines, conditions) {
      const bestBySignature = new Map();
      plans.forEach(plan => {
        const signature = globalPlanSignature(plan);
        const previous = bestBySignature.get(signature);
        if (!previous || plan.approximateCost < previous.approximateCost) bestBySignature.set(signature, plan);
      });

      const grouped = new Map();
      [...bestBySignature.values()].forEach(plan => {
        const key = Math.min(plan.totalLines, requiredLines);
        const group = grouped.get(key) || [];
        group.push(plan);
        grouped.set(key, group);
      });
      return [...grouped.values()].flatMap(group => selectDiversifiedPlans(group, {
        conditions,
        tierBasis: statTierBasisPoints,
        limit: GLOBAL_PLAN_BEAM_PER_LINE_COUNT,
      }));
    }

    function combineGlobalAssignments(conditions, assignmentLists, activeEquipments, requiredLines) {
      let plans = [{
        targetsByEquipment: Array.from({ length: activeEquipments.length }, () => []),
        approximateCost: 0,
        totalLines: 0
      }];

      for (let conditionIndex = 0; conditionIndex < conditions.length; conditionIndex += 1) {
        const condition = conditions[conditionIndex];
        const nextPlans = [];
        for (const plan of plans) {
          for (const assignment of assignmentLists[conditionIndex]) {
            const targetsByEquipment = plan.targetsByEquipment.map(targets => targets.slice());
            let valid = true;
            for (let equipmentIndex = 0; equipmentIndex < assignment.tiers.length; equipmentIndex += 1) {
              const tier = assignment.tiers[equipmentIndex];
              if (tier <= 0) continue;
              if (targetsByEquipment[equipmentIndex].length >= 3) {
                valid = false;
                break;
              }
              targetsByEquipment[equipmentIndex].push({ stat: condition.stat, tier });
            }
            if (!valid) continue;
            nextPlans.push({
              targetsByEquipment,
              approximateCost: plan.approximateCost + assignment.approximateCost,
              totalLines: plan.totalLines + assignment.count
            });
          }
        }
        plans = pruneGlobalPlans(nextPlans, requiredLines, conditions.slice(0, conditionIndex + 1));
        if (!plans.length) break;
      }

      return plans
        .filter(plan => plan.totalLines >= requiredLines)
        .sort((left, right) => left.approximateCost - right.approximateCost);
    }

    function globalTargetInput(targets) {
      return targets.map(target => ({ stat: target.stat, tier: target.tier, flagged: true }));
    }

    function globalAssignmentText(targets) {
      if (!targets.length) return "本件装备不承担全局目标。";
      return targets
        .map((target, index) => `${index + 1}. ${target.stat} · [${target.tier}档] ${statTierText(target.stat, target.tier)}`)
        .join("\n");
    }

    async function solveGlobalEquipmentProfile(equipment, targets, cache, progressCallback) {
      if (!targets.length) {
        return {
          value: 0,
          firstActionText: "当前装备无需承担全局目标",
          stateCount: 1,
          iterations: 0,
          residual: 0
        };
      }
      const profileKey = `${equipment.index}|${targets.map(target => `${target.stat}:${target.tier}`).sort().join("|")}`;
      if (cache.has(profileKey)) return cache.get(profileKey);
      const targetInput = globalTargetInput(targets);
      const model = buildExactModel(targetInput);
      const initialState = buildExactInitialState(equipment.initialInput, model);
      const solution = await solveExactOptimal(initialState, model, progressCallback);
      cache.set(profileKey, solution);
      return solution;
    }

    function buildGlobalConditionOutput(characterName, bestResult, conditions, activeEquipments, candidateCount, evaluatedCount) {
      const separator = "=".repeat(44);
      const lines = [`${characterName} · 全局条件静态分配测试`, separator, "达成目标："];
      conditions.forEach(condition => {
        const assigned = bestResult.plan.targetsByEquipment.flat().filter(target => target.stat === condition.stat);
        const totalBasis = assigned.reduce((sum, target) => sum + statTierBasisPoints(target.stat, target.tier), 0);
        lines.push(`  ${condition.stat}：${assigned.length} 条，合计至少 ${(totalBasis / 100).toFixed(2)}%`);
      });
      lines.push(`  全局目标词条：${bestResult.plan.totalLines} 条`, "", "装备分配：");
      activeEquipments.forEach((equipment, index) => {
        const targets = bestResult.plan.targetsByEquipment[index];
        const solution = bestResult.equipmentResults[index].exactSolution;
        lines.push(`${equipment.label}：${targets.map(target => `${target.stat}[${target.tier}档]`).join("、") || "无需承担"}`);
        lines.push(`  期望约 ${solution.value.toFixed(1)} 颗；建议：${solution.firstActionText}`);
      });
      lines.push(
        "",
        separator,
        `所选静态分配合计期望：约 ${bestResult.totalExpectedCost.toFixed(1)} 颗石头`,
        `候选池共 ${candidateCount} 个，本次使用有限状态 MDP 精算 ${evaluatedCount} 个（包含多指标初筛与通用邻域方案）。`,
        "这是静态目标分配；每实际洗一次后，请重新导入盘面并再次计算。",
        separator,
        resultFooter()
      );
      return lines.join("\n");
    }

    function buildGlobalConditionDetails(characterName, bestResult, conditions) {
      const lines = [
        `${characterName} · 全局条件测试明细`,
        "=".repeat(38)
      ];
      conditions.forEach(condition => {
        lines.push(`${condition.stat}：至少 ${condition.minCount} 条，四件合计至少 ${condition.minTotal.toFixed(2)}%。`);
      });
      bestResult.equipmentResults.forEach(item => {
        lines.push(
          "",
          item.label,
          "-".repeat(24),
          globalAssignmentText(item.targets),
          `有限状态 MDP 期望：${item.exactSolution.value.toFixed(6)} 颗石头`,
          `当前最佳动作：${item.exactSolution.firstActionText}`,
          `状态数量：${item.exactSolution.stateCount}；求解轮数：${item.exactSolution.iterations}`
        );
      });
      lines.push(
        "",
        "分配方法说明",
        "先枚举各词条在四件装备上的档位组合，以近似成本、档位均衡、超额数值和装备负载多项指标保留候选。",
        "随后从多个候选出发，通用搜索升降档、增减目标条数、跨装备移动和满槽交换，并使用有限状态 MDP 计算真实期望。",
        "最终结果是计算预算内找到的最低期望静态分配；不等同于不设时间上限的全空间穷举或跨装备动态策略。"
      );
      return lines.join("\n");
    }

    async function runGlobalConditionBatch() {
      const allEquipments = readCharacterEquipmentInputs();
      const activeEquipments = allEquipments.filter(item => !item.skipped);
      const characterName = characterSelect.selectedOptions[0]?.textContent.trim() || "当前角色";
      if (!activeEquipments.length) {
        showMessage("四件装备都被勾选为“不跑”，请至少保留一件装备。", true);
        return;
      }

      const config = readGlobalConditionConfig(activeEquipments.length);
      if (config.error) {
        showMessage(config.error, true);
        globalTargetStatus.textContent = config.error;
        return;
      }

      showMessage("");
      globalTargetStatus.textContent = "正在枚举满足全局条件的装备分配…";
      allEquipments.forEach(equipment => {
        const section = characterEquipmentMode.querySelector(`[data-equipment-index="${equipment.index}"]`);
        section.querySelector(".global-assignment-output").textContent = equipment.skipped ? "本次已跳过。" : "正在分配目标…";
        setInlineOptimalResult(section.querySelector(".equipment-optimal-result"), equipment.skipped ? "本次已跳过。" : "正在计算…", true);
      });
      setResult("正在生成全局静态分配候选…");
      setDetails("计算完成后，本页将显示全局条件的分配和各装备有限状态 MDP 结果。\n");
      activateOutputTab("result");
      setProgress(0, 100);
      setCalculating(true);
      await nextFrame();

      try {
        runExactSelfChecks();
        const assignmentLists = [];
        for (let index = 0; index < config.conditions.length; index += 1) {
          const condition = config.conditions[index];
          setBatchProgress((index / config.conditions.length) * 12, `枚举 ${condition.stat} 的档位组合…`);
          const assignments = enumerateGlobalStatAssignments(condition, activeEquipments);
          if (!assignments.length) throw new Error(`${condition.stat} 没有可行的档位分配。`);
          assignmentLists.push(assignments);
          await nextFrame();
        }

        const candidatePlans = combineGlobalAssignments(
          config.conditions,
          assignmentLists,
          activeEquipments,
          config.requiredLines
        );
        if (!candidatePlans.length) {
          throw new Error("这些全局条件无法在每件装备最多 3 条词条的限制下同时满足。请减少条数、合计数值或跳过条件。 ");
        }

        const initialPlans = selectDiversifiedPlans(candidatePlans, {
          conditions: config.conditions,
          tierBasis: statTierBasisPoints,
          limit: GLOBAL_EXACT_PLAN_LIMIT,
        });
        globalTargetStatus.textContent = `找到 ${candidatePlans.length} 个初筛候选，正在使用有限状态 MDP 精算 ${initialPlans.length} 个多样化方案。`;
        const cache = new Map();
        const evaluatedResults = [];
        const failedPlans = [];
        const evaluatedSignatures = new Set();
        const evaluatePlanBatch = async (plans, progressStart, progressEnd, phaseLabel) => {
          const pendingPlans = plans.filter(plan => !evaluatedSignatures.has(globalPlanSignature(plan)));
          for (let planIndex = 0; planIndex < pendingPlans.length; planIndex += 1) {
            const plan = pendingPlans[planIndex];
            const equipmentResults = [];
            let totalExpectedCost = 0;
            let planFailed = false;
            evaluatedSignatures.add(globalPlanSignature(plan));
            for (let equipmentIndex = 0; equipmentIndex < activeEquipments.length; equipmentIndex += 1) {
              const equipment = activeEquipments[equipmentIndex];
              const targets = plan.targetsByEquipment[equipmentIndex];
              const completedProfiles = planIndex * activeEquipments.length + equipmentIndex;
              const totalProfiles = Math.max(1, pendingPlans.length * activeEquipments.length);
              const percent = progressStart + completedProfiles / totalProfiles * (progressEnd - progressStart);
              setBatchProgress(percent, `${phaseLabel} ${planIndex + 1}/${pendingPlans.length} · ${equipment.label} · 有限状态 MDP…`);
              try {
                const exactSolution = await solveGlobalEquipmentProfile(equipment, targets, cache, () => {});
                equipmentResults.push({ ...equipment, targets, exactSolution });
                totalExpectedCost += exactSolution.value;
              } catch (error) {
                failedPlans.push(error instanceof Error ? error.message : String(error));
                planFailed = true;
                break;
              }
            }
            if (!planFailed) evaluatedResults.push({ plan, equipmentResults, totalExpectedCost });
          }
        };

        await evaluatePlanBatch(initialPlans, 15, 45, "初筛候选");

        if (!evaluatedResults.length) {
          throw new Error(failedPlans[0] || "候选分配均未能完成有限状态 MDP 求解。请降低目标或减少条件后重试。");
        }
        let neighborhoodCandidateCount = 0;
        let roundsWithoutImprovement = 0;
        let previousBestCost = evaluatedResults.reduce(
          (best, result) => Math.min(best, result.totalExpectedCost),
          Number.POSITIVE_INFINITY
        );
        for (let round = 0; round < GLOBAL_EXACT_SEARCH_ROUNDS; round += 1) {
          evaluatedResults.sort((left, right) => left.totalExpectedCost - right.totalExpectedCost);
          const searchSeeds = evaluatedResults.slice(0, GLOBAL_EXACT_SEARCH_BEAM);
          const rawNeighborhoodPlans = searchSeeds.flatMap(result => expandGlobalPlanNeighbors(result.plan, {
            conditions: config.conditions,
            tierBasis: statTierBasisPoints,
            estimateCost: (equipmentIndex, stat, tier) => estimateGlobalTargetCost(
              activeEquipments[equipmentIndex],
              stat,
              tier
            ),
            perConditionLimit: GLOBAL_EXACT_NEIGHBOR_LIMIT,
          })).filter(plan => !evaluatedSignatures.has(globalPlanSignature(plan)));
          const neighborhoodPlans = selectDiversifiedPlans(rawNeighborhoodPlans, {
            conditions: config.conditions,
            tierBasis: statTierBasisPoints,
            limit: GLOBAL_EXACT_NEIGHBOR_LIMIT,
          });
          if (!neighborhoodPlans.length) break;
          neighborhoodCandidateCount += neighborhoodPlans.length;
          globalTargetStatus.textContent = `全局搜索第 ${round + 1} 轮：正在精算 ${neighborhoodPlans.length} 个通用邻域方案。`;
          const roundSpan = 53 / GLOBAL_EXACT_SEARCH_ROUNDS;
          const progressStart = 45 + round * roundSpan;
          await evaluatePlanBatch(neighborhoodPlans, progressStart, progressStart + roundSpan, `全局搜索 ${round + 1}`);

          const currentBestCost = evaluatedResults.reduce(
            (best, result) => Math.min(best, result.totalExpectedCost),
            Number.POSITIVE_INFINITY
          );
          if (currentBestCost < previousBestCost - 0.0001) {
            previousBestCost = currentBestCost;
            roundsWithoutImprovement = 0;
          } else {
            roundsWithoutImprovement += 1;
            if (roundsWithoutImprovement >= GLOBAL_EXACT_SEARCH_PATIENCE) break;
          }
        }

        evaluatedResults.sort((left, right) => left.totalExpectedCost - right.totalExpectedCost);
        const bestResult = evaluatedResults[0];

        for (let index = 0; index < bestResult.equipmentResults.length; index += 1) {
          const item = bestResult.equipmentResults[index];
          if (!item.targets.length) continue;
          setBatchProgress(98 + (index / bestResult.equipmentResults.length) * 2, `${item.label} · 生成可展开决策树…`);
          const targetInput = globalTargetInput(item.targets);
          const model = buildExactModel(targetInput);
          const initialState = buildExactInitialState(item.initialInput, model);
          item.exactSolution = await solveExactOptimal(initialState, model, () => {}, true);
        }

        const activeResultByIndex = new Map(bestResult.equipmentResults.map(item => [item.index, item]));
        allEquipments.forEach(equipment => {
          const section = characterEquipmentMode.querySelector(`[data-equipment-index="${equipment.index}"]`);
          if (equipment.skipped) {
            section.querySelector(".global-assignment-output").textContent = "本次已跳过。";
            setInlineOptimalResult(section.querySelector(".equipment-optimal-result"), "本次已跳过。", true);
            return;
          }
          const item = activeResultByIndex.get(equipment.index);
          section.querySelector(".global-assignment-output").textContent = globalAssignmentText(item.targets);
          renderInlineOptimalResult(section.querySelector(".equipment-optimal-result"), item.exactSolution);
        });

        setBatchProgress(100, "全局条件分配与有限状态 MDP 计算完成");
        globalTargetStatus.textContent = `已完成：使用有限状态 MDP 比较 ${evaluatedResults.length} 个候选，选出合计期望最低方案。`;
        const resultText = buildGlobalConditionOutput(
          characterName,
          bestResult,
          config.conditions,
          activeEquipments,
          candidatePlans.length + neighborhoodCandidateCount,
          evaluatedResults.length
        );
        const detailsText = buildGlobalConditionDetails(characterName, bestResult, config.conditions);
        setResult(resultText);
        setDetails(detailsText);
        cacheCharacterExactSolutions(selectedCharacterKey(), "global", bestResult.equipmentResults);
        await saveRunRecord(buildGlobalRunRecord({
          characterName,
          allEquipments,
          bestResult,
          conditions: config.conditions,
          resultText,
          detailsText,
        }));
        activateOutputTab("result");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        showMessage(`全局条件计算失败：${detail}`, true);
        globalTargetStatus.textContent = detail;
        characterEquipmentMode.querySelectorAll(".equipment-optimal-result").forEach(output => {
          if (output.textContent === "正在计算…") setInlineOptimalResult(output, `计算失败：${detail}`);
        });
        setResult(`本次全局条件测试未完成。\n\n${detail}`);
        setDetails(DEFAULT_DETAILS);
        activateOutputTab("result");
        console.error(error);
      } finally {
        setCalculating(false);
      }
    }

    function setBatchProgress(percent, text) {
      const rounded = Math.max(0, Math.min(100, Math.round(percent)));
      progressBar.style.width = `${rounded}%`;
      progressTrack.setAttribute("aria-valuenow", String(rounded));
      progressText.textContent = text;
    }

    function buildCharacterBatchOutput(characterName, equipmentResults) {
      const separator = "=".repeat(42);
      const lines = [`${characterName} · 四件装备联合计算`, separator];
      let totalExpectedCost = 0;

      equipmentResults.forEach(item => {
        if (item.skipped) {
          lines.push(`${item.label}：已勾选“不跑”，本次跳过`, "");
          return;
        }

        const expectedCost = item.exactSolution.value;
        totalExpectedCost += expectedCost;

        let actionText;
        if (expectedCost <= 1e-9) {
          actionText = "当前盘面已经满足目标";
        } else {
          actionText = item.exactSolution.firstActionText;
        }

        lines.push(
          `${item.label}：约需 ${expectedCost.toFixed(1)} 颗石头`,
          `  建议：${actionText}`,
          ""
        );
      });

      lines.push(
        separator,
        `未跳过装备合计期望：约 ${totalExpectedCost.toFixed(1)} 颗石头`,
        "（合计采用各装备有限状态 MDP 期望）",
        separator,
        resultFooter()
      );
      return lines.join("\n");
    }

    function buildCharacterBatchDetails(characterName, equipmentResults) {
      const lines = [
        `${characterName} · 四件装备计算明细`,
        "=".repeat(38)
      ];

      equipmentResults.forEach(item => {
        lines.push("", item.label, "-".repeat(24));
        if (item.skipped) {
          lines.push("本次已跳过。");
          return;
        }
        if (item.exactSolution) {
          lines.push(
            `有限状态 MDP 期望：${item.exactSolution.value.toFixed(6)} 颗石头`,
            `当前最佳动作：${item.exactSolution.firstActionText}`,
            `状态数量：${item.exactSolution.stateCount}；求解轮数：${item.exactSolution.iterations}`
          );
        }
      });

      lines.push("", "四件装备相互独立求解，总期望石头为所有未跳过装备期望值之和。");
      return lines.join("\n");
    }

    function buildIndependentRunRecord({
      characterName,
      equipmentResults,
      resultText,
      detailsText,
    }) {
      const savedEquipmentResults = equipmentResults.map((item, index) => ({
        index,
        label: item.label,
        skipped: Boolean(item.skipped),
        currentLines: compactCurrentLines(item.initialInput),
        targets: compactTargets(item.targetInput),
        expectedCost: equipmentExpectedCost(item),
        recommendation: equipmentRecommendation(item),
        optimalText: item.skipped ? "本次已跳过。" : inlineOptimalResultText(item),
      }));
      return {
        characterKey: selectedCharacterKey(),
        characterName,
        savedAt: Date.now(),
        mode: "equipment",
        algorithmMode: "exact",
        targetSummary: independentTargetSummary(equipmentResults),
        targetConfig: {
          equipments: equipmentResults.map(item => ({
            skipped: Boolean(item.skipped),
            targets: compactTargets(item.targetInput),
          })),
        },
        totalExpectedCost: savedEquipmentResults.reduce((sum, item) => sum + item.expectedCost, 0),
        equipmentResults: savedEquipmentResults,
        resultText,
        detailsText,
      };
    }

    function buildGlobalRunRecord({
      characterName,
      allEquipments,
      bestResult,
      conditions,
      resultText,
      detailsText,
    }) {
      const activeByIndex = new Map(
        bestResult.equipmentResults.map(item => [Number(item.index), item]),
      );
      const savedEquipmentResults = allEquipments.map((equipment, index) => {
        if (equipment.skipped) {
          return {
            index,
            label: equipment.label,
            skipped: true,
            currentLines: compactCurrentLines(equipment.initialInput),
            targets: [],
            expectedCost: 0,
            recommendation: "本次已跳过",
            optimalText: "本次已跳过。",
          };
        }
        const item = activeByIndex.get(Number(equipment.index));
        return {
          index,
          label: equipment.label,
          skipped: false,
          currentLines: compactCurrentLines(equipment.initialInput),
          targets: (item?.targets || []).map(target => ({
            stat: target.stat,
            tier: Number(target.tier || 0),
            flagged: true,
          })),
          expectedCost: Number(item?.exactSolution?.value || 0),
          recommendation: item?.exactSolution?.firstActionText || "—",
          optimalText: item ? inlineOptimalResultText(item) : "—",
        };
      });
      return {
        characterKey: selectedCharacterKey(),
        characterName,
        savedAt: Date.now(),
        mode: "global",
        algorithmMode: "exact",
        targetSummary: globalTargetSummary(conditions),
        targetConfig: {
          conditions: conditions.map(condition => ({
            stat: condition.stat,
            minCount: Number(condition.minCount || 0),
            minTotal: Number(condition.minTotal || 0),
          })),
          equipments: allEquipments.map(item => ({ skipped: Boolean(item.skipped), targets: [] })),
        },
        totalExpectedCost: Number(bestResult.totalExpectedCost || 0),
        equipmentResults: savedEquipmentResults,
        resultText,
        detailsText,
      };
    }

    async function runCharacterEquipmentBatch() {
      const allEquipments = readCharacterEquipmentInputs();
      const activeEquipments = allEquipments.filter(item => !item.skipped);
      const characterName = characterSelect.selectedOptions[0]?.textContent.trim() || "当前角色";

      if (!activeEquipments.length) {
        showMessage("四件装备都被勾选为“不跑”，请至少保留一件装备。", true);
        return;
      }
      for (const equipment of activeEquipments) {
        const validationError = validateInputs(equipment.initialInput, equipment.targetInput);
        if (validationError) {
          showMessage(`${equipment.label}：${validationError}`, true);
          return;
        }
      }

      showMessage("");
      allEquipments.forEach(equipment => {
        const output = characterEquipmentMode.querySelector(`[data-equipment-index="${equipment.index}"] .equipment-optimal-result`);
        setInlineOptimalResult(output, equipment.skipped ? "本次已跳过。" : "正在计算…", true);
      });
      setResult(`正在联合计算 ${activeEquipments.length} 件装备…`);
      setDetails("计算完成后，本页将显示每件装备的独立结果。\n");
      activateOutputTab("result");
      setProgress(0, 100);
      setCalculating(true);
      await nextFrame();

      try {
        runExactSelfChecks();
        const computedResults = [];
        for (let index = 0; index < activeEquipments.length; index += 1) {
          const equipment = activeEquipments[index];
          const segmentStart = index / activeEquipments.length * 100;
          const segmentEnd = (index + 1) / activeEquipments.length * 100;
          const exactModel = buildExactModel(equipment.targetInput);
          const exactInitialState = buildExactInitialState(equipment.initialInput, exactModel);
          setBatchProgress(segmentStart + 1, `${equipment.label} · 枚举有限状态 MDP…`);
          const exactSolution = await solveExactOptimal(exactInitialState, exactModel, (stage, current, detail) => {
            const localFraction = stage === "graph" ? 0.36 : 0.72;
            const percent = segmentStart + (segmentEnd - segmentStart) * localFraction;
            const text = stage === "graph"
              ? `${equipment.label} · 已检查 ${current} 个状态，发现 ${detail} 个状态…`
              : `${equipment.label} · 第 ${current} 轮求解，残差 ${Number(detail).toExponential(2)}…`;
            setBatchProgress(percent, text);
          }, true);
          const formulaResult = findFormulaFastPath(exactInitialState, exactModel);
          const computedResult = { ...equipment, exactSolution, formulaResult };
          computedResults.push(computedResult);
          const equipmentOutput = characterEquipmentMode.querySelector(`[data-equipment-index="${equipment.index}"] .equipment-optimal-result`);
          renderInlineOptimalResult(equipmentOutput, exactSolution);
          setBatchProgress(segmentEnd, `${equipment.label} · 计算完成`);
        }

        const computedByLabel = new Map(computedResults.map(item => [item.label, item]));
        const equipmentResults = allEquipments.map(item => item.skipped ? item : computedByLabel.get(item.label));
        const resultText = buildCharacterBatchOutput(characterName, equipmentResults);
        const detailsText = buildCharacterBatchDetails(characterName, equipmentResults);
        setResult(resultText);
        setDetails(detailsText);
        cacheCharacterExactSolutions(selectedCharacterKey(), "equipment", equipmentResults);
        await saveRunRecord(buildIndependentRunRecord({
          characterName,
          equipmentResults,
          resultText,
          detailsText,
        }));
        activateOutputTab("result");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        showMessage(`四件装备计算失败：${detail}`, true);
        characterEquipmentMode.querySelectorAll(".equipment-optimal-result").forEach(output => {
          if (output.textContent === "正在计算…") setInlineOptimalResult(output, `计算失败：${detail}`);
        });
        setResult(`本次联合计算未完成。\n\n${detail}`);
        setDetails(DEFAULT_DETAILS);
        activateOutputTab("result");
        console.error(error);
      } finally {
        setCalculating(false);
      }
    }

    async function runAlgorithmTest() {
      if (characterSelect.value !== "current") {
        if (calculationModeSelect.value === "global") {
          await runGlobalConditionBatch();
        } else {
          await runCharacterEquipmentBatch();
        }
        return;
      }
      const initialInput = readRows(initialRows);
      const targetInput = readRows(targetRows);
      const validationError = validateInputs(initialInput, targetInput);
      if (validationError) {
        showMessage(validationError, true);
        return;
      }
      showMessage("");
      setInlineOptimalResult(classicOptimalResult, "正在计算…", true);
      setResult("正在构建算法测试…");
      setDetails("计算完成后，本页将显示有限状态 MDP 的求解明细。");
      activateOutputTab("result");
      setProgress(0, 100);
      setCalculating(true);
      await nextFrame();

      try {
        runExactSelfChecks();
        const exactModel = buildExactModel(targetInput);
        const exactInitialState = buildExactInitialState(initialInput, exactModel);
        progressBar.style.width = "8%";
        progressText.textContent = "有限状态 MDP：枚举可达状态…";
        const exactSolution = await solveExactOptimal(exactInitialState, exactModel, (stage, current, detail) => {
          if (stage === "graph") {
            progressBar.style.width = "30%";
            progressTrack.setAttribute("aria-valuenow", "30");
            progressText.textContent = `有限状态 MDP：已检查 ${current} 个状态，当前发现 ${detail} 个状态…`;
          } else {
            progressBar.style.width = "70%";
            progressTrack.setAttribute("aria-valuenow", "70");
            progressText.textContent = `有限状态 MDP：第 ${current} 轮求解，残差 ${Number(detail).toExponential(2)}…`;
          }
        }, true);
        const formulaResult = findFormulaFastPath(exactInitialState, exactModel);
        setResult(buildExactResultOutput(exactSolution, targetInput));
        renderInlineOptimalResult(classicOptimalResult, exactSolution);
        setDetails(buildDetailsOutput({ exactSolution, formulaResult }));
        activateOutputTab("result");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        showMessage(`算法测试失败：${detail}`, true);
        setInlineOptimalResult(classicOptimalResult, `计算失败：${detail}`);
        setResult(`本次算法测试未完成。\n\n${detail}`);
        setDetails(DEFAULT_DETAILS);
        activateOutputTab("result");
        console.error(error);
      } finally {
        setCalculating(false);
      }
    }

    createRows(initialRows, 3, "initial");
    createRows(targetRows, 5, "target");
    resetGlobalConditions();
    setDetails(DEFAULT_DETAILS);
    resultTab.addEventListener("click", () => activateOutputTab("result"));
    detailsTab.addEventListener("click", () => activateOutputTab("details"));
    allResultsTab.addEventListener("click", () => activateOutputTab("all"));
    const outputTabs = [resultTab, detailsTab, allResultsTab];
    outputTabs.forEach(tab => {
      tab.addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const availableTabs = outputTabs.filter(item => !item.hidden);
        const index = availableTabs.indexOf(tab);
        if (index < 0) return;
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex = (index + offset + availableTabs.length) % availableTabs.length;
        const nextTab = availableTabs[nextIndex];
        const nextName = nextTab === resultTab ? "result" : nextTab === detailsTab ? "details" : "all";
        activateOutputTab(nextName, true);
      });
    });
    calculateButton.addEventListener("click", runAlgorithmTest);
    resetButton.addEventListener("click", resetAll);
    collectionSelect.addEventListener("change", () => {
      recommendationSelect.value = "";
      refreshCharacterSelect();
    });
    recommendationSelect.addEventListener("change", () => {
      if (recommendationSelect.value) collectionSelect.value = DEFAULT_COLLECTION_SELECTOR_ID;
      refreshCharacterSelect();
    });
    characterSelect.addEventListener("change", () => {
      if (characterSelect.value === "current") {
        showClassicEquipmentMode();
        return;
      }
      const character = selectedCharacter();
      if (character) showCharacterEquipmentMode(character);
    });
    document.addEventListener("click", event => {
      if (characterAdvice.open && !characterAdvice.contains(event.target)) characterAdvice.open = false;
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && characterAdvice.open) {
        characterAdvice.open = false;
        characterAdvice.querySelector("summary")?.focus();
      }
    });
    targetPresetSelect.addEventListener("change", () => {
      applyTargetPreset(targetPresetSelect.value);
    });
    globalTargetPresetSelect.addEventListener("change", () => {
      applyGlobalTargetPreset(globalTargetPresetSelect.value);
    });
    calculationModeSelect.addEventListener("change", () => {
      setCalculationMode(calculationModeSelect.value);
    });
    addGlobalConditionButton.addEventListener("click", () => {
      addGlobalCondition();
      globalTargetPresetSelect.value = "";
      clearGlobalPlanOutputs();
    });
    downloadAllResultsButton.addEventListener("click", downloadRunRecords);
    resultsSortSelect.addEventListener("change", renderRunRecords);
    loadRunRecords();
    loadCalculatorSnapshot();
    if (globalThis.chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local" && changes.calculatorData) {
          applyCalculatorSnapshot(changes.calculatorData.newValue);
        }
        if (areaName === "local" && changes[CALCULATOR_RUN_RECORDS_KEY]) {
          runRecordStore = normalizeRunRecordStore(changes[CALCULATOR_RUN_RECORDS_KEY].newValue);
          renderRunRecords();
        }
      });
    }

    if (document.documentElement.classList.contains("embedded") && window.parent !== window) {
      let lastPublishedHeight = 0;
      let publishFrameHeightRequest = 0;
      const publishFrameHeight = () => {
        publishFrameHeightRequest = 0;
        const height = Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight || 0,
        );
        if (height <= 0 || Math.abs(height - lastPublishedHeight) <= 1) return;
        lastPublishedHeight = height;
        window.parent.postMessage(
      { type: "NIKKE_WORKSHOP_CALCULATOR_FRAME_HEIGHT", height },
          window.location.origin,
        );
      };
      const scheduleFrameHeightPublish = () => {
        if (publishFrameHeightRequest) cancelAnimationFrame(publishFrameHeightRequest);
        publishFrameHeightRequest = requestAnimationFrame(publishFrameHeight);
      };
      const frameResizeObserver = new ResizeObserver(scheduleFrameHeightPublish);
      frameResizeObserver.observe(document.documentElement);
      frameResizeObserver.observe(document.body);
      window.addEventListener("load", scheduleFrameHeightPublish, { once: true });
      scheduleFrameHeightPublish();
    }

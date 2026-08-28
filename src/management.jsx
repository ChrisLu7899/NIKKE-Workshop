// SPDX-License-Identifier: GPL-3.0-or-later
// ========== NIKKE Workshop 管理页面组件 ==========
// 主要功能：账户管理、角色数据管理、装备统计配置等

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tabs,
  Tab,
  Snackbar,
  Alert,
} from "@mui/material";
import TRANSLATIONS from "./i18n/translations.js";
import { fetchAndCacheNikkeDirectory, getCachedNikkeDirectory } from "./services/api.js";
import { initializeLevelStats } from "./services/levelStats.js";
import {
  getCharacters,
  getCalculatorData,
  setCalculatorData,
  setSettings,
} from "./services/storage.js";
import { parseManualAreaId } from "./utils/areaId.js";
import {
  getNikkeArtworkCandidates as buildNikkeArtworkCandidates,
  getNikkeAvatarUrl as buildNikkeAvatarUrl,
} from "./utils/nikkeAvatar.js";
import { withChinaExclusiveCharacters } from "./data/chinaExclusiveCharacters.js";
import ManagementHeader from "./components/management/ManagementHeader.jsx";
import CharacterGalleryTabContent from "./components/management/CharacterGalleryTabContent.jsx";
import SettingsTabContent from "./components/management/SettingsTabContent.jsx";
import {
  elementTranslationKeys,
  classTranslationKeys,
  corporationTranslationKeys,
} from "./components/management/constants.js";
import { useTemplateManagement } from "./components/management/hooks/useTemplateManagement.js";
import { useCrawler } from "./components/app/hooks/useCrawler.js";
import {
  buildCalculatorSnapshot,
  buildUnifiedCalculatorSnapshot,
  extractSyncedCalculatorSnapshot,
  isVerifiedCalculatorSnapshot,
} from "./utils/calculatorSnapshot.js";
import {
  LOCAL_CHARACTER_ROSTER_STORAGE_KEY,
  getLocalCharacterRoster,
  setLocalCharacterRoster,
} from "./services/localCharacterRoster.js";
import {
  deleteLocalCharacterRecord,
  localRecordToCatalogCharacter,
  reconcileLocalCharactersAfterSync,
  saveLocalCharacterRecord,
} from "./domain/localCharacterRoster.js";
import { exportLocalGalleryBuffer, importLocalGalleryBuffer } from "./utils/localGalleryExcel.js";
import { isCommonCharacterTemplate } from "./data/commonCharacterList.js";
import { resolveCharacterDisplayName } from "./data/characterNameOverrides.js";
import {
  SYSTEM_COLLECTION_IDS,
  attachCalculatorCollections,
  buildCharactersConfig,
  filterAccountDictsToOwned,
} from "./utils/characterCollections.js";

// ========== 管理页面主组件 ==========

const ManagementPage = () => {
  const lang = "zh";
  const [forceSimulatedStatsLevel400, setForceSimulatedStatsLevel400] = useState(false);
  const [crawlerServer, setCrawlerServer] = useState("global");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calculatorFrameKey, setCalculatorFrameKey] = useState(0);
  const calculatorFrameRef = useRef(null);
  const [calculatorFrameHeight, setCalculatorFrameHeight] = useState(720);
  const [manualAreaId, setManualAreaId] = useState("");
  const [ownedSnapshot, setOwnedSnapshot] = useState(null);
  const [activeCollectionId, setActiveCollectionId] = useState(SYSTEM_COLLECTION_IDS.catalog);
  const [localRoster, setLocalRosterState] = useState({ schemaVersion: 1, records: [] });
  const [localRosterLoaded, setLocalRosterLoaded] = useState(false);
  const t = useCallback((k) => TRANSLATIONS.zh[k] || k, []);

  // ========== 核心状态管理 ==========
  const [tab, setTab] = useState(0);
  const [characters, setCharactersData] = useState({ 
    elements: { 
      Electronic: [], 
      Fire: [], 
      Wind: [], 
      Water: [], 
      Iron: [], 
      Utility: [] 
    },
    options: {
      showEquipDetails: true
    }
  });
  const [nikkeList, setNikkeList] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // 显示提示消息
  const showMessage = useCallback((message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  // ========== 使用自定义 Hooks ==========
  const templateManagement = useTemplateManagement({
    t,
    characters,
    setCharactersData,
    showMessage,
    enableAccountTemplates: false,
  });
  const ensureCommonTemplate = templateManagement.ensureCommonTemplate;

  const crawler = useCrawler({
    t,
    server: crawlerServer,
    forceSimulatedStatsLevel400,
  });
  const manualAreaIdInvalid = !parseManualAreaId(manualAreaId).valid;

  const nikkeResourceIdMap = useMemo(() => {
    const map = new Map();
    (nikkeList || []).forEach((n) => {
      if (!n) return;
      if (n.id === undefined || n.id === null) return;
      if (n.resource_id === undefined || n.resource_id === null || n.resource_id === "") return;
      map.set(n.id, n.resource_id);
    });
    return map;
  }, [nikkeList]);

  const iconUrl = useMemo(() => chrome.runtime.getURL("images/icon-128.png"), []);

  // ========== 工具函数 ==========
  const getElementName = useCallback((element) => {
    const key = elementTranslationKeys[element];
    return key ? t(key) : element;
  }, [t]);

  const getClassName = useCallback((className) => {
    const key = classTranslationKeys[className];
    return key ? t(key) : className;
  }, [t]);

  const getCorporationName = useCallback((corporation) => {
    const key = corporationTranslationKeys[corporation];
    return key ? t(key) : corporation;
  }, [t]);

  const getBurstStageName = useCallback((stage) => {
    switch (stage) {
      case "Step1":
        return t("burstStage1");
      case "Step2":
        return t("burstStage2");
      case "Step3":
        return t("burstStage3");
      case "AllStep":
        return t("burstStageAll");
      default:
        return stage || "—";
    }
  }, [t]);

  const getDisplayName = useCallback((nikke) => {
    return resolveCharacterDisplayName(nikke, lang);
  }, [lang]);

  const getNikkeAvatarUrl = useCallback((nikke) => {
    return buildNikkeAvatarUrl(nikke, nikkeResourceIdMap);
  }, [nikkeResourceIdMap]);

  const getNikkeArtworkCandidates = useCallback((nikke) => {
    return buildNikkeArtworkCandidates(nikke, nikkeResourceIdMap);
  }, [nikkeResourceIdMap]);

  const galleryNikkeList = useMemo(() => {
    const customCharacters = localRoster.records.filter((record) => record.custom).map(localRecordToCatalogCharacter);
    return withChinaExclusiveCharacters([...nikkeList, ...customCharacters]);
  }, [localRoster.records, nikkeList]);

  const persistLocalRecords = useCallback(async (records) => {
    const roster = await setLocalCharacterRoster({ schemaVersion: 1, records });
    setLocalRosterState(roster);
    return roster;
  }, []);

  const handleSaveLocalCharacter = useCallback(async ({ catalogCharacter, draft, custom, existingLocalId, source = null }) => {
    const result = saveLocalCharacterRecord(localRoster.records, {
      catalogCharacter, draft, custom, existingLocalId, source, catalog: nikkeList,
    });
    if (!result.errors.length) {
      await persistLocalRecords(result.records);
      showMessage(custom ? "自定义角色已保存" : "角色录入已保存", "success");
    }
    return result;
  }, [localRoster.records, nikkeList, persistLocalRecords, showMessage]);

  const handleSaveLocalCharacterBatch = useCallback(async (items, { sourceLabel = "图片识别" } = {}) => {
    let workingRecords = localRoster.records;
    const saved = [];
    const errors = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const result = saveLocalCharacterRecord(workingRecords, { ...item, catalog: nikkeList });
      if (result.errors.length) errors.push(...result.errors.map((message) => `${item.characterName || "角色"}：${message}`));
      else {
        workingRecords = result.records;
        saved.push(result.record);
      }
    });
    if (errors.length) return { saved: [], errors };
    await persistLocalRecords(workingRecords);
    showMessage(`${sourceLabel}数据已保存：${saved.length} 名角色`, "success");
    return { saved, errors: [] };
  }, [localRoster.records, nikkeList, persistLocalRecords, showMessage]);

  const handleDeleteLocalCharacter = useCallback(async (localId) => {
    await persistLocalRecords(deleteLocalCharacterRecord(localRoster.records, localId));
    showMessage("本地录入已删除，标准图鉴资料未受影响", "success");
  }, [localRoster.records, persistLocalRecords, showMessage]);

  const handleExportLocalGallery = useCallback(async (records) => {
    const scopedRecords = Array.isArray(records) ? records : [];
    if (!scopedRecords.length) {
      showMessage("当前列表没有可导出的角色数据", "warning");
      return;
    }
    const buffer = await exportLocalGalleryBuffer(scopedRecords, { includeSynced: true });
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `NIKKE-Workshop-图鉴-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click(); URL.revokeObjectURL(url);
    showMessage(`已导出当前列表中的 ${scopedRecords.length} 名角色`, "success");
  }, [showMessage]);

  const handleImportLocalGallery = useCallback(async (file) => {
    try {
      const result = await importLocalGalleryBuffer(await file.arrayBuffer(), {
        catalog: nikkeList, existingRecords: localRoster.records,
      });
      await persistLocalRecords(result.records);
      return result.summary;
    } catch (error) {
      showMessage(error?.message || "导入图鉴失败", "error");
      throw error;
    }
  }, [localRoster.records, nikkeList, persistLocalRecords, showMessage]);

  const toggleForceSimulatedStatsLevel400 = useCallback((e) => {
    const next = e.target.checked;
    setForceSimulatedStatsLevel400(next);
    setSettings({ forceSimulatedStatsLevel400: next });
  }, []);

  const handleFetchCharacterData = useCallback(async () => {
    if (!window.confirm("同步成功后，标准图鉴角色的手动数据将被账号数据覆盖；自定义角色不会受到影响。")) return;
    const charactersOverride = buildCharactersConfig(nikkeList, {
      showEquipDetails: characters?.options?.showEquipDetails !== false,
    });
    const outcome = await crawler.handleStart({
      manualAreaId,
      charactersOverride,
    });
    if (outcome?.successAccountCount > 0 && outcome.accountDicts?.length && !outcome.error) {
      const commonResult = await ensureCommonTemplate(nikkeList);
      const currentTemplates = commonResult?.templates || templateManagement.templates;
      const currentCommonTemplate = commonResult?.template
        || currentTemplates.find(isCommonCharacterTemplate)
        || null;
      const commonCollectionId = currentCommonTemplate
        ? `template:${currentCommonTemplate.id}`
        : SYSTEM_COLLECTION_IDS.owned;
      const ownedAccountDicts = filterAccountDictsToOwned(outcome.accountDicts);
      const syncedSnapshot = buildCalculatorSnapshot(ownedAccountDicts);
      const reconciliation = reconcileLocalCharactersAfterSync(localRoster.records, syncedSnapshot, nikkeList);
      await persistLocalRecords(reconciliation.records);
      const snapshot = attachCalculatorCollections(
        buildUnifiedCalculatorSnapshot(syncedSnapshot, reconciliation.records),
        currentTemplates,
        commonCollectionId,
      );
      const calculatorCharacterCount = syncedSnapshot.accounts.reduce(
        (sum, account) => sum + account.characters.length,
        0,
      );
      if (calculatorCharacterCount > 0) {
        await setCalculatorData(snapshot);
        setOwnedSnapshot(syncedSnapshot);
        setCalculatorFrameKey((current) => current + 1);
        if (currentCommonTemplate) {
          await templateManagement.handleTemplateChange(currentCommonTemplate.id);
        }
        setActiveCollectionId(commonCollectionId);
        showMessage(`${t("characterDataReady")}；覆盖 ${reconciliation.summary.overwrittenStandardCount} 条标准角色录入，保留 ${reconciliation.summary.retainedCustomCount} 个自定义角色`, "success");
        return;
      }
    }
    showMessage(outcome?.error || t("characterDataFailed"), "warning");
  }, [characters?.options?.showEquipDetails, crawler, ensureCommonTemplate, localRoster.records, manualAreaId, nikkeList, persistLocalRecords, showMessage, t, templateManagement]);

  const handleCollectionChange = useCallback(async (collectionId) => {
    if (String(collectionId).startsWith("template:")) {
      const templateId = String(collectionId).slice("template:".length);
      await templateManagement.handleTemplateChange(templateId);
    }
    setActiveCollectionId(collectionId);
  }, [templateManagement]);

  const handleDeleteCollection = useCallback(async (templateId) => {
    await templateManagement.handleDeleteTemplate(templateId);
    if (activeCollectionId === `template:${templateId}`) {
      setActiveCollectionId(ownedSnapshot ? SYSTEM_COLLECTION_IDS.owned : SYSTEM_COLLECTION_IDS.catalog);
    }
  }, [activeCollectionId, ownedSnapshot, templateManagement]);

  useEffect(() => {
    const handleCalculatorFrameHeight = (event) => {
      const frame = calculatorFrameRef.current;
      if (
        !frame
        || event.source !== frame.contentWindow
        || event.origin !== window.location.origin
          || event.data?.type !== "NIKKE_WORKSHOP_CALCULATOR_FRAME_HEIGHT"
      ) {
        return;
      }

      const reportedHeight = Number(event.data.height);
      if (!Number.isFinite(reportedHeight) || reportedHeight <= 0) return;
      const nextHeight = Math.max(720, Math.ceil(reportedHeight));
      setCalculatorFrameHeight((currentHeight) => (
        Math.abs(currentHeight - nextHeight) > 1 ? nextHeight : currentHeight
      ));
    };

    window.addEventListener("message", handleCalculatorFrameHeight);
    return () => window.removeEventListener("message", handleCalculatorFrameHeight);
  }, []);

  const commonTemplateInitializedRef = useRef(false);
  useEffect(() => {
    if (!nikkeList.length || commonTemplateInitializedRef.current) return;
    commonTemplateInitializedRef.current = true;
    ensureCommonTemplate(nikkeList).then((result) => {
      if (result?.missing?.length) {
        console.warn("常用列表存在目录中未找到的妮姬:", result.missing);
      }
    }).catch((error) => {
      commonTemplateInitializedRef.current = false;
      console.warn("初始化常用列表失败:", error);
    });
  }, [ensureCommonTemplate, nikkeList]);

  // ========== 初始化 Effects ==========
  useEffect(() => {
    initializeLevelStats().catch((error) => {
      console.warn("共享等级曲线初始化失败:", error);
    });
  }, []);

  useEffect(() => {
    getCalculatorData().then((snapshot) => {
      if (!isVerifiedCalculatorSnapshot(snapshot)) return;
      const syncedSnapshot = extractSyncedCalculatorSnapshot(snapshot);
      const hasOwnedCharacters = syncedSnapshot.accounts
        .some((account) => Array.isArray(account?.characters) && account.characters.length > 0);
      if (hasOwnedCharacters) {
        setOwnedSnapshot(syncedSnapshot);
      }
    }).catch((error) => {
      console.warn("读取已获取妮姬数据失败:", error);
    });
  }, []);

  useEffect(() => {
    getLocalCharacterRoster().then((roster) => {
      setLocalRosterState(roster); setLocalRosterLoaded(true);
    }).catch((error) => {
      console.warn("读取本地图鉴失败:", error); setLocalRosterLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!globalThis.chrome?.storage?.onChanged) return undefined;
    const handleRosterChange = (changes, areaName) => {
      if (areaName !== "local" || !changes[LOCAL_CHARACTER_ROSTER_STORAGE_KEY]) return;
      getLocalCharacterRoster().then((roster) => {
        setLocalRosterState(roster);
        setLocalRosterLoaded(true);
      }).catch((error) => console.warn("刷新本地图鉴失败:", error));
    };
    chrome.storage.onChanged.addListener(handleRosterChange);
    return () => chrome.storage.onChanged.removeListener(handleRosterChange);
  }, []);

  useEffect(() => {
    if (!localRosterLoaded) return;
    const unified = attachCalculatorCollections(
      buildUnifiedCalculatorSnapshot(ownedSnapshot, localRoster.records),
      templateManagement.templates,
      activeCollectionId === SYSTEM_COLLECTION_IDS.catalog ? SYSTEM_COLLECTION_IDS.recorded : activeCollectionId,
    );
    setCalculatorData(unified).catch((error) => console.warn("更新统一计算器数据失败:", error));
  }, [activeCollectionId, localRoster.records, localRosterLoaded, ownedSnapshot, templateManagement.templates]);

  // 管理页 Tab 持久化
  useEffect(() => {
    chrome.storage.local.get(["managementTab", "managementLayoutVersion"], (r) => {
      const saved = Number(r.managementTab);
      if (r.managementLayoutVersion === 2 && (saved === 0 || saved === 1)) {
        setTab(saved);
      } else {
        setTab(0);
        chrome.storage.local.set({ managementTab: 0, managementLayoutVersion: 2 });
      }
    });
  }, []);

  const handleManagementTabChange = useCallback(async (e, newTab) => {
    if (newTab === 0 || newTab === 1) {
      if (newTab === 1) {
        if (ownedSnapshot || localRoster.records.length) {
          const calculatorSnapshot = attachCalculatorCollections(
            buildUnifiedCalculatorSnapshot(ownedSnapshot, localRoster.records),
            templateManagement.templates,
            activeCollectionId === SYSTEM_COLLECTION_IDS.catalog
              ? (ownedSnapshot ? SYSTEM_COLLECTION_IDS.owned : SYSTEM_COLLECTION_IDS.recorded)
              : activeCollectionId,
          );
          await setCalculatorData(calculatorSnapshot);
        }
        setCalculatorFrameHeight(720);
        setCalculatorFrameKey((current) => current + 1);
      }
      setTab(newTab);
      chrome.storage.local.set({ managementTab: newTab, managementLayoutVersion: 2 });
    }
  }, [activeCollectionId, localRoster.records, ownedSnapshot, templateManagement.templates]);

  const handleOpenCharacterCalculator = useCallback(async ({ characterCode, collectionId }) => {
    const preferredCollectionId = collectionId === SYSTEM_COLLECTION_IDS.catalog
      ? (ownedSnapshot ? SYSTEM_COLLECTION_IDS.owned : SYSTEM_COLLECTION_IDS.recorded)
      : collectionId;
    const calculatorSnapshot = attachCalculatorCollections(
      buildUnifiedCalculatorSnapshot(ownedSnapshot, localRoster.records),
      templateManagement.templates,
      preferredCollectionId,
      characterCode,
    );
    await setCalculatorData(calculatorSnapshot);
    setCalculatorFrameHeight(720);
    setCalculatorFrameKey((current) => current + 1);
    setTab(1);
    chrome.storage.local.set({ managementTab: 1, managementLayoutVersion: 2 });
  }, [localRoster.records, ownedSnapshot, templateManagement.templates]);

  // 本地设置初始化
  useEffect(() => {
    chrome.storage.local.get("settings", (r) => {
      const nextSettings = r.settings || {};
      setForceSimulatedStatsLevel400(Boolean(nextSettings.forceSimulatedStatsLevel400));
      setManualAreaId(String(nextSettings.manualAreaId || ""));
      setCrawlerServer(nextSettings.server || "global");
    });
    const handler = (c, area) => {
      if (area === "local" && c.settings) {
        const nextSettings = c.settings.newValue || {};
        setForceSimulatedStatsLevel400(Boolean(nextSettings.forceSimulatedStatsLevel400));
        setManualAreaId(String(nextSettings.manualAreaId || ""));
        setCrawlerServer(nextSettings.server || "global");
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // 角色数据初始化
  useEffect(() => {
    getCharacters().then(data => {
      const fallback = {
        elements: {
          Electronic: [], Fire: [], Wind: [], Water: [], Iron: [], Utility: []
        },
        options: {
          showEquipDetails: true
        }
      };
      const valid = (data && data.elements && typeof data.elements === 'object') ? data : fallback;
      const merged = {
        ...fallback,
        ...valid,
        options: {
          showEquipDetails: valid?.options?.showEquipDetails !== false
        }
      };
      setCharactersData(merged);
    });

    (async () => {
      const online = await fetchAndCacheNikkeDirectory();
      if (Array.isArray(online) && online.length) {
        setNikkeList(online);
      } else {
        const cached = await getCachedNikkeDirectory();
        setNikkeList(cached || []);
      }
    })();
  }, []);

  /* ---------- 渲染 ---------- */
  return (
    <>
      <ManagementHeader
        iconUrl={iconUrl}
      />
      
      <Container maxWidth={false} sx={{ mt: 3, px: { xs: 2, md: 3 }, pb: 4 }}>
        <Tabs value={tab} onChange={handleManagementTabChange} sx={{ mb: 3 }} aria-label={t("management")}>
          <Tab label={t("characterManagement")} />
          <Tab label={t("openCalculator")} />
        </Tabs>
        {tab === 0 && (
          <CharacterGalleryTabContent
            t={t}
            lang={lang}
            nikkeList={galleryNikkeList}
            standardCatalog={nikkeList}
            localRecords={localRoster.records}
            onSaveLocalCharacter={handleSaveLocalCharacter}
            onSaveLocalCharacterBatch={handleSaveLocalCharacterBatch}
            onDeleteLocalCharacter={handleDeleteLocalCharacter}
            onImportLocalGallery={handleImportLocalGallery}
            onExportLocalGallery={handleExportLocalGallery}
            templates={templateManagement.templates}
            defaultTemplateId={templateManagement.defaultTemplateId}
            selectedTemplateId={templateManagement.selectedTemplateId}
            activeCollectionId={activeCollectionId}
            onCollectionChange={handleCollectionChange}
            isRenaming={templateManagement.isRenaming}
            renameId={templateManagement.renameId}
            renameValue={templateManagement.renameValue}
            setRenameValue={templateManagement.setRenameValue}
            confirmRename={templateManagement.confirmRename}
            setIsRenaming={templateManagement.setIsRenaming}
            setRenameId={templateManagement.setRenameId}
            startRenameTemplate={templateManagement.startRenameTemplate}
            handleDuplicateTemplate={templateManagement.handleDuplicateTemplate}
            handleDeleteTemplate={handleDeleteCollection}
            handleCreateTemplateFromData={templateManagement.handleCreateTemplateFromData}
            handleUpdateTemplateData={templateManagement.handleUpdateTemplateData}
            getElementName={getElementName}
            getClassName={getClassName}
            getCorporationName={getCorporationName}
            getBurstStageName={getBurstStageName}
            getNikkeAvatarUrl={getNikkeAvatarUrl}
            getNikkeArtworkCandidates={getNikkeArtworkCandidates}
            getDisplayName={getDisplayName}
            ownedSnapshot={ownedSnapshot}
            fetchLoading={crawler.loading}
            onFetchCharacterData={handleFetchCharacterData}
            onOpenSettings={() => setSettingsOpen(true)}
            actionsDisabled={manualAreaIdInvalid}
            syncBlockedReason={crawler.crawlBlockedReason}
            onOpenCharacterCalculator={handleOpenCharacterCalculator}
          />
        )}
        <Box
          component="iframe"
          ref={calculatorFrameRef}
          key={calculatorFrameKey}
          src={`${chrome.runtime.getURL("calculator.html")}?embedded=1`}
          title={t("openCalculator")}
          scrolling="no"
          aria-hidden={tab !== 1}
          sx={{
            display: tab === 1 ? "block" : "none",
            width: "100%",
            height: `${calculatorFrameHeight}px`,
            minHeight: 720,
            border: 0,
            bgcolor: "background.default",
          }}
        />
      </Container>

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t("managementSettings")}</DialogTitle>
        <DialogContent dividers>
          <SettingsTabContent
              t={t}
              forceSimulatedStatsLevel400={forceSimulatedStatsLevel400}
              onToggleForceSimulatedStatsLevel400={toggleForceSimulatedStatsLevel400}
            />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>{t("confirm")}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ManagementPage;

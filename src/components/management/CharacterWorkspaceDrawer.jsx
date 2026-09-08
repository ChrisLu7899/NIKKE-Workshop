// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Divider, Drawer, FormControl, FormControlLabel,
  IconButton, InputLabel, MenuItem, Select, Slider, Stack, Tab, Tabs, Tooltip, Typography, useMediaQuery,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import CloseIcon from "@mui/icons-material/Close";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import TuneIcon from "@mui/icons-material/Tune";
import ViewAgendaOutlinedIcon from "@mui/icons-material/ViewAgendaOutlined";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import CharacterCard from "./CharacterCard.jsx";
import CharacterDataEditor from "./CharacterDataEditor.jsx";
import { buildCharacterCardData } from "../../domain/characterCard.js";
import {
  DEFAULT_CHARACTER_CARD_MODULES,
  getCharacterCardPreference,
  normalizeCharacterCardPreference,
  resolveCharacterCardPreference,
  setCharacterCardPreference,
} from "../../services/characterCardPreferences.js";
import { downloadCharacterCardPng } from "../../utils/characterCardDownload.js";
import {
  CHARACTER_CARD_WIDTH, CHARACTER_CARD_HEIGHT, CHARACTER_CARD_TOOLBAR_HEIGHT,
  CHARACTER_CARD_COMPACT_TOOLBAR_HEIGHT, DEFAULT_ARTWORK_TRANSFORM,
  CHARACTER_CARD_COMPACT_TOOLBAR_QUERY,
  CHARACTER_CARD_POSITION_STEP as POSITION_STEP, CHARACTER_CARD_SCALE_RANGE,
  CHARACTER_CARD_MODULE_OPTIONS,
} from "../../domain/characterCardLayout.js";

const TABS = [
  { label: "角色卡", icon: <ViewAgendaOutlinedIcon /> },
  { label: "角色数据", icon: <BadgeOutlinedIcon /> },
];

const ARTWORK_CONTROL_BUTTON_SX = {
  width: 44,
  height: 44,
  border: "1px solid",
  borderColor: "divider",
  bgcolor: "#f7f9fb",
  color: "text.secondary",
  "&:hover": { bgcolor: "#edf4fb", color: "primary.main", borderColor: "primary.light" },
};

export default function CharacterWorkspaceDrawer({
  open,
  onClose,
  characterCode,
  catalogCharacter,
  characterData,
  localRecord,
  artworkCandidates,
  catalogOptions,
  optionLabels,
  onSave,
  onDelete,
  onOpenCalculator,
}) {
  const compactToolbar = useMediaQuery(CHARACTER_CARD_COMPACT_TOOLBAR_QUERY);
  const toolbarHeight = compactToolbar ? CHARACTER_CARD_COMPACT_TOOLBAR_HEIGHT : CHARACTER_CARD_TOOLBAR_HEIGHT;
  const drawerWidth = `min(${CHARACTER_CARD_WIDTH}px, calc((100dvh - ${toolbarHeight}px) * ${CHARACTER_CARD_WIDTH / CHARACTER_CARD_HEIGHT}))`;
  const [tab, setTab] = useState(0);
  const [artworkPanelOpen, setArtworkPanelOpen] = useState(false);
  const [downloadState, setDownloadState] = useState({ status: "idle", message: "" });
  const cardRef = useRef(null);
  const downloadController = useRef(null);
  const preferenceRef = useRef(normalizeCharacterCardPreference());
  const [preference, setPreference] = useState(preferenceRef.current);
  const [preferenceState, setPreferenceState] = useState({ code: null, status: "loading", message: "" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const saveRevision = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; downloadController.current?.abort(); };
  }, []);

  useEffect(() => {
    let active = true;
    getCharacterCardPreference(characterCode).then((stored) => {
      if (active) {
        setPreference(stored);
        preferenceRef.current = stored;
        setPreferenceState({ code: characterCode, status: "ready", message: "" });
        setDownloadState({ status: "idle", message: "" });
      }
    }).catch(() => {
      if (active) setPreferenceState({ code: characterCode, status: "load-error", message: "无法读取构图偏好，请重试。" });
    });
    return () => { active = false; };
  }, [characterCode, loadAttempt]);

  const cardData = useMemo(() => buildCharacterCardData(catalogCharacter, characterData), [catalogCharacter, characterData]);
  const { favoriteItemRarity, name: characterName } = cardData;
  const visibleArtworkCandidates = useMemo(() => (
    (Array.isArray(artworkCandidates) ? artworkCandidates : [])
      .filter((candidate) => candidate.id !== "favorite-item" || favoriteItemRarity === "SSR")
  ), [artworkCandidates, favoriteItemRarity]);
  const effectivePreference = useMemo(() => resolveCharacterCardPreference(preference, visibleArtworkCandidates), [preference, visibleArtworkCandidates]);
  const selectedArtwork = visibleArtworkCandidates.find((item) => item.id === effectivePreference.artworkId) || null;
  const preferenceReady = preferenceState.code === characterCode && ["ready", "saving", "save-error"].includes(preferenceState.status);

  const savePreference = (next) => {
    const revision = ++saveRevision.current;
    setPreferenceState({ code: characterCode, status: "saving", message: "" });
    void setCharacterCardPreference(characterCode, next).then(() => {
      if (mounted.current && revision === saveRevision.current) setPreferenceState({ code: characterCode, status: "ready", message: "" });
    }).catch(() => {
      if (mounted.current && revision === saveRevision.current) setPreferenceState({ code: characterCode, status: "save-error", message: "当前调整尚未保存，请重试。" });
    });
  };

  const persistPreference = (update, shouldPersist = true) => {
    if (!preferenceReady) return;
    const current = resolveCharacterCardPreference(preferenceRef.current, visibleArtworkCandidates);
    const next = normalizeCharacterCardPreference(typeof update === "function" ? update(current) : update);
    preferenceRef.current = next;
    setPreference(next);
    // Storage writes must not be side effects inside React state updaters.
    if (shouldPersist) savePreference(next);
  };

  const selectArtwork = (artworkId) => {
    persistPreference((current) => {
      const transform = current.artworkTransforms?.[artworkId] || DEFAULT_ARTWORK_TRANSFORM;
      return { ...current, artworkId, ...transform };
    });
  };

  const updateArtworkTransform = (patch, shouldPersist = true) => {
    persistPreference((current) => {
      const currentTransform = current.artworkTransforms?.[current.artworkId] || current;
      const nextTransform = {
        objectPositionX: Math.max(0, Math.min(100, Number(patch.objectPositionX ?? currentTransform.objectPositionX ?? 50))),
        objectPositionY: Math.max(-50, Math.min(50, Number(patch.objectPositionY ?? currentTransform.objectPositionY ?? 0))),
        artworkScale: Math.max(CHARACTER_CARD_SCALE_RANGE.min, Math.min(CHARACTER_CARD_SCALE_RANGE.max, Number(patch.artworkScale ?? currentTransform.artworkScale ?? 100))),
      };
      return {
        ...current,
        ...nextTransform,
        artworkTransforms: {
          ...current.artworkTransforms,
          [current.artworkId]: nextTransform,
        },
      };
    }, shouldPersist);
  };

  const nudgeArtwork = (xDelta, yDelta) => {
    const current = resolveCharacterCardPreference(preferenceRef.current, visibleArtworkCandidates);
    updateArtworkTransform({
      objectPositionX: current.objectPositionX + xDelta,
      objectPositionY: current.objectPositionY + yDelta,
    });
  };

  const toggleArtworkPanel = () => {
    if (tab !== 0) {
      setTab(0);
      setArtworkPanelOpen(true);
      return;
    }
    setArtworkPanelOpen((current) => !current);
  };

  const toggleCardModule = (moduleKey) => {
    persistPreference((current) => ({
      ...current,
      visibleModules: {
        ...DEFAULT_CHARACTER_CARD_MODULES,
        ...current.visibleModules,
        [moduleKey]: current.visibleModules?.[moduleKey] === false,
      },
    }));
  };

  const handleDownloadCharacterCard = async () => {
    if (downloadController.current || !preferenceReady) return;
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloadState({ status: "loading", message: "" });
    try {
      await downloadCharacterCardPng(cardRef.current, characterName, { signal: controller.signal });
      if (mounted.current) setDownloadState({ status: "success", message: "角色卡已生成，浏览器将开始下载。" });
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setDownloadState({ status: "error", message: error?.message || "下载失败，请稍后重试。" });
    } finally {
      if (downloadController.current === controller) downloadController.current = null;
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { display: "flex", width: { xs: "100vw", sm: drawerWidth }, maxWidth: "100vw", height: "100dvh", overflow: "visible", bgcolor: "background.paper" } }}
    >
      <Box sx={{ zIndex: 3, flex: "none", bgcolor: "background.paper", boxShadow: "0 2px 6px rgba(30, 38, 45, 0.12)" }}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ height: toolbarHeight, boxSizing: "border-box", flexWrap: compactToolbar ? "wrap" : "nowrap", px: { xs: 1, sm: 2 }, py: compactToolbar ? 0.25 : 0 }}>
          <Tabs
            value={tab}
            onChange={(_, value) => { setTab(value); if (value !== 0) setArtworkPanelOpen(false); }}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="角色工作区"
            sx={{ flex: compactToolbar ? "1 0 100%" : 1, minWidth: 0, minHeight: 48, "& .MuiTab-root": { minHeight: 48, minWidth: 104 } }}
          >
            {TABS.map((item, index) => <Tab key={item.label} id={`character-tab-${index}`} aria-controls={`character-panel-${index}`} icon={item.icon} iconPosition="start" label={item.label} />)}
          </Tabs>
          <Button
            size="small"
            startIcon={<TuneIcon />}
            disabled={!characterData}
            onClick={onOpenCalculator}
            sx={{ flex: "none", minHeight: 44, whiteSpace: "nowrap" }}
          >
            洗词条
          </Button>
          <Button
            size="small"
            startIcon={<ImageOutlinedIcon />}
            color={artworkPanelOpen ? "primary" : "inherit"}
            aria-pressed={artworkPanelOpen}
            aria-expanded={artworkPanelOpen}
            aria-controls="character-artwork-panel"
            onClick={toggleArtworkPanel}
            sx={{ flex: "none", minHeight: 44, whiteSpace: "nowrap" }}
          >
            调整背景
          </Button>
          <IconButton sx={{ width: 44, height: 44, ml: compactToolbar ? "auto" : 0 }} onClick={onClose} aria-label="关闭角色工作区"><CloseIcon /></IconButton>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: tab === 0 ? "hidden" : "auto", bgcolor: tab === 0 ? "#eef1f3" : "background.paper" }}>
        {tab === 0 ? (
          <Box role="tabpanel" id="character-panel-0" aria-labelledby="character-tab-0" sx={{ boxSizing: "border-box", width: "100%", height: "100%" }}>
            <CharacterCard
              cardRef={cardRef}
              catalogCharacter={catalogCharacter}
              characterData={characterData}
              preparedData={cardData}
              artworkUrl={selectedArtwork?.url || ""}
              artworkPreference={effectivePreference}
              visibleModules={effectivePreference.visibleModules}
              squareArtwork={selectedArtwork?.id?.startsWith("lobby-burst-")}
            />
          </Box>
        ) : null}

        {tab === 1 ? (
          <Box role="tabpanel" id="character-panel-1" aria-labelledby="character-tab-1" sx={{ boxSizing: "border-box", minHeight: "100%", p: { xs: 2, sm: 3 }, bgcolor: "background.paper" }}>
            <CharacterDataEditor
              key={`${characterCode}:${localRecord?.updatedAt || "new"}`}
              embedded
              catalogCharacter={catalogCharacter}
              record={localRecord}
              initialCharacterData={characterData}
              custom={Boolean(catalogCharacter?._isCustom)}
              catalogOptions={catalogOptions}
              optionLabels={optionLabels}
              onSave={onSave}
              onDelete={onDelete}
            />
          </Box>
        ) : null}
      </Box>

      {artworkPanelOpen && tab === 0 ? (
        <Box
          role="dialog"
          id="character-artwork-panel"
          aria-label="调整角色卡背景"
          sx={{
            position: "absolute",
            zIndex: 2,
            top: toolbarHeight,
            right: { xs: 0, md: "100%" },
            bottom: 0,
            boxSizing: "border-box",
            width: { xs: "min(82vw, 272px)", md: 260 },
            p: 2,
            overflowY: "auto",
            borderRight: { xs: 0, md: "1px solid" },
            borderLeft: { xs: "1px solid", md: 0 },
            borderColor: "divider",
            bgcolor: "background.paper",
            boxShadow: "-8px 12px 22px rgba(28, 34, 40, 0.18)",
          }}
        >
          <Button
            fullWidth
            variant="contained"
            startIcon={<DownloadOutlinedIcon />}
            disabled={downloadState.status === "loading" || !preferenceReady}
            onClick={handleDownloadCharacterCard}
          >
            {downloadState.status === "loading" ? "正在生成角色卡…" : "下载角色卡"}
          </Button>
          {downloadState.message ? (
            <Alert severity={downloadState.status === "error" ? "error" : "success"} sx={{ mt: 1 }}>
              {downloadState.message}
            </Alert>
          ) : null}
          {preferenceState.message ? <Alert severity="warning" sx={{ mt: 1 }} action={
            <Button color="inherit" size="small" onClick={() => {
              if (preferenceState.status === "save-error") savePreference(resolveCharacterCardPreference(preferenceRef.current, visibleArtworkCandidates));
              else { setPreferenceState({ code: characterCode, status: "loading", message: "" }); setLoadAttempt((attempt) => attempt + 1); }
            }}>重试</Button>
          }>{preferenceState.message}</Alert> : null}

          <Box component="fieldset" disabled={!preferenceReady} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>

          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mt: 2 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>调整背景</Typography>
              <Typography variant="caption" color="text.secondary">每套皮肤独立保存</Typography>
            </Box>
            <Tooltip title="恢复当前皮肤默认构图">
              <IconButton disabled={!selectedArtwork} size="small" aria-label="恢复当前皮肤默认构图" onClick={() => updateArtworkTransform(DEFAULT_ARTWORK_TRANSFORM)}><RestartAltIcon /></IconButton>
            </Tooltip>
          </Stack>

          {visibleArtworkCandidates.length ? (
            <>
              <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                <InputLabel id="character-artwork-select-label">背景素材</InputLabel>
                <Select
                  labelId="character-artwork-select-label"
                  label="背景素材"
                  value={selectedArtwork?.id || ""}
                  onChange={(event) => selectArtwork(event.target.value)}
                >
                  {visibleArtworkCandidates.map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
                </Select>
              </FormControl>

              <Box sx={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", justifyItems: "center", gap: 1, mt: 3 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1, textAlign: "center" }}>位置</Typography>
                  <Box
                    role="group"
                    aria-label="移动立绘"
                    sx={{ display: "grid", width: 140, gridTemplateColumns: "repeat(3, 44px)", gridTemplateRows: "repeat(3, 44px)", gap: "4px" }}
                  >
                    <Box />
                    <Tooltip title="向上移动"><IconButton size="small" sx={ARTWORK_CONTROL_BUTTON_SX} aria-label="向上移动立绘" onClick={() => nudgeArtwork(0, -POSITION_STEP)}><ArrowUpwardIcon fontSize="small" /></IconButton></Tooltip>
                    <Box />
                    <Tooltip title="向左移动"><IconButton size="small" sx={ARTWORK_CONTROL_BUTTON_SX} aria-label="向左移动立绘" onClick={() => nudgeArtwork(-POSITION_STEP, 0)}><ArrowBackIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="位置居中"><IconButton size="small" sx={{ ...ARTWORK_CONTROL_BUTTON_SX, bgcolor: "#e8f2fc", color: "primary.main" }} aria-label="立绘位置居中" onClick={() => updateArtworkTransform({ objectPositionX: 50, objectPositionY: 0 })}><CenterFocusStrongIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="向右移动"><IconButton size="small" sx={ARTWORK_CONTROL_BUTTON_SX} aria-label="向右移动立绘" onClick={() => nudgeArtwork(POSITION_STEP, 0)}><ArrowForwardIcon fontSize="small" /></IconButton></Tooltip>
                    <Box />
                    <Tooltip title="向下移动"><IconButton size="small" sx={ARTWORK_CONTROL_BUTTON_SX} aria-label="向下移动立绘" onClick={() => nudgeArtwork(0, POSITION_STEP)}><ArrowDownwardIcon fontSize="small" /></IconButton></Tooltip>
                    <Box />
                  </Box>
                </Box>

                <Stack alignItems="center" sx={{ height: 190 }}>
                  <ZoomInIcon fontSize="small" color="action" />
                  <Slider
                    orientation="vertical"
                    min={CHARACTER_CARD_SCALE_RANGE.min}
                    max={CHARACTER_CARD_SCALE_RANGE.max}
                    step={1}
                    value={effectivePreference.artworkScale}
                    onChange={(_, value) => updateArtworkTransform({ artworkScale: value }, false)}
                    onChangeCommitted={(_, value) => updateArtworkTransform({ artworkScale: value })}
                    aria-label="立绘缩放"
                    sx={{ flex: 1, my: 1 }}
                  />
                  <ZoomOutIcon fontSize="small" color="action" />
                </Stack>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                偏移 {Math.round(effectivePreference.objectPositionX - 50)}% / {Math.round(effectivePreference.objectPositionY)}% · 缩放 {Math.round(effectivePreference.artworkScale)}%
              </Typography>
            </>
          ) : <Alert severity="info" sx={{ mt: 2 }}>当前角色没有可用的本地立绘，仍可设置显示模块并下载。</Alert>}
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={700}>显示模块</Typography>
              <Box
                role="group"
                aria-label="角色卡显示模块"
                sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 1, mt: 0.5 }}
              >
                {CHARACTER_CARD_MODULE_OPTIONS.map((item) => (
                  <FormControlLabel
                    key={item.key}
                    control={(
                      <Checkbox
                        size="small"
                        checked={effectivePreference.visibleModules?.[item.key] !== false}
                        onChange={() => toggleCardModule(item.key)}
                      />
                    )}
                    label={item.label}
                    sx={{ m: 0, minWidth: 0, "& .MuiFormControlLabel-label": { fontSize: 12.5, whiteSpace: "nowrap" } }}
                  />
                ))}
              </Box>
          </Box>
        </Box>
      ) : null}
    </Drawer>
  );
}

// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Drawer, FormControl, IconButton, InputLabel, MenuItem, Select,
  Slider, Stack, Tab, Tabs, Tooltip, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import CloseIcon from "@mui/icons-material/Close";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import TuneIcon from "@mui/icons-material/Tune";
import ViewAgendaOutlinedIcon from "@mui/icons-material/ViewAgendaOutlined";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import CharacterCard from "./CharacterCard.jsx";
import CharacterDataEditor from "./CharacterDataEditor.jsx";
import {
  getCharacterCardPreference,
  setCharacterCardPreference,
} from "../../services/characterCardPreferences.js";

const TABS = [
  { label: "角色卡", icon: <ViewAgendaOutlinedIcon /> },
  { label: "角色数据", icon: <BadgeOutlinedIcon /> },
];

const DEFAULT_ARTWORK_TRANSFORM = Object.freeze({ objectPositionX: 50, objectPositionY: 0, artworkScale: 100 });
const POSITION_STEP = 3;
const DRAWER_WIDTH = "min(736px, calc(67.153dvh - 39px))";
const ARTWORK_CONTROL_BUTTON_SX = {
  width: 36,
  height: 36,
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
  const [tab, setTab] = useState(0);
  const [artworkPanelOpen, setArtworkPanelOpen] = useState(false);
  const [preference, setPreference] = useState({
    artworkId: "default",
    ...DEFAULT_ARTWORK_TRANSFORM,
    artworkTransforms: { default: DEFAULT_ARTWORK_TRANSFORM },
  });

  useEffect(() => {
    let active = true;
    getCharacterCardPreference(characterCode).then((stored) => {
      if (active) setPreference(stored);
    });
    return () => { active = false; };
  }, [characterCode]);

  const visibleArtworkCandidates = useMemo(() => (
    Array.isArray(artworkCandidates) ? artworkCandidates : []
  ), [artworkCandidates]);
  const selectedArtwork = visibleArtworkCandidates.find((item) => item.id === preference.artworkId)
    || visibleArtworkCandidates[0]
    || null;

  const persistPreference = (update, shouldPersist = true) => {
    setPreference((current) => {
      const next = typeof update === "function" ? update(current) : update;
      if (shouldPersist) void setCharacterCardPreference(characterCode, next);
      return next;
    });
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
        artworkScale: Math.max(70, Math.min(180, Number(patch.artworkScale ?? currentTransform.artworkScale ?? 100))),
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
    updateArtworkTransform({
      objectPositionX: preference.objectPositionX + xDelta,
      objectPositionY: preference.objectPositionY + yDelta,
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

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { display: "flex", width: { xs: "100vw", sm: DRAWER_WIDTH }, maxWidth: "100vw", height: "100dvh", overflow: "visible", bgcolor: "background.paper" } }}
    >
      <Box sx={{ zIndex: 3, flex: "none", bgcolor: "background.paper", boxShadow: "0 2px 6px rgba(30, 38, 45, 0.12)" }}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ minHeight: 58, px: { xs: 1, sm: 2 } }}>
          <Tabs
            value={tab}
            onChange={(_, value) => { setTab(value); if (value !== 0) setArtworkPanelOpen(false); }}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="角色工作区"
            sx={{ flex: 1, minWidth: 0, "& .MuiTab-root": { minHeight: 58, minWidth: 104 } }}
          >
            {TABS.map((item) => <Tab key={item.label} icon={item.icon} iconPosition="start" label={item.label} />)}
          </Tabs>
          <Button
            size="small"
            startIcon={<TuneIcon />}
            disabled={!characterData}
            onClick={onOpenCalculator}
            sx={{ flex: "none", whiteSpace: "nowrap" }}
          >
            洗词条
          </Button>
          <Button
            size="small"
            startIcon={<ImageOutlinedIcon />}
            color={artworkPanelOpen ? "primary" : "inherit"}
            aria-pressed={artworkPanelOpen}
            onClick={toggleArtworkPanel}
            sx={{ flex: "none", whiteSpace: "nowrap" }}
          >
            调整背景
          </Button>
          <IconButton onClick={onClose} aria-label="关闭角色工作区"><CloseIcon /></IconButton>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: tab === 0 ? "hidden" : "auto", bgcolor: tab === 0 ? "#eef1f3" : "background.paper" }}>
        {tab === 0 ? (
          <Box sx={{ boxSizing: "border-box", width: "100%", height: "100%" }}>
            <CharacterCard
              catalogCharacter={catalogCharacter}
              characterData={characterData}
              artworkUrl={selectedArtwork?.url || ""}
              artworkPreference={preference}
            />
          </Box>
        ) : null}

        {tab === 1 ? (
          <Box sx={{ boxSizing: "border-box", minHeight: "100%", p: { xs: 2, sm: 3 }, bgcolor: "background.paper" }}>
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
          aria-label="调整角色卡背景"
          sx={{
            position: "absolute",
            zIndex: 2,
            top: 58,
            right: { xs: 0, md: "100%" },
            bottom: 0,
            boxSizing: "border-box",
            width: { xs: "min(82vw, 272px)", md: 260 },
            p: 2,
            borderRight: { xs: 0, md: "1px solid" },
            borderLeft: { xs: "1px solid", md: 0 },
            borderColor: "divider",
            bgcolor: "background.paper",
            boxShadow: "-8px 12px 22px rgba(28, 34, 40, 0.18)",
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>调整背景</Typography>
              <Typography variant="caption" color="text.secondary">每套皮肤独立保存</Typography>
            </Box>
            <Tooltip title="恢复当前皮肤默认构图">
              <IconButton size="small" aria-label="恢复当前皮肤默认构图" onClick={() => updateArtworkTransform(DEFAULT_ARTWORK_TRANSFORM)}><RestartAltIcon /></IconButton>
            </Tooltip>
          </Stack>

          {visibleArtworkCandidates.length ? (
            <>
              <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                <InputLabel id="character-artwork-select-label">角色皮肤</InputLabel>
                <Select
                  labelId="character-artwork-select-label"
                  label="角色皮肤"
                  value={selectedArtwork?.id || ""}
                  onChange={(event) => selectArtwork(event.target.value)}
                >
                  {visibleArtworkCandidates.map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
                </Select>
              </FormControl>

              <Box sx={{ display: "grid", gridTemplateColumns: "116px 1fr", alignItems: "center", justifyItems: "center", gap: 2, mt: 3 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1, textAlign: "center" }}>位置</Typography>
                  <Box
                    role="group"
                    aria-label="移动立绘"
                    sx={{ display: "grid", width: 116, gridTemplateColumns: "repeat(3, 36px)", gridTemplateRows: "repeat(3, 36px)", gap: "4px" }}
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
                    min={70}
                    max={180}
                    step={1}
                    value={preference.artworkScale}
                    onChange={(_, value) => updateArtworkTransform({ artworkScale: value }, false)}
                    onChangeCommitted={(_, value) => updateArtworkTransform({ artworkScale: value })}
                    aria-label="立绘缩放"
                    sx={{ flex: 1, my: 1 }}
                  />
                  <ZoomOutIcon fontSize="small" color="action" />
                </Stack>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                偏移 {Math.round(preference.objectPositionX - 50)}% / {Math.round(preference.objectPositionY)}% · 缩放 {Math.round(preference.artworkScale)}%
              </Typography>
            </>
          ) : <Alert severity="info" sx={{ mt: 2 }}>当前角色没有可用的本地立绘。</Alert>}
        </Box>
      ) : null}
    </Drawer>
  );
}

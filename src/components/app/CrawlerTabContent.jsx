// SPDX-License-Identifier: GPL-3.0-or-later
// ========== 爬取标签页内容组件 ==========

import { memo, useState } from "react";
import {
  Stack,
  Switch,
  Button,
  FormControlLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  CircularProgress,
  TextField,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import SettingsIcon from "@mui/icons-material/Settings";
import LoginOutlinedIcon from "@mui/icons-material/LoginOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import { parseManualAreaId } from "../../utils/areaId.js";

const CrawlerTabContent = ({
  t,
  // 设置
  activateTab,
  server,
  manualAreaId,
  // 开关处理
  toggleActivateTab,
  changeServer,
  changeManualAreaId,
  // 爬取
  cookieLoading,
  handleSaveCookie,
  handleStart,
  handleLoginTest,
  handleImportAccounts,
  handleExportAccounts,
}) => {
  const [manualAreaFocused, setManualAreaFocused] = useState(false);
  const parsedManualAreaId = parseManualAreaId(manualAreaId);
  const showManualAreaHelp = manualAreaFocused || Boolean(String(manualAreaId || "").trim());

  return (
    <>
      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          size="small"
          fullWidth
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={handleImportAccounts}
        >
          {t("importAccounts")}
        </Button>
        <Button
          variant="outlined"
          size="small"
          fullWidth
          startIcon={<FileUploadOutlinedIcon />}
          onClick={handleExportAccounts}
        >
          {t("exportAccounts")}
        </Button>
      </Stack>

      {/* 保存当前 Cookie */}
      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          size="small"
          fullWidth
          onClick={handleSaveCookie}
          startIcon={<SaveIcon />}
          disabled={cookieLoading}
        >
          {t("saveCookieShort")}
        </Button>
        <Button
          variant="outlined"
          size="small"
          fullWidth
          onClick={handleLoginTest}
          startIcon={cookieLoading ? <CircularProgress size={18} color="inherit" /> : <LoginOutlinedIcon />}
          disabled={cookieLoading}
        >
          {t("loginTest")}
        </Button>
      </Stack>

      <Button
        variant="text"
        fullWidth
        onClick={() => chrome.runtime.openOptionsPage()}
        startIcon={<SettingsIcon />}
      >
        {t("management")}
      </Button>
      <FormControlLabel
        control={<Switch checked={activateTab} onChange={toggleActivateTab} />}
        label={t("activateTab")}
      />
      
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t("server")}
        </Typography>
        <Select
          variant="outlined"
          size="small"
          fullWidth
          value={server}
          onChange={changeServer}
          inputProps={{ "aria-label": t("server") }}
        >
          <MenuItem value="hmt">{t("hmt")}</MenuItem>
          <MenuItem value="global">{t("global")}</MenuItem>
        </Select>
      </Box>

      <TextField
        variant="outlined"
        size="small"
        fullWidth
        label={t("manualAreaId")}
        value={manualAreaId}
        onChange={changeManualAreaId}
        onFocus={() => setManualAreaFocused(true)}
        onBlur={() => setManualAreaFocused(false)}
        error={!parsedManualAreaId.valid}
        helperText={showManualAreaHelp
          ? parsedManualAreaId.valid
            ? t("manualAreaIdHelp")
            : t("manualAreaIdInvalid")
          : undefined}
        inputProps={{ inputMode: "numeric" }}
      />

      <Button
        variant="outlined"
        fullWidth
        onClick={() => handleStart({ onlyCookie: true })}
        startIcon={cookieLoading ? <CircularProgress size={20} color="inherit" /> : null}
        disabled={cookieLoading}
      >
        {t("updateCookie")}
      </Button>
    </>
  );
};

export default memo(CrawlerTabContent);

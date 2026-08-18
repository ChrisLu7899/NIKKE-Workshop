// SPDX-License-Identifier: GPL-3.0-or-later
// ========== 爬取标签页内容组件 ==========

import { memo, useState } from "react";
import {
  Button,
  Select,
  MenuItem,
  Box,
  Typography,
  TextField,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import { parseManualAreaId } from "../../utils/areaId.js";

const CrawlerTabContent = ({
  t,
  server,
  manualAreaId,
  changeServer,
  changeManualAreaId,
}) => {
  const [manualAreaFocused, setManualAreaFocused] = useState(false);
  const parsedManualAreaId = parseManualAreaId(manualAreaId);
  const showManualAreaHelp = manualAreaFocused || Boolean(String(manualAreaId || "").trim());

  return (
    <>
      <Button
        variant="text"
        fullWidth
        onClick={() => chrome.runtime.openOptionsPage()}
        startIcon={<SettingsIcon />}
      >
        {t("management")}
      </Button>
      
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
    </>
  );
};

export default memo(CrawlerTabContent);

// SPDX-License-Identifier: GPL-3.0-or-later
import { memo } from "react";
import { AppBar, Toolbar, Typography, Box, Switch } from "@mui/material";
import { SHOW_NIKKE_IMAGES } from "../../config/displayPreferences.js";

const ManagementHeader = ({ iconUrl, lang, onToggleLang }) => (
  <AppBar position="sticky" sx={{ top: 0, zIndex: (theme) => theme.zIndex.appBar }}>
    <Toolbar>
      {SHOW_NIKKE_IMAGES ? (
        <img
          src={iconUrl}
          alt="logo"
          width={32}
          height={32}
          style={{ width: 32, height: 32, marginRight: 8 }}
        />
      ) : <Box aria-hidden sx={{ width: 32, height: 32, mr: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.16)" }} />}
      <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>【王国大学习】NIKKE 战术整备室</Typography>
      <Box display="flex" alignItems="center" sx={{ color: "white" }}>
        <Typography variant="caption">中文</Typography>
        <Switch
          size="small"
          color="default"
          checked={lang === "en"}
          onChange={onToggleLang}
          inputProps={{ "aria-label": "Language" }}
        />
        <Typography variant="caption">EN</Typography>
      </Box>
    </Toolbar>
  </AppBar>
);

export default memo(ManagementHeader);

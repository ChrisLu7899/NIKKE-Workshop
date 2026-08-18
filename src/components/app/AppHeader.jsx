// SPDX-License-Identifier: GPL-3.0-or-later
// ========== App Header 组件 ==========

import { memo } from "react";
import { AppBar, Box, Button, CircularProgress, Toolbar } from "@mui/material";
import LoginOutlinedIcon from "@mui/icons-material/LoginOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";

const AppHeader = ({
  t,
  checking,
  loggedIn,
  username,
  cookieLoading,
  onOpenLogin,
  onSaveCookie,
}) => {
  const loginLabel = checking
    ? t("checkingLogin")
    : loggedIn
      ? username || t("loggedIn")
      : t("login");

  return (
    <AppBar position="sticky">
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Button
          color="inherit"
          size="small"
          startIcon={loggedIn ? <PersonOutlineOutlinedIcon /> : <LoginOutlinedIcon />}
          onClick={onOpenLogin}
          disabled={checking}
          title={loginLabel}
          sx={{
            flex: 1,
            minWidth: 0,
            justifyContent: "flex-start",
            px: 1,
          }}
        >
          <Box
            component="span"
            sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {loginLabel}
          </Box>
        </Button>
        <Button
          color="inherit"
          variant="outlined"
          size="small"
          startIcon={cookieLoading
            ? <CircularProgress size={16} color="inherit" />
            : <SaveOutlinedIcon />}
          onClick={onSaveCookie}
          disabled={cookieLoading}
          sx={{
            flexShrink: 0,
            whiteSpace: "nowrap",
            borderColor: "rgba(255, 255, 255, 0.72)",
            "&:hover": { borderColor: "common.white" },
          }}
        >
          {t("saveOrUpdateCookie")}
        </Button>
      </Toolbar>
    </AppBar>
  );
};

export default memo(AppHeader);

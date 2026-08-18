// SPDX-License-Identifier: GPL-3.0-or-later
// ========== App Header 组件 ==========

import { memo } from "react";
import { AppBar, Toolbar, Button } from "@mui/material";
import ManageAccountsOutlinedIcon from "@mui/icons-material/ManageAccountsOutlined";

const AppHeader = ({ t, onOpenAccountInfo }) => (
    <AppBar position="sticky">
      <Toolbar variant="dense" sx={{ justifyContent: "flex-start" }}>
        <Button
          color="inherit"
          size="small"
          startIcon={<ManageAccountsOutlinedIcon />}
          onClick={onOpenAccountInfo}
          sx={{ flexShrink: 0, whiteSpace: "nowrap", px: 1 }}
        >
          {t("accountInfo")}
        </Button>
      </Toolbar>
    </AppBar>
);

export default memo(AppHeader);

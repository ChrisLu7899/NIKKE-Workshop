// SPDX-License-Identifier: GPL-3.0-or-later

import { memo, useEffect, useState } from "react";
import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Button,
} from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { getAccounts, setAccounts } from "../../services/storage.js";
import {
  buildSingleEnabledAccountList,
  selectCurrentAccountIndex,
} from "../../utils/singleAccount.js";

const EMPTY_ACCOUNT = {
  username: "",
  email: "",
  password: "",
  cookie: "",
};

const SingleAccountDialog = ({ open, onClose, t, showMessage }) => {
  const [draft, setDraft] = useState(EMPTY_ACCOUNT);
  const [accountIndex, setAccountIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    setShowPassword(false);

    getAccounts()
      .then((accounts) => {
        if (!active) return;
        const index = selectCurrentAccountIndex(accounts);
        const account = index >= 0 ? accounts[index] : EMPTY_ACCOUNT;
        setAccountIndex(index);
        setDraft({
          username: account?.username || "",
          email: account?.email || "",
          password: account?.password || "",
          cookie: account?.cookie || "",
        });
      })
      .catch((loadError) => {
        console.error("读取账号信息失败:", loadError);
        if (active) setError(t("accountInfoLoadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, t]);

  const updateDraft = (field) => (event) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const accounts = await getAccounts();
      const next = buildSingleEnabledAccountList(accounts, accountIndex, draft);
      await setAccounts(next);
      showMessage(t("accountInfoSaved"), "success");
      onClose();
    } catch (saveError) {
      console.error("保存账号信息失败:", saveError);
      setError(t("accountInfoSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="single-account-dialog-title"
      slotProps={{
        paper: {
          sx: {
            width: "calc(100% - 24px)",
            m: 1.5,
          },
        },
      }}
    >
      <DialogTitle id="single-account-dialog-title">{t("accountInfo")}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {t("accountInfoHelp")}
        </DialogContentText>
        <Stack spacing={1.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t("username")}
            value={draft.username}
            onChange={updateDraft("username")}
            disabled={loading || saving}
            autoComplete="username"
          />
          <TextField
            fullWidth
            size="small"
            type="email"
            label={t("email")}
            value={draft.email}
            onChange={updateDraft("email")}
            disabled={loading || saving}
            autoComplete="email"
          />
          <TextField
            fullWidth
            size="small"
            type={showPassword ? "text" : "password"}
            label={t("password")}
            value={draft.password}
            onChange={updateDraft("password")}
            disabled={loading || saving}
            autoComplete="current-password"
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                      disabled={loading || saving}
                    >
                      {showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            fullWidth
            size="small"
            multiline
            minRows={3}
            maxRows={6}
            label={t("cookie")}
            value={draft.cookie}
            onChange={updateDraft("cookie")}
            disabled={loading || saving}
            autoComplete="off"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={saving}>{t("cancel")}</Button>
        <Button variant="contained" onClick={handleSave} disabled={loading || saving}>
          {saving ? t("saving") : t("save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default memo(SingleAccountDialog);

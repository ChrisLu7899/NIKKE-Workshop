// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { buildAkaCharacterImportPreview } from "../../domain/akaCharacterImport.js";
import { fetchAkaUserInfo, requestAkaHostPermission } from "../../services/akaNikkeApi.js";

const resetPreview = {
  accountName: "",
  total: 0,
  items: [],
  unmatched: [],
};

export default function AkaDataImportDialog({
  open,
  onClose,
  standardCatalog,
  localRecords,
  onSaveLocalCharacterBatch,
}) {
  const requestControllerRef = useRef(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [serverType, setServerType] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(resetPreview);
  const [saveSummary, setSaveSummary] = useState(null);

  useEffect(() => {
    if (open) return;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setApiKey("");
    setShowApiKey(false);
    setLoading(false);
    setSaving(false);
    setError("");
    setPreview(resetPreview);
    setSaveSummary(null);
  }, [open]);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  const matchedCount = preview.items.length;
  const canImport = matchedCount > 0 && !loading && !saving && !saveSummary;
  const previewText = useMemo(() => {
    if (!preview.total) return "";
    return `阿卡返回 ${preview.total} 名角色，可匹配图鉴 ${matchedCount} 名`;
  }, [matchedCount, preview.total]);

  const clearLoadedData = () => {
    setError("");
    setPreview(resetPreview);
    setSaveSummary(null);
  };

  const load = async () => {
    if (!apiKey.trim() || loading) return;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);
    setError("");
    setSaveSummary(null);
    setPreview(resetPreview);
    try {
      await requestAkaHostPermission();
      const userInfo = await fetchAkaUserInfo({
        apiKey,
        serverType,
        signal: controller.signal,
      });
      const nextPreview = buildAkaCharacterImportPreview({
        userInfo,
        catalog: standardCatalog,
        localRecords,
      });
      setPreview({
        ...nextPreview,
        accountName: String(userInfo?.playerName || "").trim(),
      });
    } catch (nextError) {
      if (nextError?.name !== "AbortError") {
        setError(nextError?.message || "读取阿卡数据失败");
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  };

  const save = async () => {
    if (!canImport) return;
    setSaving(true);
    setError("");
    try {
      const result = await onSaveLocalCharacterBatch(preview.items, { sourceLabel: "阿卡" });
      const errors = result?.errors || [];
      setSaveSummary({ saved: result?.saved?.length || 0, errors });
      if (errors.length) setError(errors.join("；"));
    } catch (nextError) {
      setError(nextError?.message || "保存阿卡数据失败");
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (loading || saving) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>读取阿卡数据</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          在阿卡中使用 <code>#ApiKey</code> 获取 Key。首次读取时浏览器会请求访问阿卡接口；本工具不会保存、导出或记录你的 Key。
        </Alert>

        <Stack spacing={2}>
          <TextField
            select
            fullWidth
            label="服务器"
            value={serverType}
            onChange={(event) => {
              setServerType(Number(event.target.value));
              clearLoadedData();
            }}
          >
            <MenuItem value={0}>国服</MenuItem>
            <MenuItem value={1}>外服</MenuItem>
          </TextField>
          <TextField
            autoFocus
            fullWidth
            type={showApiKey ? "text" : "password"}
            label="阿卡 API Key"
            placeholder="sk_api_…"
            value={apiKey}
            autoComplete="off"
            onChange={(event) => {
              setApiKey(event.target.value);
              clearLoadedData();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") load();
            }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                    onClick={() => setShowApiKey((value) => !value)}
                  >
                    {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <CloudDownloadOutlinedIcon />}
            disabled={loading || saving || !apiKey.trim()}
            onClick={load}
            sx={{ alignSelf: "flex-start" }}
          >
            {loading ? "正在读取" : "读取角色数据"}
          </Button>
        </Stack>

        {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}
        {preview.total ? (
          <Box sx={{ mt: 2 }}>
            <Alert severity={matchedCount ? "success" : "warning"}>
              {preview.accountName ? `账号“${preview.accountName}”：` : ""}{previewText}
              {preview.unmatched.length ? `，另有 ${preview.unmatched.length} 名未匹配` : ""}。
            </Alert>
            {preview.unmatched.length ? (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                  未匹配角色不会导入：
                </Typography>
                <Stack direction="row" gap={0.75} useFlexGap flexWrap="wrap">
                  {preview.unmatched.map((name) => <Chip key={name} size="small" label={name} />)}
                </Stack>
              </Box>
            ) : null}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              确认导入后，标准角色的突破、好感度、职业／企业等级和装备词条将以阿卡数据为准；阿卡未提供的角色等级和战斗力会保留，自定义角色不受影响。
            </Typography>
          </Box>
        ) : null}
        {saveSummary ? (
          <Alert severity={saveSummary.errors.length ? "warning" : "success"} sx={{ mt: 2 }}>
            {saveSummary.errors.length
              ? `导入未完成：${saveSummary.errors.join("；")}`
              : `已导入 ${saveSummary.saved} 名角色，可在“已录入”和洗词条计算器中使用。`}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={loading || saving}>关闭</Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={!canImport}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {saving ? "正在导入" : `确认导入${matchedCount ? `（${matchedCount}）` : ""}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

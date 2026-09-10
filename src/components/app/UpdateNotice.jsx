// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Typography } from '@mui/material';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { UPDATE_KEY, UPDATER_URI, compareVersions } from '../../../public/update-policy.js';

export default function UpdateNotice({ showTrigger = true, color = 'inherit' }) {
  const [open, setOpen] = useState(() => globalThis.location?.hash === '#workshop-updater');
  const [state, setState] = useState({});
  const [busy, setBusy] = useState(false);
  const [launchAttempted, setLaunchAttempted] = useState(false);
  const current = globalThis.chrome?.runtime?.getManifest?.().version || '—';
  // A real extension tab hosts the browser's external-program confirmation.
  // Side-panel WebContents do not reliably support that dialog, even with _blank.
  const inManagementPage = globalThis.location?.pathname === '/management.html';
  useEffect(() => {
    if (!globalThis.chrome?.storage?.local) return;
    let alive = true;
    chrome.storage.local.get(UPDATE_KEY).then((data) => { if (alive) setState(data[UPDATE_KEY] || {}); }).catch(() => undefined);
    const changed = (changes, area) => { if (area === 'local' && changes[UPDATE_KEY]) setState(changes[UPDATE_KEY].newValue || {}); };
    chrome.storage.onChanged.addListener(changed);
    // The updater dialog performs its own fresh check when opened.
    if (globalThis.location?.pathname !== '/management.html' || globalThis.location?.hash !== '#workshop-updater') {
      chrome.runtime.sendMessage({ type: 'workshop.update.check' }).catch(() => undefined);
    }
    return () => { alive = false; chrome.storage.onChanged.removeListener(changed); };
  }, []);
  let relation = null;
  try { if (state.release) relation = compareVersions(state.release.version, current); } catch { /* Invalid cached metadata is not an update. */ }
  const newer = relation === 1;
  const check = useCallback(async () => {
    setBusy(true);
    try {
      if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('请在已加载的扩展中检测版本。');
      const result = await chrome.runtime.sendMessage({ type: 'workshop.update.check', force: true });
      setState(result || { error: '未收到检测结果，请重新加载扩展后重试。' });
    } catch (error) { setState((previous) => ({ ...previous, error: error.message })); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    if (open && inManagementPage) void check();
  }, [open, inManagementPage, check]);
  const date = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('zh-CN') : '—';
  if (!inManagementPage) return <Button color={color} size="small" startIcon={<SystemUpdateAltIcon />} component="a" href="management.html#workshop-updater" target="_blank" rel="noopener noreferrer" sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
    {newer ? '发现新版' : '版本更新'}
  </Button>;
  return <>
    {showTrigger && <Button color={color} size="small" startIcon={<SystemUpdateAltIcon />} onClick={() => setOpen(true)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
      {newer ? '发现新版' : '版本更新'}
    </Button>}
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth aria-labelledby="workshop-update-title">
      <DialogTitle id="workshop-update-title">版本更新</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box aria-live="polite">
            <Typography sx={{ fontWeight: 600 }}>{busy ? '正在检查最新版本…' : relation === null ? '尚未获取最新版本' : newer ? '发现新版本' : relation < 0 ? '本地版本较新，无需降级' : '已是最新版本'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>当前 {current} · 最新 {state.release?.version || '—'}</Typography>
          </Box>
          {busy && <LinearProgress aria-label="正在检测 GitHub 新版本" />}
          {state.error && <Alert severity="warning">{state.error}{state.release ? ' 下方显示上次成功检测的信息。' : ''}</Alert>}
          {state.retryAt > Date.now() && <Typography variant="body2" color="text.secondary">可重试时间：{date(state.retryAt)}</Typography>}
          {state.release && <Box component="details">
            <Box component="summary" sx={{ cursor: 'pointer', typography: 'body2', py: 0.5 }}>更新说明</Box>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>发布于 {date(state.release.publishedAt)} · 检查于 {date(state.successAt)}</Typography>
            <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{state.release.notes || '该版本未提供更新说明。'}</Typography>
          </Box>}
          <Typography variant="body2" color="text.secondary">安装需在更新器中确认，screenshots 截图保留。</Typography>
          <Box component="details">
            <Box component="summary" sx={{ cursor: 'pointer', typography: 'body2', py: 0.5 }}>首次使用 / 无法打开？</Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>双击安装目录中的 Workshop-Updater.vbs，核对目录后点击「启用插件唤起」。只需首次启用，移动目录后需重新启用。系统禁用脚本时，查看 updater/README.md。</Typography>
          </Box>
          {launchAttempted && <Typography role="status" variant="body2" color="text.secondary">已请求打开，请确认浏览器提示。未打开？查看上方帮助。</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5, px: 2, py: 1.5 }}>
        <Button onClick={() => setOpen(false)}>关闭</Button>
        <Button variant="contained" component="a" href={UPDATER_URI} target="_blank" rel="noopener noreferrer" onClick={() => setLaunchAttempted(true)}>打开更新器</Button>
      </DialogActions>
    </Dialog>
  </>;
}

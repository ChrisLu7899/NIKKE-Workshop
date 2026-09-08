// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Typography } from '@mui/material';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { UPDATE_KEY, UPDATER_URI, compareVersions } from '../../../public/update-policy.js';

export default function UpdateNotice() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({});
  const [busy, setBusy] = useState(false);
  const [launchAttempted, setLaunchAttempted] = useState(false);
  const current = globalThis.chrome?.runtime?.getManifest?.().version || '—';
  useEffect(() => {
    if (!globalThis.chrome?.storage?.local) return;
    let alive = true;
    chrome.storage.local.get(UPDATE_KEY).then((data) => { if (alive) setState(data[UPDATE_KEY] || {}); }).catch(() => undefined);
    const changed = (changes, area) => { if (area === 'local' && changes[UPDATE_KEY]) setState(changes[UPDATE_KEY].newValue || {}); };
    chrome.storage.onChanged.addListener(changed);
    chrome.runtime.sendMessage({ type: 'workshop.update.check' }).catch(() => undefined);
    return () => { alive = false; chrome.storage.onChanged.removeListener(changed); };
  }, []);
  let relation = null;
  try { if (state.release) relation = compareVersions(state.release.version, current); } catch { /* Invalid cached metadata is not an update. */ }
  const newer = relation === 1;
  const check = async () => {
    setBusy(true);
    try {
      if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('请在已加载的扩展中检测版本。');
      const result = await chrome.runtime.sendMessage({ type: 'workshop.update.check', force: true });
      setState(result || { error: '未收到检测结果，请重新加载扩展后重试。' });
    } catch (error) { setState((previous) => ({ ...previous, error: error.message })); }
    finally { setBusy(false); }
  };
  const date = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('zh-CN') : '—';
  return <>
    <Button color="inherit" size="small" startIcon={<SystemUpdateAltIcon />} onClick={() => setOpen(true)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
      {newer ? '发现新版' : '版本更新'}
    </Button>
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth aria-labelledby="workshop-update-title">
      <DialogTitle id="workshop-update-title">{newer ? '有新的正式版本' : '版本更新'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box aria-live="polite">
            <Typography>当前版本：{current} / GitHub 正式版：{state.release?.version || '尚未检测'}</Typography>
            {relation !== null && <Typography color="text.secondary">{newer ? '当前不是最新正式版，可打开更新器查看并更新。' : relation < 0 ? '本地版本高于已发布版本，无需降级。' : '当前已是最新正式版。'}</Typography>}
          </Box>
          {busy && <LinearProgress aria-label="正在检测 GitHub 新版本" />}
          {state.error && <Alert severity="warning">{state.error}{state.release ? ' 下方显示上次成功检测的信息。' : ''}</Alert>}
          {state.retryAt > Date.now() && <Typography variant="body2" color="text.secondary">可重试时间：{date(state.retryAt)}</Typography>}
          <Typography variant="body2" color="text.secondary">上次成功检测：{date(state.successAt)}。自动检测每天最多一次，手动检测间隔至少一分钟。</Typography>
          {state.release && <Box>
            <Typography variant="subtitle2">更新说明 · {date(state.release.publishedAt)}</Typography>
            <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 220, overflowY: 'auto' }}>{state.release.notes || '该版本未提供更新说明。'}</Typography>
          </Box>}
          <Alert severity="info">更新由独立更新器执行。点击下方按钮只尝试打开程序，下载及覆盖仍需在更新器中确认。snapshots 与 screenshots 始终保留。</Alert>
          <Box>
            <Typography variant="subtitle2">第一次使用，或点击后没有打开？</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>在插件安装文件夹中双击「Workshop-Updater.vbs」，核对目录后点击「启用插件唤起」。移动文件夹后，在新位置重新启用即可。若系统禁用脚本，请使用 updater 文件夹内的手动启动说明。</Typography>
          </Box>
          {launchAttempted && <Alert severity="info">已发出打开请求，请确认浏览器的外部程序提示。插件无法确认本地程序是否成功启动；未出现窗口时请按上方说明手动打开。</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, py: 2 }}>
        <Button onClick={() => setOpen(false)}>关闭</Button>
        <Button onClick={check} disabled={busy}>{busy ? '检测中…' : '检查更新'}</Button>
        <Button variant="contained" component="a" href={UPDATER_URI} onClick={() => setLaunchAttempted(true)}>打开更新器</Button>
      </DialogActions>
    </Dialog>
  </>;
}

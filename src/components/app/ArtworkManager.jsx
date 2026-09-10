// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Typography } from '@mui/material';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import { downloadArtwork, inspectArtwork, requestArtworkPermission } from '../../services/artworkStorage.js';

const mb = (n = 0) => `${(n / 1024 ** 2).toFixed(1)} MB`;
export default function ArtworkManager({ compact = false }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ status: 'idle' });
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const inspect = async () => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setState({ status: 'checking' });
    try {
      const result = await inspectArtwork((progress) => { if (!abort.signal.aborted) setState({ status: 'checking', ...progress }); }, abort.signal);
      if (!abort.signal.aborted) setState({ status: 'ready', ...result });
    } catch (e) { if (!abort.signal.aborted) setState({ status: 'error', message: e.message }); }
  };
  const start = async () => {
    // Request optional permissions synchronously from this user click.
    const allowed = requestArtworkPermission();
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setState((old) => ({ ...old, status: 'downloading', completed: 0, bytes: 0, message: '' }));
    try {
      if (!await allowed) throw new Error('未授权下载。你可以继续使用不含立绘的功能。');
      abort.signal.throwIfAborted();
      await downloadArtwork({ signal: abort.signal, onProgress: (progress) => { if (!abort.signal.aborted) setState({ status: 'downloading', ...progress }); } });
      if (!abort.signal.aborted) await inspect();
    } catch (e) { if (!abort.signal.aborted) setState((old) => ({ ...old, status: 'error', message: e.message })); }
  };
  const cancel = () => { controller.current?.abort(); setState((old) => ({ ...old, status: 'paused', message: '已暂停，完成的图片已保存；继续时只补缺失文件。' })); };
  const busy = state.status === 'downloading' || state.status === 'checking';
  const complete = state.status === 'ready' && state.available === state.total;
  return <>
    <Button size="small" color={compact ? 'primary' : 'inherit'} startIcon={<CollectionsOutlinedIcon />} onClick={() => { setOpen(true); void inspect(); }}>立绘素材</Button>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} maxWidth="xs" fullWidth aria-labelledby="artwork-manager-title">
      <DialogTitle id="artwork-manager-title">立绘素材</DialogTitle>
      <DialogContent dividers><Stack spacing={2}>
        <Box aria-live="polite">
          <Typography fontWeight={600}>{complete ? '全部立绘已就绪' : state.status === 'downloading' ? '正在下载立绘' : state.status === 'checking' ? '正在检查本地立绘' : '按需下载整套立绘'}</Typography>
          <Typography variant="body2" color="text.secondary">{state.total ? `${state.available ?? state.completed ?? 0} / ${state.total} 张 · 共 ${mb(state.totalBytes)}` : '未下载不影响角色数据、装备、OCR 和计算器。'}</Typography>
        </Box>
        {busy && <LinearProgress aria-label="立绘处理进度" variant={state.total ? 'determinate' : 'indeterminate'} value={state.total ? 100 * (state.status === 'checking' ? state.checked || 0 : state.completed || 0) / state.total : 0} />}
        {state.status === 'downloading' && <Typography variant="body2">已完成 {mb(state.bytes)}，请保持此页面打开。</Typography>}
        {state.message && <Alert severity={state.status === 'error' ? 'warning' : 'info'}>{state.message}</Alert>}
        <Typography variant="body2" color="text.secondary">包括默认立绘、皮肤、珍藏品背景和技能动画静态背景。仅下载缺失或变化的图片，每张校验后保存。</Typography>
        <Typography variant="body2" color="text.secondary">下载保存在当前扩展的本地素材存储中，原地更新保留；卸载扩展或更换浏览器不会自动迁移。不写入 screenshots。</Typography>
        {state.sourceRef === null && <Alert severity="info">当前素材尚未发布，暂时请使用完整安装包。</Alert>}
      </Stack></DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5, px: 2, py: 1.5 }}>
        {busy ? <Button onClick={cancel}>暂停</Button> : <Button onClick={() => setOpen(false)}>关闭</Button>}
        <Button onClick={inspect} disabled={busy}>重新检查</Button>
        <Button variant="contained" onClick={start} disabled={busy || complete || state.sourceRef === null}>{state.status === 'error' || state.status === 'paused' ? '继续下载' : '下载全部立绘'}</Button>
      </DialogActions>
    </Dialog>
  </>;
}

// SPDX-License-Identifier: GPL-3.0-or-later
// ========== NIKKE Workshop 主应用组件 ==========
// 主要功能：账户管理、数据爬取和结果导出

import { useEffect, useCallback } from "react";
import {
  Container,
  Stack,
  Paper,
  Button,
  Snackbar,
  Alert,
  Box,
  Link,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import TRANSLATIONS from "./i18n/translations.js";
import { initializeLevelStats } from "./services/levelStats.js";
import { createLogFilename, formatLogText } from "./utils/logExport.js";
import {
  useSettings,
  useNotification,
  useCrawler,
  useBlablalinkLoginStatus,
  AppHeader,
  CrawlerTabContent,
} from "./components/app";

// ========== React 主组件 ==========
export default function App() {
  useEffect(() => {
    initializeLevelStats().catch((error) => {
      console.warn("共享等级曲线初始化失败:", error);
    });
  }, []);
  
  // ========== 通知 ==========
  const { notification, showMessage, handleCloseNotification } = useNotification();

  // ========== 设置 ==========
  const settings = useSettings();
  
  // 翻译函数
  const t = useCallback((k) => TRANSLATIONS[settings.lang][k] || k, [settings.lang]);

  // ========== 数据爬取 ==========
  const crawler = useCrawler({
    t,
    lang: settings.lang,
    saveAsZip: settings.saveAsZip,
    exportJson: settings.exportJson,
    activateTab: settings.activateTab,
    server: settings.server,
    forceSimulatedStatsLevel400: settings.forceSimulatedStatsLevel400,
    listenForExternalLogs: true,
  });
  const loginStatus = useBlablalinkLoginStatus();

  const handleOpenLogin = useCallback(async () => {
    try {
      await loginStatus.openLogin();
      showMessage(t("blablalinkLoginOpened"), "info");
    } catch (error) {
      console.error("打开 Blablalink 登录页失败:", error);
      showMessage(t("blablalinkLoginOpenFailed"), "error");
    }
  }, [loginStatus, showMessage, t]);

  const handleSaveOrUpdateCookie = useCallback(async () => {
    const result = await crawler.handleSaveCookie();
    if (!result?.success) {
      showMessage(
        result?.reason === "not-logged-in" ? t("notLoginHelp") : t("cookieSaveFailed"),
        result?.reason === "not-logged-in" ? "warning" : "error",
      );
      await loginStatus.refresh({ resolveUsername: false });
      return;
    }
    await loginStatus.refresh({ resolveUsername: true });
    showMessage(
      result.updated ? t("cookieUpdatedSuccess") : t("cookieSavedSuccess"),
      "success",
    );
  }, [crawler, loginStatus, showMessage, t]);

  const fullLogText = formatLogText(crawler.fullLogs);
  const hasFullLogs = Boolean(fullLogText);

  const handleCopyFullLogs = useCallback(async () => {
    if (!hasFullLogs) {
      showMessage(t("fullLogsEmpty"), "info");
      return;
    }

    try {
      await navigator.clipboard.writeText(fullLogText);
      showMessage(t("fullLogsCopied"), "success");
    } catch (error) {
      console.error("复制完整日志失败:", error);
      showMessage(t("fullLogsCopyFailed"), "error");
    }
  }, [fullLogText, hasFullLogs, showMessage, t]);

  const handleDownloadFullLogs = useCallback(() => {
    if (!hasFullLogs) {
      showMessage(t("fullLogsEmpty"), "info");
      return;
    }

    const blob = new Blob(["\ufeff", fullLogText], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download(
      {
        url,
        filename: createLogFilename(),
        saveAs: false,
      },
      () => {
        const downloadError = chrome.runtime.lastError;
        URL.revokeObjectURL(url);
        if (downloadError) {
          console.error("下载完整日志失败:", downloadError.message);
          showMessage(t("fullLogsDownloadFailed"), "error");
          return;
        }
        showMessage(t("fullLogsDownloaded"), "success");
      },
    );
  }, [fullLogText, hasFullLogs, showMessage, t]);

  /* ========== UI 界面渲染 ========== */
  return (
    <>
      <AppHeader
        t={t}
        checking={loginStatus.checking}
        loggedIn={loginStatus.loggedIn}
        username={loginStatus.username}
        cookieLoading={crawler.cookieLoading}
        onOpenLogin={handleOpenLogin}
        onSaveCookie={handleSaveOrUpdateCookie}
      />
      
      <Container sx={{ mt: 2, width: 340, pb: 1 }}>
        <Stack spacing={2}>
          <CrawlerTabContent
            t={t}
            server={settings.server}
            manualAreaId={settings.manualAreaId}
            changeServer={settings.changeServer}
            changeManualAreaId={settings.changeManualAreaId}
          />

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              fullWidth
              startIcon={<ContentCopyIcon />}
              onClick={handleCopyFullLogs}
              disabled={!hasFullLogs}
            >
              {t("copyFullLogs")}
            </Button>
            <Button
              variant="outlined"
              size="small"
              fullWidth
              startIcon={<DownloadIcon />}
              onClick={handleDownloadFullLogs}
              disabled={!hasFullLogs}
            >
              {t("downloadFullLogs")}
            </Button>
          </Stack>
          
          <Paper
            variant="outlined"
            sx={{
              p: 1,
              height: 240,
              overflowY: "auto",
              whiteSpace: "pre-line",
              fontSize: 12,
            }}
          >
            {crawler.logs.join("\n")}
          </Paper>

          <Box
            component="footer"
            sx={{
              pt: 0.5,
              pb: 1,
              color: "text.secondary",
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            <Typography variant="caption" display="block" color="inherit">
              👑 伟大的皇冠王国国王为战术整备室负责( ゜- ゜)
            </Typography>
            <Typography variant="caption" display="block" color="inherit">
              💡 钟鸣提供技术支持ヽ(`Д´)ﾉKISAMAAAAA！
            </Typography>
            <Typography variant="caption" display="block" color="inherit">
              ✍️ 作者：異界型w、夕紫
            </Typography>
            <Typography variant="caption" display="block" color="inherit">
              📖 培养建议来自
              <Link
                href="https://space.bilibili.com/17057196/dynamic"
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
              >
                屑芙蒂一图流
              </Link>
              ，感谢攻略作者的整理与分享。
            </Typography>
            <Typography variant="caption" display="block" color="inherit">
              🔗 数据获取功能基于
              <Link
                href="https://github.com/ExiaProject/ExiaInvasion"
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
              >
                ExiaInvasion
              </Link>
              开发，感谢原项目作者与贡献者。
            </Typography>
            <Typography variant="caption" display="block" color="inherit">
              🔒 隐私说明：账号、角色与计算数据仅保存在本地，不会上传至本项目或其他第三方服务器；获取数据时仅与 Blablalink 进行必要通信。
            </Typography>
          </Box>

        </Stack>
      </Container>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert
          onClose={handleCloseNotification}
          severity={notification.severity}
          sx={{ width: "100%" }}
        >
          {notification.message}
        </Alert>
      </Snackbar>

    </>
  );
}

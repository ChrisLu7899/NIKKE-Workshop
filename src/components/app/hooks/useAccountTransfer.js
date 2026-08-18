// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "react";
import ExcelJS from "exceljs";
import { getAccounts, setAccounts } from "../../../services/storage.js";
import {
  classifyAccountImportHeader,
  downloadFile,
  getCellString,
  normalizeImportedCookieTimestamp,
  selectFile,
} from "../../management/utils.js";
import {
  isEmptyAccountPlaceholder,
  parseGameUidFromCookie,
} from "../../../domain/account.js";

const ACCOUNT_COLUMNS = [
  { header: "Game UID", key: "game_uid", width: 20 },
  { header: "账号 Username", key: "username", width: 25 },
  { header: "邮箱 Email", key: "email", width: 30 },
  { header: "密码 Password", key: "password", width: 25 },
  { header: "Cookie", key: "cookie", width: 50 },
  { header: "Cookie 更新时间", key: "cookie_updated_at", width: 22 },
];

const findMatchingAccountIndex = (accounts, { gameUid, email, cookie }) => {
  if (gameUid) {
    const byUid = accounts.findIndex((account) => account.game_uid === gameUid);
    if (byUid >= 0) return byUid;
  }
  if (email) {
    const byEmail = accounts.findIndex((account) => account.email === email);
    if (byEmail >= 0) return byEmail;
  }
  if (cookie) return accounts.findIndex((account) => account.cookie === cookie);
  return -1;
};

export function useAccountTransfer({ t, showMessage }) {
  const handleExportAccounts = useCallback(async () => {
    try {
      const accounts = (await getAccounts()).filter(
        (account) => !isEmptyAccountPlaceholder(account),
      );
      if (!accounts.length) {
        showMessage(t("emptyAccounts"), "warning");
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Accounts");
      worksheet.columns = ACCOUNT_COLUMNS;
      accounts.forEach((account) => {
        worksheet.addRow({
          game_uid: account.game_uid || "",
          username: account.username || "",
          email: account.email || "",
          password: account.password || "",
          cookie: account.cookie || "",
          cookie_updated_at: account.cookieUpdatedAt || "",
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      downloadFile(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `NIKKE_Workshop_Accounts_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      showMessage(t("exportSuccess"), "success");
    } catch (error) {
      console.error("导出账号失败:", error);
      showMessage(t("exportError"), "error");
    }
  }, [showMessage, t]);

  const handleImportAccounts = useCallback(() => {
    selectFile(".xlsx,.xls", async (file) => {
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) throw new Error("Missing worksheet");

        const columns = {
          gameUid: 1,
          username: 2,
          email: 3,
          password: 4,
          cookie: 5,
          cookieUpdatedAt: 0,
        };
        worksheet.getRow(1).eachCell((cell, columnNumber) => {
          const field = classifyAccountImportHeader(getCellString(cell));
          if (field) columns[field] = columnNumber;
        });

        const nextAccounts = (await getAccounts()).filter(
          (account) => !isEmptyAccountPlaceholder(account),
        );
        let addedCount = 0;
        let updatedCount = 0;

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return;
          const gameUid = getCellString(row.getCell(columns.gameUid));
          const username = getCellString(row.getCell(columns.username));
          const email = getCellString(row.getCell(columns.email));
          const password = getCellString(row.getCell(columns.password));
          const cookie = getCellString(row.getCell(columns.cookie));
          if (![gameUid, username, email, password, cookie].some((value) => value.trim())) return;

          const resolvedGameUid = gameUid || parseGameUidFromCookie(cookie);
          const timestampValue = columns.cookieUpdatedAt
            ? row.getCell(columns.cookieUpdatedAt).value
            : null;
          const importedTimestamp = normalizeImportedCookieTimestamp(timestampValue);
          const existingIndex = findMatchingAccountIndex(nextAccounts, {
            gameUid: resolvedGameUid,
            email,
            cookie,
          });

          if (existingIndex >= 0) {
            const current = nextAccounts[existingIndex];
            const resolvedCookie = cookie || current.cookie || "";
            nextAccounts[existingIndex] = {
              ...current,
              username: username || current.username || "",
              email: email || current.email || "",
              password: password || current.password || "",
              cookie: resolvedCookie,
              cookieUpdatedAt:
                importedTimestamp
                || current.cookieUpdatedAt
                || (resolvedCookie ? Date.now() : null),
              game_uid: resolvedGameUid || current.game_uid || "",
            };
            updatedCount += 1;
          } else {
            nextAccounts.push({
              username,
              email,
              password,
              cookie,
              cookieUpdatedAt: importedTimestamp || (cookie ? Date.now() : null),
              game_uid: resolvedGameUid,
              enabled: true,
            });
            addedCount += 1;
          }
        });

        await setAccounts(nextAccounts);
        showMessage(
          `${t("importSuccess")} (${t("added")}: ${addedCount}, ${t("updated")}: ${updatedCount})`,
          "success",
        );
      } catch (error) {
        console.error("导入账号失败:", error);
        showMessage(t("importError"), "error");
      }
    });
  }, [showMessage, t]);

  return { handleImportAccounts, handleExportAccounts };
}

export default useAccountTransfer;

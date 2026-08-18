// SPDX-License-Identifier: GPL-3.0-or-later
// ========== App 常量定义 ==========

// 当前拓展版为单账号工作流。保留批处理结构以兼容历史数据，但只串行执行，
// 避免导入旧账号数据后意外并发访问账号接口。
export const BATCH_SIZE = 1;
export const STAGGER_DELAY = 1500;

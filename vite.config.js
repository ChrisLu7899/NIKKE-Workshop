// SPDX-License-Identifier: GPL-3.0-or-later
// ========== Vite 构建配置文件 ==========
// NIKKE Workshop Chrome 扩展的构建配置

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置：https://vite.dev/config/
export default defineConfig({
  plugins: [react()], // 启用 React 支持
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'index.html',      // 扩展弹窗页面
        options: 'management.html', // 选项管理页面
        calculator: 'calculator.html' // 洗词条计算器页面
      }
    }
  }
})

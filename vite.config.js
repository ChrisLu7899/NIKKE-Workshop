// SPDX-License-Identifier: GPL-3.0-or-later
// ========== Vite 构建配置文件 ==========
// NIKKE Workshop Chrome 扩展的构建配置

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { COMMON_CHARACTER_LIST } from './src/data/commonCharacterList.js'

const copyLocalOcrAssets = () => ({
  name: 'copy-local-ocr-assets',
  async writeBundle(options) {
    const output = resolve(options.dir || 'dist')
    const ocrRoot = resolve(output, 'ocr')
    await mkdir(resolve(ocrRoot, 'core'), { recursive: true })
    await mkdir(resolve(ocrRoot, 'lang'), { recursive: true })
    // Older OCR builds bundled an English model for numeric guessing. Values are
    // now matched against constrained local templates, so remove that stale asset.
    await rm(resolve(ocrRoot, 'lang/eng.traineddata.gz'), { force: true })
    await cp(resolve('node_modules/tesseract.js/dist/worker.min.js'), resolve(ocrRoot, 'worker.min.js'))
    const coreFiles = [
      'tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm',
      'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm',
      'tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm',
    ]
    await Promise.all(coreFiles.map((name) => cp(resolve('node_modules/tesseract.js-core', name), resolve(ocrRoot, 'core', name))))
    // Tesseract.js 7 uses the regular 4.0.0 model. The legacy best_int model
    // emits unsupported-parameter warnings with the bundled v7 WASM core.
    await cp(resolve('node_modules/@tesseract.js-data/chi_sim/4.0.0/chi_sim.traineddata.gz'), resolve(ocrRoot, 'lang/chi_sim.traineddata.gz'))

    const screenshotsRoot = resolve(output, 'screenshots')
    await mkdir(screenshotsRoot, { recursive: true })
    await writeFile(resolve(screenshotsRoot, 'README.txt'), '每个角色使用一个同名文件夹；将该角色的装备详情截图放入文件夹后，在扩展中点击“图片识别”。\r\n非“常用”角色请自行新建文件夹，文件夹名必须与图鉴角色名一致。\r\n', 'utf8')
    await Promise.all(COMMON_CHARACTER_LIST.map(async ({ name }) => {
      const folder = resolve(screenshotsRoot, name)
      await mkdir(folder, { recursive: true })
    }))
  },
})

// Vite 配置：https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyLocalOcrAssets()], // 启用 React 支持，并将 OCR 资源随扩展本地打包
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

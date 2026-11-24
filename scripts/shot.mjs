// 无头浏览器冒烟测试：加载页面、收集控制台错误、截图
import puppeteer from 'puppeteer-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5173/'
const out = process.argv[3] || 'shot.png'
const waitMs = Number(process.argv[4] || 5000)

const browser = await puppeteer.launch({
  executablePath: 'C:/Users/15319/.workbuddy/test-browsers/chromium-test/chromium/win64-1710741/chrome-win/chrome.exe',
  headless: 'new',
  userDataDir: mkdtempSync(join(tmpdir(), 'pptr-')),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox', '--disable-sync', '--disable-extensions'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 })
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('[console.' + m.type() + ']', m.text().slice(0, 500))
})
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 800)))
try {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 })
} catch (e) {
  console.log('[goto]', String(e).slice(0, 300))
}
await new Promise((r) => setTimeout(r, waitMs))
await page.screenshot({ path: out })
console.log('[saved]', out)
await browser.close()

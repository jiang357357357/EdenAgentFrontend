import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../src/", import.meta.url))
const rules = [
  ["固定色值应定义在 theme.css", /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i],
  ["使用语义颜色，勿直接使用 Tailwind 调色板", /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|accent|decoration)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+)(?=[/\s"'`\]}]|$)/],
  ["颜色变量只在 theme.css 定义", /--color-[\w-]+\s*:/],
]

async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sources(filename)
    return /\.(?:tsx?|css)$/.test(entry.name) && filename !== path.join(root, "theme.css") ? [filename] : []
  }))
  return nested.flat()
}

let failures = 0
const files = await sources(root)
for (const filename of files) {
  const lines = (await readFile(filename, "utf8")).split("\n")
  lines.forEach((line, index) => {
    for (const [message, pattern] of rules) {
      if (!pattern.test(line)) continue
      process.stderr.write(`${path.relative(root, filename)}:${index + 1}: ${message}\n`)
      failures++
    }
  })
}
if (failures) process.exitCode = 1
else process.stdout.write(`Theme source check passed (${files.length} files).\n`)

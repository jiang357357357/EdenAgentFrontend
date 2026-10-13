import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { ToolCard } from "../../src/components/chat/message/ToolCard"
import type { ToolCall } from "../../src/types"

function check(condition: unknown, message: string) { if (!condition) throw new Error(message) }
async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 4000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Tool card renderer did not settle")
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

async function runToolCommandTests() {
  const host = document.createElement("main")
  host.className = "interface-dark mx-auto w-[min(54rem,calc(100vw-3rem))] py-6"
  document.body.append(host)
  const root = createRoot(host)
  const command = String.raw`echo "== 站点根目录 =="; curl -s -o /dev/null -w "HTTP %{http_code} %{size_download} bytes\n" http://localhost:8123/; echo "== 夏莱页面 =="; curl -s -o /dev/null -w "HTTP %{http_code} %{size_download} bytes %{content_type}\n" http://localhost:8123/schale/`
  const stdout = '== 站点根目录 ==\nHTTP 200 24623 bytes\n== 夏莱页面 ==\nHTTP 200 29477 bytes text/html\n== 页面标题校验 ==\n<title>夏莱 SCHALE · 联邦搜查社</title>\n== 访问日志 ==\n127.0.0.1 - "GET /schale/ HTTP/1.1" 200 -\n'
  const stderr = 'wsl: 检测到 localhost 代理配置，但未镜像到 WSL。\r\nNAT 模式下的 WSL 不支持 localhost 代理。\r\n'
  const output = JSON.stringify({ stdout, stderr, exitCode: 0 })
  const base: ToolCall = { id: 'fixture', name: 'exec_command', status: 'running', input: JSON.stringify({ command }) }
  const draw = (tool: ToolCall) => flushSync(() => root.render(<ToolCard tool={tool} />))
  const heading = () => host.querySelector<HTMLButtonElement>('button[aria-expanded]')!
  const stream = (label: string) => host.querySelector<HTMLElement>(`section[aria-label="${label}"] pre`)
  draw(base)
  flushSync(() => heading().click())
  await waitFor(() => Boolean(host.textContent?.includes("正在执行中")))
  check(host.querySelector('section[aria-label="工具参数"] pre')?.textContent === command, "Commands must not split quoted escapes or semicolons")
  draw({ ...base, status: 'success', output })
  await waitFor(() => Boolean(stream("标准输出")))
  check(stream("标准输出")?.textContent === stdout && stream("标准错误")?.textContent === stderr, "Decoded streams must preserve every line and literal HTML")
  check(host.textContent?.includes("退出码：0"), "Success exit code must be visible")
  check(!host.querySelector("script,img,title"), "Tool output must remain inert text")
  const style = getComputedStyle(stream("标准输出")!)
  check(style.whiteSpace === "pre-wrap" && Number.parseFloat(style.lineHeight) >= 20, "Output must preserve line breaks with readable spacing")
  const raw = [...host.querySelectorAll('details')].find(value => value.querySelector('summary')?.textContent === "原始结果（JSON）")!
  check(Boolean(raw) && !raw.open, "Raw JSON must be collapsed initially")
  raw.querySelector('summary')!.click()
  check(raw.open && raw.querySelector('pre')?.textContent === output, "Raw result must remain intact and inspectable")
  raw.querySelector('summary')!.click()

  draw({ ...base, status: 'error', output: JSON.stringify({ stdout: '', stderr: 'not found\n', exitCode: 127, outputTruncated: true }) })
  check(host.textContent?.includes("退出码：127") && host.textContent.includes("输出已截断"), "Failures and truncation must be visible")
  draw({ ...base, status: 'success', output: JSON.stringify({ stdout: '', stderr: '', exitCode: 0 }) })
  check(host.textContent?.includes("无输出") && !stream("标准错误"), "Empty output must clear previous failure streams")
  const malformed = '{"stdout":"unfinished\\n'
  draw({ ...base, status: 'success', output: malformed })
  check([...host.querySelectorAll('pre')].some(value => value.textContent === malformed), "Malformed output must fall back verbatim")
  const long = Array.from({ length: 500 }, (_, index) => `line ${index}`).join('\n')
  draw({ ...base, status: 'success', output: JSON.stringify({ stdout: long, stderr: '', exitCode: 0 }) })
  check(stream("标准输出")?.textContent === long, "Long output must not lose lines")
  await waitFor(() => stream("标准输出")!.scrollHeight > stream("标准输出")!.clientHeight)
  check(getComputedStyle(stream("标准输出")!).overflowY === "auto", "Long output must scroll within its block")
  flushSync(() => heading().click())
  await waitFor(() => !stream("标准输出"))
  check(heading().getAttribute('aria-expanded') === 'false', "Results must collapse normally")
  draw({ ...base, status: 'success', output })
  flushSync(() => heading().click())
  await waitFor(() => heading().getAttribute('aria-expanded') === 'true'
    && stream("标准输出")?.textContent === stdout && stream("标准输出")!.getBoundingClientRect().height > 100)
  await waitFor(() => {
    const panel = heading().nextElementSibling as HTMLElement
    return Number(getComputedStyle(panel).opacity) >= 0.999
      && panel.getBoundingClientRect().height >= panel.scrollHeight - 1
  })
  const visibleRaw = [...host.querySelectorAll('details')].find(value => value.querySelector('summary')?.textContent === "原始结果（JSON）")!
  check(visibleRaw.getBoundingClientRect().bottom <= host.getBoundingClientRect().bottom, "Expanded result must not be clipped by its animation container")
  return { liveCompletion: true, separateMultilineStreams: true, commandEscapesPreserved: true,
    rawInspectable: true, failureVisible: true, emptyCleared: true, malformedFallback: true,
    longOutputScrollable: true, collapseWorks: true }
}

Object.assign(window, { runToolCommandTests })

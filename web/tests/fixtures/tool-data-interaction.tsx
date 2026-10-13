import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { ToolCard } from "../../src/components/chat/message/ToolCard"
import { ToolOutput } from "../../src/components/chat/message/ToolOutput"
import { ChatDialogPanel } from "../../src/components/chat/input/ChatDialogPanel"
import type { ToolCall } from "../../src/types"

function check(condition: unknown, message: string) { if (!condition) throw new Error(message) }
async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 5000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Unified tool view did not settle")
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
function summary(label: string, parent: ParentNode): HTMLElement {
  const element = [...parent.querySelectorAll('summary')].find(value => value.textContent?.trim() === label)
  if (!element) throw new Error(`Missing summary: ${label}`)
  return element
}

async function runToolDataTests() {
  const host = document.createElement("main")
  host.className = "interface-dark mx-auto w-[min(54rem,calc(100vw-3rem))] py-6 text-text"
  document.body.append(host)
  const root = createRoot(host)
  const inputValue = { query: '第一行查询\n  第二行查询', params: { text: '嵌套参数\n保留缩进' } }
  const outputValue = { message: '查询已完成\n下面是结果', results: [{ title: '网页标题', content: '第一段内容\n  第二段内容\n第三段内容' }] }
  const input = JSON.stringify(inputValue), output = JSON.stringify(outputValue)
  const makeTool = (name: string): ToolCall => ({ id: name, name, status: 'success', input, output })
  const draw = (name: string) => flushSync(() => root.render(<ToolCard key={name} tool={makeTool(name)} />))
  const section = (label: string) => host.querySelector<HTMLElement>(`section[aria-label="${label}"]`)!
  const header = () => host.querySelector<HTMLButtonElement>('button[aria-expanded]')!
  const openCard = async () => {
    flushSync(() => header().click())
    await waitFor(() => Boolean(section("工具结果")))
    summary("第 1 项 · 2 项", section("工具结果")).click()
    await waitFor(() => [...section("工具结果").querySelectorAll('pre')].some(value => value.textContent === outputValue.results[0].content))
  }
  for (const name of ['web_search', 'read_file', 'mcp__fixture__custom']) {
    draw(name); await openCard()
    const parameters = [...section("工具参数").querySelectorAll('pre')].map(value => value.textContent)
    check(parameters.includes(inputValue.query) && parameters.includes(inputValue.params.text), "All tools must decode input and nested fields")
    const result = [...section("工具结果").querySelectorAll('pre')].map(value => value.textContent)
    check(result.includes(outputValue.message) && result.includes(outputValue.results[0].content), "All tools must decode nested result strings")
    const raw = summary("原始结果（JSON）", section("工具结果"))
    check(!(raw.parentElement as HTMLDetailsElement).open, "Raw JSON must stay folded")
    raw.click()
    check(raw.parentElement!.querySelector('pre')?.textContent === output, "Raw JSON must preserve the complete result")
  }

  const rows = Array.from({ length: 125 }, (_, index) => `row ${index}\nbody`)
  flushSync(() => root.render(<ToolOutput output={JSON.stringify(rows)} />))
  summary("列表 · 125 项", host).click()
  await waitFor(() => host.querySelectorAll('pre').length === 51)
  const more = () => [...host.querySelectorAll('button')].find(value => value.textContent?.startsWith("显示更多"))!
  flushSync(() => more().click())
  check(host.querySelectorAll('pre').length === 101, "Load more must append the next fifty rows")
  flushSync(() => more().click())
  check(host.querySelectorAll('pre').length === 126 && !more(), "The complete collection must remain accessible")
  check([...host.querySelectorAll('pre')].some(value => value.textContent === rows[124]), "The last row must preserve its newline")

  const literal = String.raw`C:\new\tools; printf 'a\nb'`
  flushSync(() => root.render(<ToolOutput output={JSON.stringify({ content: literal })} variant="pet" />))
  check(host.querySelector('pre')?.textContent === literal, "Pet view must preserve literal escapes and paths")
  const malformed = '{"message":"partial\\n'
  flushSync(() => root.render(<ToolOutput output={malformed} />))
  check(host.querySelector('pre')?.textContent === malformed && !host.querySelector('details'), "Incomplete streamed JSON must remain verbatim")
  const long = Array.from({ length: 500 }, (_, index) => `long ${index}`).join('\n')
  flushSync(() => root.render(<ToolOutput output={JSON.stringify({ content: long })} />))
  const pre = host.querySelector('pre')!
  check(pre.textContent === long && pre.scrollHeight > pre.clientHeight, "Long fields must scroll without losing lines")
  check(getComputedStyle(pre).whiteSpace === 'pre-wrap', "Actual line breaks must remain visible")

  let advances = 0
  flushSync(() => root.render(<div className="relative h-[700px]" style={{ containerType: 'size' }}>
    <ChatDialogPanel assistantName="fixture" fontRatio={1} standaloneOverlay={false} onAdvance={() => { advances++ }}
      currentOutput={{ speaker: 'fixture', tool: { ...makeTool('plugin_custom'), output: JSON.stringify(rows) } }} />
  </div>))
  summary("工具: plugin_custom", host).click()
  summary("列表 · 125 项", host).click()
  await waitFor(() => Boolean(more()))
  flushSync(() => more().click())
  check(advances === 0, "Inspecting fields and loading rows must not advance dialog content")

  draw('web_search'); await openCard()
  await waitFor(() => {
    const panel = header().nextElementSibling as HTMLElement
    return header().getAttribute('aria-expanded') === 'true' && Number(getComputedStyle(panel).opacity) >= 0.999
      && panel.getBoundingClientRect().height > 400 && panel.getBoundingClientRect().height >= panel.scrollHeight - 1
  })
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  return { toolTypes: 3, nestedInputOutput: true, rawPreserved: true, paginationComplete: true,
    literalEscapesPreserved: true, streamedFallback: true, longFieldScrollable: true, dialogClickIsolated: true }
}

Object.assign(window, { runToolDataTests })

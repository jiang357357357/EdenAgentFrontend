const assert = require('node:assert/strict')
const { app, BrowserWindow } = require('electron')
const { writeFile, mkdir } = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const [scratch, evidence] = process.argv.slice(2)
app.disableHardwareAcceleration()
app.setPath('userData', path.join(scratch, 'profile'))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function run() {
  const errors = []
  const window = new BrowserWindow({ width: 800, height: 1080, show: false,
    webPreferences: { sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } })
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
  window.webContents.on('render-process-gone', (_event, details) => errors.push(details.reason))
  const js = code => window.webContents.executeJavaScript(code)
  async function until(code) {
    for (let i = 0; i < 160; i++) { if (await js(code)) return; await delay(25) }
    throw new Error(`Question design fixture timed out: ${code}`)
  }
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const option = (index, label) => click(`[data-question-index="${index}"] [aria-label="${label}"]`)
  const progress = count => until(`document.querySelector('[role=progressbar]').getAttribute('aria-valuenow') === '${count}'`)
  async function show(options) {
    await js(`window.questionDesign.show(${JSON.stringify(options)})`)
    await until(`document.querySelectorAll('.question-section').length === ${options.count}`)
    await progress(0)
    await delay(30)
  }
  async function capture(name) {
    await delay(220)
    await writeFile(path.join(evidence, name), (await window.webContents.capturePage()).toPNG())
  }
  const layout = () => js(`(() => {
    const rect = selector => { const r=document.querySelector(selector).getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right} };
    const body=document.querySelector('.question-form-body');
    return { header:rect('.question-form-header'), footer:rect('.question-form-footer'),
      viewport:innerHeight, width:innerWidth, scroll:body.scrollTop, bodyHeight:body.clientHeight, contentHeight:body.scrollHeight,
      horizontalOverflow:document.documentElement.scrollWidth > innerWidth+1 };
  })()`)
  try {
    await mkdir(evidence, { recursive: true })
    await window.loadURL(pathToFileURL(path.join(scratch, 'index.html')).href)
    window.setContentSize(800, 1140)
    await until('window.questionDesign?.ready')
    for (const count of [1, 2, 3]) {
      await show({ count })
      assert.equal(await js(`document.querySelectorAll('.question-navigation button').length`), count)
      assert.equal(await js(`document.querySelector('[role=progressbar]').getAttribute('aria-valuemax')`), String(count))
      assert.equal(await js(`document.querySelector('button[type=submit]').disabled`), true)
      assert.equal(await js(`document.querySelector('button[type=submit]').textContent`), `还需回答 ${count} 个问题`)
      for (let index = 1; index <= count; index++) assert.equal(await js(`document.body.textContent.includes('第 ${index} 题 / 共 ${count} 题')`), true)
      if (count < 3) await capture(`questions-${count}.png`)
    }
    await option(0, '仅当前会话'); await progress(1)
    assert.equal(await js(`document.querySelector('button[type=submit]').textContent`), '还需回答 2 个问题')
    await capture('questions-3.png')
    window.setContentSize(640, 700)
    await delay(40)
    const before = await layout()
    assert.ok(before.contentHeight > before.bodyHeight, 'three questions overflow a short window and must scroll inside the body')
    await click('.question-navigation button:nth-child(3)')
    await until(`document.querySelector('.question-form-body').scrollTop > 0`)
    await until(`document.querySelector('.question-navigation button:nth-child(3)').getAttribute('aria-current') === 'step'`)
    const after = await layout()
    assert.equal(after.header.top, before.header.top, 'header remains fixed while questions scroll')
    assert.equal(after.footer.top, before.footer.top, 'actions remain fixed while questions scroll')
    assert.ok(after.footer.bottom <= after.viewport + 1)
    await option(2, '修改摘要'); await progress(2)
    await option(2, '测试结果'); await progress(2)
    await option(2, '修改摘要'); await option(2, '测试结果'); await progress(1)
    await click('.question-navigation button:nth-child(2)')
    await click('[data-question-index="1"] summary')
    async function custom(index, text) {
      await js(`(() => { const node=document.querySelector('[data-question-index="${index}"] textarea');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,${JSON.stringify(text)});
        node.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    }
    await custom(1, '   '); await progress(1)
    await custom(1, '稍后重启'); await progress(2)
    await option(2, '修改摘要'); await option(2, '测试结果'); await progress(3)
    await js(`document.querySelector('[data-question-index="0"] [role=radio]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`)
    await until(`document.querySelector('[aria-label="所有会话"]').getAttribute('aria-checked') === 'true'`)
    await option(0, '所有会话'); await progress(2)
    await option(0, '所有会话'); await progress(3)
    await js('window.questionDesign.failNext = true')
    await click('button[type=submit]')
    await until(`document.body.textContent.includes('本次提交失败，请重试')`)
    await progress(3)
    assert.equal(await js(`document.querySelector('[data-question-index="1"] textarea').value`), '稍后重启')
    assert.equal(await js(`document.querySelector('button[type=submit]').disabled`), false)
    await click('button[type=submit]'); await until(`document.body.textContent.includes('回答已提交')`)
    const first = await js('window.questionDesign.replies[0]')
    assert.deepEqual(first.answers, [['所有会话'], [], ['修改摘要', '测试结果']])
    assert.deepEqual(first.supplementary, ['', '稍后重启', ''])

    await show({ count: 1, customOnly: true })
    assert.equal(await js(`document.querySelector('.question-kind').textContent`), '自由回答')
    assert.equal(await js(`document.querySelector('details').open`), true, 'free-text-only questions open their answer field immediately')
    await custom(0, '  自由回答  '); await progress(1)
    await click('button[type=submit]'); await until(`window.questionDesign.replies.length === 2`)
    assert.deepEqual((await js('window.questionDesign.replies[1]')).supplementary, ['自由回答'])
    await show({ count: 1, custom: false })
    assert.equal(await js(`document.querySelectorAll('textarea,details').length`), 0)
    assert.equal(await js(`document.activeElement.tagName`), 'FORM', 'the initial focus remains inside the modal form')
    await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}))`)
    assert.equal(await js(`document.activeElement.textContent`), '暂不处理', 'reverse Tab from the initial focus wraps to the last enabled action')
    await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))`)
    assert.equal(await js(`document.activeElement.classList.contains('question-navigation-item')`), true)
    await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`)
    await until(`window.questionDesign.rejected === 1 && !document.querySelector('form')`)

    window.setContentSize(320, 640)
    await show({ count: 3, long: true })
    const narrow = await layout()
    assert.equal(narrow.horizontalOverflow, false)
    assert.ok(narrow.bodyHeight > 100, 'narrow windows retain a useful scrollable question area')
    assert.ok(narrow.footer.bottom <= narrow.viewport + 1)
    assert.equal(await js(`document.querySelectorAll('.question-navigation button').length`), 3)
    await click('.question-navigation button:nth-child(3)')
    await until(`document.querySelector('.question-navigation button:nth-child(3)').getAttribute('aria-current') === 'step'`)
    await capture('questions-3-narrow.png')

    window.setContentSize(800, 1000)
    await show({ count: 3, inline: true })
    assert.equal(await js(`document.querySelector('[role=dialog]') === null`), true)
    await option(0, '仅当前会话'); await progress(1)
    await capture('questions-inline.png')
    await show({ count: 2, inline: true })
    assert.equal(await js(`document.querySelectorAll('[aria-checked=true]').length`), 0, 'a new request never inherits old selected options')
    await js(`document.documentElement.setAttribute('data-base-theme','night')`)
    await capture('questions-dark.png')
    assert.deepEqual(errors, [])
    assert.equal(window.isVisible(), false)
    const report = { passed: true, hiddenNativeWindow: true, nativeInputPerformed: false, actualProductionForms: true,
      counts: [1, 2, 3], fixedHeaderAndFooter: true, separateRadioAndCheckbox: true, questionNavigation: true,
      multiSelectionCountsOnce: true, customAnswerPreserved: true, failureRetryPreservesDraft: true, keyboardFocusAndEscape: true,
      newRequestResetsDraft: true, narrowLayout: narrow, reply: first, consoleErrors: errors }
    await writeFile(path.join(evidence, 'question-form.json'), JSON.stringify(report, null, 2))
    process.stdout.write('QUESTION_FORM_RESULT=' + JSON.stringify(report) + '\n')
  } finally { window.destroy() }
}
app.whenReady().then(run).then(() => app.quit(), error => { process.stderr.write(error.stack || String(error)); app.exit(1) })

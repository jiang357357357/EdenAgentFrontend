import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DesktopRendererReady } from '../../src/components/desktop/DesktopRendererReady'

Object.assign(window, {
  mountStartupFixture() {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <DesktopRendererReady />
        <main style={{ padding: 32, background: '#253246', color: '#fff', minHeight: '100vh' }}>
          <h1>主界面已完成首次绘制</h1>
          <p>临时测试数据，不读取用户账号、会话或数据库。</p>
        </main>
      </StrictMode>,
    )
  },
})

import { createRoot } from 'react-dom/client'
import { DesktopControlBar } from '../../src/components/desktop/DesktopControlBar'

createRoot(document.getElementById('root')!).render(<main className="min-h-screen bg-bg p-8 text-text">
  <h1 className="text-xl">桌面控制验收</h1><p>独立测试页面，不连接用户数据。</p><DesktopControlBar />
</main>)

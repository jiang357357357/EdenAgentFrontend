const card = document.querySelector('.reminder-card')
const closeButton = document.getElementById('close')
const resize = () => requestAnimationFrame(() => window.reminder.resize(Math.ceil(card.getBoundingClientRect().height)))
window.reminder.onContent(value => {
  for (const key of ['world', 'title', 'message']) document.getElementById(key).textContent = String(value[key] ?? '')
  document.getElementById('title').title = String(value.title ?? '')
  if (Number.isFinite(value.maxHeight)) card.style.setProperty('--content-max-height', `${value.maxHeight}px`)
  document.getElementById('message').scrollTop = 0
  resize()
})
window.reminder.onError(message => {
  const error = document.getElementById('error')
  error.textContent = String(message); error.hidden = !message
  closeButton.disabled = false; closeButton.textContent = '知道了'
  resize()
})
closeButton.addEventListener('click', () => {
  closeButton.disabled = true; closeButton.textContent = '关闭中…'
  window.reminder.close()
})
document.fonts.ready.then(resize)

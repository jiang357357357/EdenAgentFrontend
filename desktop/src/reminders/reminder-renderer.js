window.reminder.onContent(value => {
  for (const key of ['world', 'title', 'message']) document.getElementById(key).textContent = String(value[key] ?? '')
})
window.reminder.onError(message => { document.getElementById('error').textContent = String(message) })
document.getElementById('close').addEventListener('click', () => window.reminder.close())

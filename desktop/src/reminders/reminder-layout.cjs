const MARGIN = 16
function reminderLayout(workArea, origin, frameSize = { width: 0, height: 0 }) {
  const availableWidth = Math.max(1, workArea.width - MARGIN * 2)
  const availableHeight = Math.max(1, workArea.height - MARGIN * 2)
  const width = Math.max(1, Math.min(400, availableWidth - frameSize.width))
  const maxHeight = Math.max(1, Math.min(440, availableHeight - frameSize.height))
  const minHeight = Math.min(180, maxHeight)
  const frameWidth = width + frameSize.width
  const offset = origin === 'local' && availableWidth >= frameWidth * 2 + MARGIN ? frameWidth + MARGIN : 0
  return { width, minHeight, maxHeight, bounds(height) {
    const contentHeight = Math.round(Math.min(maxHeight, Math.max(minHeight, height)))
    return { x: workArea.x + workArea.width - frameWidth - MARGIN - offset,
      y: workArea.y + workArea.height - contentHeight - frameSize.height - MARGIN,
      width: frameWidth, height: contentHeight + frameSize.height }
  } }
}
module.exports = { reminderLayout }

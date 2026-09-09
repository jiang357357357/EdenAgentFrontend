/** Portable relative paths avoid Windows aliases, streams and device names. */
export function releasePath(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\\:<>"|?*\x00-\x1f\x7f]/.test(value) || value.startsWith('/')) throw new Error('Invalid release path')
  const parts = value.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || /[ .]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Release path has an ambiguous or reserved component')
  return parts.join('/')
}
export function pathIdentity(value, platform = process.platform) {
  return platform === 'win32' || platform === 'darwin' ? value.normalize('NFC').toLowerCase() : value
}

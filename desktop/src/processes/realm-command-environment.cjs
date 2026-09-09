// Forward only the selected realm's pair and the explicit shared default.
// The host validates complete pairs; a partial scoped pair must never borrow a shared value.
function realmCommandEnvironment(base, origin) {
  if (origin !== 'mon' && origin !== 'local') throw new TypeError('Unsupported command runtime origin')
  const result = {}
  for (const prefix of ['EDEN_AGENT_EXTERNAL_SANDBOX', `EDEN_AGENT_${origin.toUpperCase()}_EXTERNAL_SANDBOX`]) {
    for (const key of [prefix, `${prefix}_SHA256`]) {
      if (base[key] !== undefined) result[key] = base[key]
    }
  }
  return result
}

module.exports = { realmCommandEnvironment }

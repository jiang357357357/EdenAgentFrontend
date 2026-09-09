/** Never report shutdown complete until the child has actually exited. */
function stopServerChild(child, timeoutMs = 5000) {
  if (child.exitCode != null || child.signalCode != null) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let timer
    const cleanup = () => { clearTimeout(timer); child.removeListener("exit", exited) }
    const exited = () => { cleanup(); resolve() }
    child.once("exit", exited)
    timer = setTimeout(() => {
      try { child.kill("SIGKILL") } catch (error) { cleanup(); reject(error); return }
      timer = setTimeout(() => { cleanup(); reject(new Error("Agent server did not exit after termination")) }, timeoutMs)
    }, timeoutMs)
    try {
      if (child.connected) child.send("shutdown", error => {
        if (error) { try { child.kill("SIGTERM") } catch (failure) { cleanup(); reject(failure) } }
      })
      else child.kill("SIGTERM")
    } catch (error) { cleanup(); reject(error) }
  })
}

module.exports = { stopServerChild }

function configureExtensionRenderers(app) {
  // Opaque-origin extension documents must not share the workbench renderer process.
  app.commandLine.appendSwitch('site-per-process')
}
module.exports = { configureExtensionRenderers }

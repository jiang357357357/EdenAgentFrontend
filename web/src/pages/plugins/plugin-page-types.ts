export type PluginActionRunner = (action: () => Promise<unknown>) => Promise<boolean>

import { ModelMenuController } from "../../../../lib/model-menu-controller"
import { useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react"

import {
  getRuntimeModelConfig,
  updateRuntimeModel,
  type RuntimeModelOption,
  type ModelSelectionTarget,
} from "../../../../lib/agent-client"
import type { PermissionMode } from "../../../../types"
import { permissionOptions } from "../ChatInputMenus"

interface ChatSettingsMenusOptions {
  hideComposerFooter: boolean
  onPermissionModeChange?: (mode: PermissionMode) => Promise<void>
  permissionMode: PermissionMode
  sessionId?: string
}

export function useChatSettingsMenus({
  hideComposerFooter,
  onPermissionModeChange,
  permissionMode,
  sessionId,
}: ChatSettingsMenusOptions) {
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false)
  const [permissionSubmitting, setPermissionSubmitting] = useState<PermissionMode | null>(null)
  const [permissionError, setPermissionError] = useState("")
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelController = useMemo(() => new ModelMenuController({ load: getRuntimeModelConfig, save: updateRuntimeModel }, sessionId), [sessionId])
  const { config: modelConfig, loading: modelLoading, submitting: modelSubmitting, error: modelError } =
    useSyncExternalStore(modelController.subscribe, modelController.snapshot, modelController.snapshot)

  const closeMenus = () => {
    setPermissionMenuOpen(false)
    setModelMenuOpen(false)
  }

  const refreshModelConfig = () => modelController.refresh()

  useLayoutEffect(() => {
    modelController.activate()
    setModelMenuOpen(false)
    if (!hideComposerFooter) void modelController.refresh()
    return () => modelController.deactivate()
  }, [hideComposerFooter, modelController])

  const openPermissionMenu = () => {
    setPermissionMenuOpen(true)
    setModelMenuOpen(false)
  }

  const openModelMenu = () => {
    setModelMenuOpen(true)
    setPermissionMenuOpen(false)
    if (!modelLoading) void refreshModelConfig()
  }

  const togglePermissionMenu = () => {
    setPermissionMenuOpen((open) => !open)
    setModelMenuOpen(false)
  }

  const toggleModelMenu = () => {
    const next = !modelMenuOpen
    setModelMenuOpen(next)
    setPermissionMenuOpen(false)
    if (next && !modelLoading) void refreshModelConfig()
  }

  const selectPermissionMode = async (mode: PermissionMode) => {
    if (!onPermissionModeChange || mode === permissionMode) {
      setPermissionMenuOpen(false)
      return
    }
    setPermissionSubmitting(mode)
    setPermissionError("")
    try {
      await onPermissionModeChange(mode)
      setPermissionMenuOpen(false)
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : "权限模式切换失败，请稍后重试。")
    } finally {
      setPermissionSubmitting(null)
    }
  }

  const selectModel = async (option: RuntimeModelOption, target?: ModelSelectionTarget) => {
    if (await modelController.select(option, target)) setModelMenuOpen(false)
  }

  const activePermission = permissionOptions.find((option) => option.mode === permissionMode) ?? permissionOptions[0]
  const currentModel = modelConfig?.current ?? modelConfig?.options.find((option) => option.selected) ?? null
  const currentModelLabel = (modelConfig?.actors?.length ?? 0) > 1 ? "角色模型" : currentModel?.label || (modelLoading ? "..." : "模型")
  const modelButtonTitle = modelError
    ? `模型配置读取失败: ${modelError}`
    : currentModel
      ? `模型: ${currentModel.label} (${currentModel.providerName || currentModel.provider}/${currentModel.modelID})`
      : "模型"

  return {
    activePermission,
    closeMenus,
    currentModel,
    currentModelLabel,
    modelButtonTitle,
    modelConfig,
    modelError,
    modelLoading,
    modelMenuOpen,
    modelSubmitting,
    openModelMenu,
    openPermissionMenu,
    permissionError,
    permissionMenuOpen,
    permissionSubmitting,
    selectModel,
    selectPermissionMode,
    toggleModelMenu,
    togglePermissionMenu,
  }
}

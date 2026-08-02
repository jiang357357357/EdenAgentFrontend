import { useEffect, useState } from "react"

import {
  getRuntimeModelConfig,
  updateRuntimeModel,
  type RuntimeModelConfig,
  type RuntimeModelOption,
} from "../../../../lib/mon_agent_api"
import type { PermissionMode } from "../../../../types"
import { permissionOptions } from "../ChatInputMenus"

interface ChatSettingsMenusOptions {
  hideComposerFooter: boolean
  onPermissionModeChange?: (mode: PermissionMode) => Promise<void>
  permissionMode: PermissionMode
}

export function useChatSettingsMenus({
  hideComposerFooter,
  onPermissionModeChange,
  permissionMode,
}: ChatSettingsMenusOptions) {
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false)
  const [permissionSubmitting, setPermissionSubmitting] = useState<PermissionMode | null>(null)
  const [permissionError, setPermissionError] = useState("")
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelConfig, setModelConfig] = useState<RuntimeModelConfig | null>(null)
  const [modelLoading, setModelLoading] = useState(false)
  const [modelSubmitting, setModelSubmitting] = useState<string | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)

  const closeMenus = () => {
    setPermissionMenuOpen(false)
    setModelMenuOpen(false)
  }

  const refreshModelConfig = async () => {
    setModelLoading(true)
    setModelError(null)
    try {
      setModelConfig(await getRuntimeModelConfig())
    } catch (error) {
      setModelError(error instanceof Error ? error.message : String(error))
    } finally {
      setModelLoading(false)
    }
  }

  useEffect(() => {
    if (hideComposerFooter) return
    let active = true
    setModelLoading(true)
    setModelError(null)
    getRuntimeModelConfig()
      .then((config) => {
        if (active) setModelConfig(config)
      })
      .catch((error) => {
        if (active) setModelError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (active) setModelLoading(false)
      })
    return () => {
      active = false
    }
  }, [hideComposerFooter])

  const openPermissionMenu = () => {
    setPermissionMenuOpen(true)
    setModelMenuOpen(false)
  }

  const openModelMenu = () => {
    setModelMenuOpen(true)
    setPermissionMenuOpen(false)
    if (!modelConfig && !modelLoading) void refreshModelConfig()
  }

  const togglePermissionMenu = () => {
    setPermissionMenuOpen((open) => !open)
    setModelMenuOpen(false)
  }

  const toggleModelMenu = () => {
    setModelMenuOpen((open) => !open)
    setPermissionMenuOpen(false)
    if (!modelConfig && !modelLoading) void refreshModelConfig()
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

  const selectModel = async (option: RuntimeModelOption) => {
    if (option.selected || modelSubmitting) {
      setModelMenuOpen(false)
      return
    }
    setModelSubmitting(option.id)
    setModelError(null)
    try {
      setModelConfig(await updateRuntimeModel(option.aiEntityId))
      setModelMenuOpen(false)
    } catch (error) {
      setModelError(error instanceof Error ? error.message : String(error))
    } finally {
      setModelSubmitting(null)
    }
  }

  const activePermission = permissionOptions.find((option) => option.mode === permissionMode) ?? permissionOptions[0]
  const currentModel = modelConfig?.current ?? modelConfig?.options.find((option) => option.selected) ?? null
  const currentModelLabel = currentModel?.label || (modelLoading ? "..." : "模型")
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

import { useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react"

import { updateDesktopActivityFacts } from "../../../../lib/desktop-window"
import {
  availableSlashCommands,
  filterSlashCommands,
  findSlashCommand,
  parseSlashCommand,
  slashCommandQuery,
  type SlashCommandDefinition,
  type SlashCommandName,
} from "../../../../lib/slash-commands"
import type { PromptAttachment } from "../../../../types"

interface SlashCommandMenuOptions {
  allowTextWhileDisabled?: boolean
  attachments: PromptAttachment[]
  clearAttachments: () => void
  disabled?: boolean
  input: string
  isDialogMode: boolean
  onCompact?: (instructions?: string) => void | Promise<void>
  onNewSession?: () => void | Promise<void>
  onOpenMemo?: () => void
  onOpenModelMenu: () => void
  onOpenPermissionMenu: () => void
  onOpenSelfAwake?: () => void
  onOpenSettings?: () => void
  onOpenSkills?: () => void
  onSend: (text: string, attachments: PromptAttachment[]) => void
  overlay: boolean
  setInput: Dispatch<SetStateAction<string>>
  voiceBusy: boolean
}

export function useSlashCommandMenu({
  allowTextWhileDisabled,
  attachments,
  clearAttachments,
  disabled,
  input,
  isDialogMode,
  onCompact,
  onNewSession,
  onOpenMemo,
  onOpenModelMenu,
  onOpenPermissionMenu,
  onOpenSelfAwake,
  onOpenSettings,
  onOpenSkills,
  onSend,
  overlay,
  setInput,
  voiceBusy,
}: SlashCommandMenuOptions) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [pointerActive, setPointerActive] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const [commandError, setCommandError] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const commands = availableSlashCommands({
    compact: Boolean(onCompact),
    newSession: Boolean(onNewSession),
    settings: Boolean(onOpenSettings),
    memo: Boolean(onOpenMemo),
    selfAwake: Boolean(onOpenSelfAwake),
    skills: Boolean(onOpenSkills),
  })
  const query = slashCommandQuery(input, cursor)
  const filteredCommands = query === null ? [] : filterSlashCommands(commands, query)
  const menuOpen = !voiceBusy
    && !isDialogMode
    && query !== null
    && filteredCommands.length > 0
    && dismissedFor !== input

  useEffect(() => {
    setSelectedIndex(0)
    setPointerActive(false)
  }, [query])

  useEffect(() => {
    if (!menuOpen) return
    const menu = menuRef.current
    const option = optionRefs.current[selectedIndex]
    if (!menu || !option) return
    const frame = window.requestAnimationFrame(() => {
      const optionTop = option.offsetTop
      const optionBottom = optionTop + option.offsetHeight
      const visibleTop = menu.scrollTop
      const visibleBottom = visibleTop + menu.clientHeight
      const edgePadding = 8
      if (optionTop < visibleTop + edgePadding) {
        menu.scrollTo({ top: Math.max(0, optionTop - edgePadding) })
      } else if (optionBottom > visibleBottom - edgePadding) {
        menu.scrollTo({ top: optionBottom - menu.clientHeight + edgePadding })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [menuOpen, selectedIndex])

  const executeCommand = (command: SlashCommandDefinition, args = "") => {
    if (disabled) {
      setCommandError("智能体正在处理当前任务，请稍后再执行命令。")
      setDismissedFor(input)
      return
    }
    if (attachments.length > 0) {
      setCommandError("命令不能和附件一起提交。")
      setDismissedFor(input)
      return
    }

    setInput("")
    setCursor(0)
    clearAttachments()
    setCommandError("")
    setDismissedFor(null)

    const actions: Record<SlashCommandName, () => void | Promise<void>> = {
      help: () => {
        setInput("/")
        setCursor(1)
        window.requestAnimationFrame(() => {
          textareaRef.current?.focus()
          textareaRef.current?.setSelectionRange(1, 1)
        })
      },
      compact: () => onCompact?.(args),
      new: () => void onNewSession?.(),
      model: onOpenModelMenu,
      permissions: onOpenPermissionMenu,
      settings: () => onOpenSettings?.(),
      memo: () => onOpenMemo?.(),
      "self-awake": () => onOpenSelfAwake?.(),
      skills: () => onOpenSkills?.(),
    }
    window.dispatchEvent(new CustomEvent("monagent:slash-command-executed", {
      detail: { command: `/${command.name}${args ? ` ${args}` : ""}` },
    }))
    Promise.resolve(actions[command.name]()).catch((error) => {
      setCommandError(error instanceof Error ? error.message : String(error))
    })
  }

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || voiceBusy) return
    const parsedCommand = parseSlashCommand(input)
    if (parsedCommand) {
      if (disabled) {
        setCommandError("智能体正在处理当前任务；此时只能排队普通文字消息。")
        setDismissedFor(input)
        return
      }
      if (!parsedCommand.name) return
      if (parsedCommand.name.startsWith("skill:")) {
        onSend(input.trim(), attachments)
        void updateDesktopActivityFacts({
          surface: overlay ? "chat-overlay" : "main-chat",
          last_user_interaction_at: new Date().toISOString(),
        })
        setInput("")
        setCursor(0)
        clearAttachments()
        setCommandError("")
        return
      }
      const command = findSlashCommand(commands, parsedCommand.name)
      if (!command) {
        setCommandError(`未知命令 “/${parsedCommand.name}”。输入 / 查看可用命令。`)
        return
      }
      if (parsedCommand.args && !command.acceptsArguments) {
        setCommandError(`/${command.name} 暂不接受参数。`)
        return
      }
      executeCommand(command, parsedCommand.args)
      return
    }

    if (disabled && !allowTextWhileDisabled) return
    if (disabled && attachments.length > 0) {
      setCommandError("运行中的后续消息暂不支持附件，请等待当前回合结束。")
      return
    }

    onSend(input.trim(), attachments)
    void updateDesktopActivityFacts({
      surface: overlay ? "chat-overlay" : "main-chat",
      last_user_interaction_at: new Date().toISOString(),
    })
    setInput("")
    setCursor(0)
    clearAttachments()
    setCommandError("")
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (event.key === "ArrowUp" || (event.ctrlKey && event.key.toLowerCase() === "p")) {
        event.preventDefault()
        setPointerActive(false)
        setSelectedIndex((index) => (index - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (event.key === "ArrowDown" || (event.ctrlKey && event.key.toLowerCase() === "n")) {
        event.preventDefault()
        setPointerActive(false)
        setSelectedIndex((index) => (index + 1) % filteredCommands.length)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setDismissedFor(input)
        return
      }
      if (event.key === "Tab" || event.key === "ArrowRight") {
        const command = filteredCommands[selectedIndex]
        if (command) {
          event.preventDefault()
          setPointerActive(false)
          const completed = `/${command.name} `
          setInput(completed)
          setCursor(completed.length)
          setCommandError("")
          window.requestAnimationFrame(() => {
            textareaRef.current?.focus()
            textareaRef.current?.setSelectionRange(completed.length, completed.length)
          })
        }
        return
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        setPointerActive(false)
        const command = filteredCommands[selectedIndex]
        if (command) executeCommand(command)
        return
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return {
    commandError,
    executeCommand,
    filteredCommands,
    handleKeyDown,
    handleSend,
    menuOpen,
    menuRef,
    optionRefs,
    pointerActive,
    selectedIndex,
    setCommandError,
    setCursor,
    setPointerActive,
    setSelectedIndex,
    textareaRef,
  }
}

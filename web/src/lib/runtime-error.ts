import type { MessageError } from "../types"

interface RuntimeErrorInput {
  name?: string
  message?: string
  data?: {
    message?: string
    code?: string
    path?: string
    status?: number
  }
}

export function presentRuntimeError(
  error: RuntimeErrorInput,
  providerID?: string,
  modelID?: string,
): MessageError {
  const detail = error.data?.message || error.message || error.name || "未知错误"
  const normalized = detail.toLowerCase()
  const model = [providerID, modelID].filter(Boolean).join("/") || undefined

  if (normalized.includes("ssl") && (normalized.includes("unexpected_eof") || normalized.includes("eof occurred"))) {
    return {
      title: "模型连接失败",
      message: "安全连接被远端提前断开。请重试；如果持续发生，请检查网络或模型服务状态。",
      detail,
      model,
    }
  }
  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return {
      title: "模型请求超时",
      message: "模型服务在限定时间内没有返回结果，请稍后重试。",
      detail,
      model,
    }
  }
  if (normalized.includes("401") || normalized.includes("unauthorized") || normalized.includes("invalid api key")) {
    return {
      title: "模型鉴权失败",
      message: "当前模型的访问凭据无效或已经失效，请检查 API Key。",
      detail,
      model,
    }
  }
  if (normalized.includes("429") || normalized.includes("too many requests") || normalized.includes("rate limit")) {
    return {
      title: "模型服务繁忙",
      message: "当前请求受到频率限制，请稍后重试。",
      detail,
      model,
    }
  }
  if (normalized.includes("connection refused") || normalized.includes("name or service not known")) {
    return {
      title: "无法连接模型服务",
      message: "模型服务当前不可达，请检查网络和服务地址。",
      detail,
      model,
    }
  }
  return {
    title: "智能体运行失败",
    message: "本次回复没有生成。请查看技术详情后重试。",
    detail,
    model,
  }
}

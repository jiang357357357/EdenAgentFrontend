function jsonPost(body) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }
}

function createCoreCommandHandlers({
  resolveCoreBaseUrl,
  getDevAccount,
  coreRequest,
  setAuthSession,
  startActivityPresence,
  verifyCoreTokenOnce,
  authHeader,
  stopActivityPresence,
} = {}) {
  return {
    resolve_core_base_url_command: () => resolveCoreBaseUrl(),
    get_dev_account: () => getDevAccount(),
    core_login: async ({ args }) => {
      const response = await coreRequest("/api/users/login/", jsonPost({
        username: args.request?.username,
        password: args.request?.password,
        client_id: args.request?.clientId ?? args.request?.client_id ?? "",
        client_type: args.request?.clientType ?? args.request?.client_type ?? "",
      }))
      setAuthSession(response?.token, {
        valid: true,
        user: response?.user,
        token_info: { expires_at: response?.expires_at },
      })
      startActivityPresence(response?.token, args.request?.clientId ?? args.request?.client_id ?? "")
      return response
    },
    core_verify_token: ({ args }) => verifyCoreTokenOnce(args.token, args.clientId ?? args.client_id ?? ""),
    core_default_assistant: ({ args }) => coreRequest("/api/assistants/default/", {
      method: "GET",
      headers: authHeader(args.token),
    }),
    core_current_assistant: ({ args }) => coreRequest("/api/assistants/current/", {
      method: "GET",
      headers: authHeader(args.token),
    }),
    core_list_assistants: ({ args }) => coreRequest(
      args.summary ? "/api/assistants/?summary=1" : "/api/assistants/",
      {
      method: "GET",
      headers: authHeader(args.token),
      },
    ),
    core_get_assistant: ({ args }) => coreRequest(`/api/assistants/${args.assistantId}/`, {
      method: "GET",
      headers: authHeader(args.token),
    }),
    core_update_assistant: ({ args }) => coreRequest(`/api/assistants/${args.assistantId}/`, {
      method: "PATCH",
      headers: { ...authHeader(args.token), "content-type": "application/json" },
      body: JSON.stringify(args.input ?? {}),
    }),
    core_update_agent_settings: ({ args }) => coreRequest("/api/agent/settings/my/", {
      method: "PATCH",
      headers: { ...authHeader(args.token), "content-type": "application/json" },
      body: JSON.stringify(args.input ?? {}),
    }),
    core_user_profile: ({ args }) => coreRequest("/api/users/me/profile/", {
      method: "GET",
      headers: authHeader(args.token),
    }),
    core_update_user_profile: ({ args }) => coreRequest("/api/users/me/profile/", {
      method: "PATCH",
      headers: { ...authHeader(args.token), "content-type": "application/json" },
      body: JSON.stringify(args.input ?? {}),
    }),
    core_logout: async ({ args }) => {
      try {
        return await coreRequest("/api/users/logout/", { method: "POST", headers: authHeader(args.token) })
      } finally {
        setAuthSession(null, null)
        stopActivityPresence()
      }
    },
  }
}

module.exports = { createCoreCommandHandlers, jsonPost }

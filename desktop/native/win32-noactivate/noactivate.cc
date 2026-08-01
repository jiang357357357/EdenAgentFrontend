#include <node_api.h>
#include <windows.h>
#include <commctrl.h>

#include <algorithm>
#include <cstdint>
#include <cstring>

namespace {

constexpr UINT_PTR kNoActivateSubclassId = 0x4D4F4E41;  // "MONA"

LRESULT CALLBACK NoActivateSubclassProc(
    HWND hwnd,
    UINT message,
    WPARAM w_param,
    LPARAM l_param,
    UINT_PTR subclass_id,
    DWORD_PTR) {
  if (message == WM_MOUSEACTIVATE) {
    return MA_NOACTIVATE;
  }
  if (message == WM_NCDESTROY) {
    RemoveWindowSubclass(hwnd, NoActivateSubclassProc, subclass_id);
  }
  return DefSubclassProc(hwnd, message, w_param, l_param);
}

void ThrowLastError(napi_env env, const char* operation) {
  const DWORD error_code = GetLastError();
  char message[160] = {};
  _snprintf_s(
      message,
      sizeof(message),
      _TRUNCATE,
      "%s failed with Win32 error %lu",
      operation,
      static_cast<unsigned long>(error_code));
  napi_throw_error(env, nullptr, message);
}

bool ReadWindowHandle(napi_env env, napi_value value, HWND* result) {
  bool is_buffer = false;
  if (napi_is_buffer(env, value, &is_buffer) != napi_ok || !is_buffer) {
    napi_throw_type_error(env, nullptr, "Expected Electron native window handle Buffer");
    return false;
  }

  void* data = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &data, &length) != napi_ok || data == nullptr || length == 0) {
    napi_throw_type_error(env, nullptr, "Native window handle Buffer is empty");
    return false;
  }

  uintptr_t raw_handle = 0;
  std::memcpy(&raw_handle, data, std::min(length, sizeof(raw_handle)));
  HWND hwnd = reinterpret_cast<HWND>(raw_handle);
  if (hwnd == nullptr || !IsWindow(hwnd)) {
    napi_throw_range_error(env, nullptr, "Native window handle is not a valid HWND");
    return false;
  }

  *result = hwnd;
  return true;
}

bool ReadBoolean(napi_env env, napi_value value, bool* result) {
  napi_valuetype value_type = napi_undefined;
  if (napi_typeof(env, value, &value_type) != napi_ok || value_type != napi_boolean) {
    napi_throw_type_error(env, nullptr, "Expected enabled to be a boolean");
    return false;
  }
  return napi_get_value_bool(env, value, result) == napi_ok;
}

bool SetNoActivateStyle(HWND hwnd, bool enabled) {
  SetLastError(ERROR_SUCCESS);
  const LONG_PTR current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
  if (current_style == 0 && GetLastError() != ERROR_SUCCESS) {
    return false;
  }

  const LONG_PTR requested_style = enabled
      ? current_style | static_cast<LONG_PTR>(WS_EX_NOACTIVATE)
      : current_style & ~static_cast<LONG_PTR>(WS_EX_NOACTIVATE);
  if (requested_style != current_style) {
    SetLastError(ERROR_SUCCESS);
    const LONG_PTR previous_style = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, requested_style);
    if (previous_style == 0 && GetLastError() != ERROR_SUCCESS) {
      return false;
    }
    if (!SetWindowPos(
            hwnd,
            nullptr,
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)) {
      return false;
    }
  }
  return true;
}

napi_value SetNoActivate(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = {};
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 2) {
    napi_throw_type_error(env, nullptr, "setNoActivate(handle, enabled) requires two arguments");
    return nullptr;
  }

  HWND hwnd = nullptr;
  bool enabled = false;
  if (!ReadWindowHandle(env, argv[0], &hwnd) || !ReadBoolean(env, argv[1], &enabled)) {
    return nullptr;
  }

  if (enabled) {
    INITCOMMONCONTROLSEX controls = {sizeof(INITCOMMONCONTROLSEX), ICC_STANDARD_CLASSES};
    InitCommonControlsEx(&controls);
    if (!SetWindowSubclass(hwnd, NoActivateSubclassProc, kNoActivateSubclassId, 0)) {
      ThrowLastError(env, "SetWindowSubclass");
      return nullptr;
    }
  } else {
    RemoveWindowSubclass(hwnd, NoActivateSubclassProc, kNoActivateSubclassId);
  }

  if (!SetNoActivateStyle(hwnd, enabled)) {
    if (enabled) RemoveWindowSubclass(hwnd, NoActivateSubclassProc, kNoActivateSubclassId);
    ThrowLastError(env, "SetWindowLongPtr/SetWindowPos");
    return nullptr;
  }

  napi_value result = nullptr;
  napi_get_boolean(env, true, &result);
  return result;
}

napi_value IsNoActivate(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {};
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 1) {
    napi_throw_type_error(env, nullptr, "isNoActivate(handle) requires one argument");
    return nullptr;
  }

  HWND hwnd = nullptr;
  if (!ReadWindowHandle(env, argv[0], &hwnd)) return nullptr;
  SetLastError(ERROR_SUCCESS);
  const LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
  if (style == 0 && GetLastError() != ERROR_SUCCESS) {
    ThrowLastError(env, "GetWindowLongPtr");
    return nullptr;
  }

  napi_value result = nullptr;
  napi_get_boolean(env, (style & static_cast<LONG_PTR>(WS_EX_NOACTIVATE)) != 0, &result);
  return result;
}

napi_value ProbeMouseActivate(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {};
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 1) {
    napi_throw_type_error(env, nullptr, "probeMouseActivate(handle) requires one argument");
    return nullptr;
  }

  HWND hwnd = nullptr;
  if (!ReadWindowHandle(env, argv[0], &hwnd)) return nullptr;
  const LRESULT response = SendMessageW(
      hwnd,
      WM_MOUSEACTIVATE,
      reinterpret_cast<WPARAM>(hwnd),
      MAKELPARAM(HTCLIENT, WM_LBUTTONDOWN));
  napi_value result = nullptr;
  napi_create_int32(env, static_cast<int32_t>(response), &result);
  return result;
}

napi_value SetTopmost(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = {};
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 2) {
    napi_throw_type_error(env, nullptr, "setTopmost(handle, enabled) requires two arguments");
    return nullptr;
  }

  HWND hwnd = nullptr;
  bool enabled = false;
  if (!ReadWindowHandle(env, argv[0], &hwnd) || !ReadBoolean(env, argv[1], &enabled)) {
    return nullptr;
  }
  if (!SetWindowPos(
          hwnd,
          enabled ? HWND_TOPMOST : HWND_NOTOPMOST,
          0,
          0,
          0,
          0,
          SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)) {
    ThrowLastError(env, "SetWindowPos(HWND_TOPMOST)");
    return nullptr;
  }

  napi_value result = nullptr;
  napi_get_boolean(env, true, &result);
  return result;
}

napi_value IsTopmost(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {};
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 1) {
    napi_throw_type_error(env, nullptr, "isTopmost(handle) requires one argument");
    return nullptr;
  }

  HWND hwnd = nullptr;
  if (!ReadWindowHandle(env, argv[0], &hwnd)) return nullptr;
  SetLastError(ERROR_SUCCESS);
  const LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
  if (style == 0 && GetLastError() != ERROR_SUCCESS) {
    ThrowLastError(env, "GetWindowLongPtr");
    return nullptr;
  }

  napi_value result = nullptr;
  napi_get_boolean(env, (style & static_cast<LONG_PTR>(WS_EX_TOPMOST)) != 0, &result);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor descriptors[] = {
      {"setNoActivate", nullptr, SetNoActivate, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"isNoActivate", nullptr, IsNoActivate, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"probeMouseActivate", nullptr, ProbeMouseActivate, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"setTopmost", nullptr, SetTopmost, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"isTopmost", nullptr, IsTopmost, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  if (napi_define_properties(env, exports, 5, descriptors) != napi_ok) {
    return nullptr;
  }
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)

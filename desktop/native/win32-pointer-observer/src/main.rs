#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("edenagent-pointer-observer is only supported on Windows");
    std::process::exit(1);
}

#[cfg(target_os = "windows")]
mod windows_observer {
    use std::io::{self, BufWriter, Write};
    use std::ptr::null_mut;
    use std::sync::mpsc::{sync_channel, SyncSender};
    use std::sync::OnceLock;
    use std::thread;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        UnhookWindowsHookEx, HHOOK, LLMHF_INJECTED, MSG, MSLLHOOKSTRUCT, WH_MOUSE_LL,
        WM_LBUTTONDOWN, WM_LBUTTONUP,
    };

    #[derive(Clone, Copy)]
    struct PointerEvent {
        phase: &'static str,
        time: u32,
    }

    static EVENT_SENDER: OnceLock<SyncSender<PointerEvent>> = OnceLock::new();

    unsafe extern "system" fn mouse_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 && lparam != 0 {
            let details = unsafe { &*(lparam as *const MSLLHOOKSTRUCT) };
            if details.flags & LLMHF_INJECTED == 0 {
                let phase = match wparam as u32 {
                    WM_LBUTTONDOWN => Some("down"),
                    WM_LBUTTONUP => Some("up"),
                    _ => None,
                };
                if let (Some(phase), Some(sender)) = (phase, EVENT_SENDER.get()) {
                    let _ = sender.try_send(PointerEvent {
                        phase,
                        time: details.time,
                    });
                }
            }
        }
        unsafe { CallNextHookEx(null_mut(), code, wparam, lparam) }
    }

    fn write_events(receiver: std::sync::mpsc::Receiver<PointerEvent>) {
        let stdout = io::stdout();
        let mut output = BufWriter::new(stdout.lock());
        if writeln!(output, "{{\"type\":\"ready\"}}").is_err() || output.flush().is_err() {
            return;
        }
        while let Ok(event) = receiver.recv() {
            if writeln!(
                output,
                "{{\"type\":\"{}\",\"button\":\"left\",\"time\":{}}}",
                event.phase, event.time
            )
            .is_err()
                || output.flush().is_err()
            {
                return;
            }
        }
    }

    pub fn run() -> Result<(), String> {
        let (sender, receiver) = sync_channel(128);
        EVENT_SENDER
            .set(sender)
            .map_err(|_| "pointer observer event channel was already initialized".to_string())?;
        thread::Builder::new()
            .name("pointer-event-writer".to_string())
            .spawn(move || write_events(receiver))
            .map_err(|error| format!("failed to start pointer event writer: {error}"))?;

        let hook: HHOOK = unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), null_mut(), 0) };
        if hook.is_null() {
            return Err(format!(
                "SetWindowsHookExW(WH_MOUSE_LL) failed: {}",
                io::Error::last_os_error()
            ));
        }

        let mut message = MSG::default();
        loop {
            let result = unsafe { GetMessageW(&mut message, null_mut(), 0, 0) };
            if result <= 0 {
                break;
            }
            unsafe {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
        unsafe {
            UnhookWindowsHookEx(hook);
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn main() {
    if let Err(error) = windows_observer::run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

//! Windows child-process helpers.
//!
//! Console programs spawned by the app (`node`, `pi`, `lms`, `taskkill`, MCP
//! stdio servers) would otherwise flash a command prompt because the release
//! build has no console of its own. Every spawn site must opt out explicitly.

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// `CREATE_NO_WINDOW` from the Windows process creation flags.
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Hide the console window for a blocking `std::process::Command`.
pub fn hide_console(_command: &mut std::process::Command) {
    #[cfg(windows)]
    {
        _command.creation_flags(CREATE_NO_WINDOW);
    }
}

/// Hide the console window for a `tokio::process::Command` (MCP stdio servers).
pub fn hide_console_async(_command: &mut tokio::process::Command) {
    #[cfg(windows)]
    {
        _command.creation_flags(CREATE_NO_WINDOW);
    }
}

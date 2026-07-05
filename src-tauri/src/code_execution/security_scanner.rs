pub(crate) fn scan_python_code(
    code: &str,
    workspace_root: Option<&std::path::Path>,
) -> Result<(), String> {
    let (no_comments, no_strings) = strip_comments_and_strings(code);
    let blocked_modules = [
        "os",
        "subprocess",
        "shutil",
        "ctypes",
        "socket",
        "multiprocessing",
        "tempfile",
        "builtins",
    ];
    let known_safe_modules = [
        "math",
        "json",
        "csv",
        "re",
        "collections",
        "itertools",
        "functools",
        "typing",
        "datetime",
        "random",
        "statistics",
        "decimal",
        "fractions",
        "string",
        "textwrap",
        "difflib",
        "hashlib",
        "base64",
        "uuid",
        "dataclasses",
        "enum",
        "heapq",
        "bisect",
        "array",
        "struct",
        "pprint",
    ];
    let _ = known_safe_modules;

    for (line_index, (plain_line, raw_line)) in
        no_strings.lines().zip(no_comments.lines()).enumerate()
    {
        let line_no = line_index + 1;
        for statement in plain_line.split(';') {
            let candidate = statement.trim();
            if candidate.is_empty() {
                continue;
            }

            let import_candidate = candidate
                .split(':')
                .next_back()
                .map(str::trim)
                .unwrap_or(candidate);

            if let Some(rest) = import_candidate.strip_prefix("import ") {
                for item in rest.split(',') {
                    let module = item.split_whitespace().next().unwrap_or("");
                    let root = module.split('.').next().unwrap_or(module);
                    if blocked_modules.contains(&root) {
                        return Err(format!("line {line_no}: import of '{root}' is blocked"));
                    }
                }
            } else if let Some(rest) = import_candidate.strip_prefix("from ") {
                if let Some((module, _imports)) = rest.split_once(" import ") {
                    let root = module.trim().split('.').next().unwrap_or(module.trim());
                    if blocked_modules.contains(&root) {
                        return Err(format!("line {line_no}: import from '{root}' is blocked"));
                    }
                }
            }

            if candidate.contains("__import__") {
                return Err(format!(
                    "line {line_no}: dynamic import via __import__ is blocked"
                ));
            }
            if candidate.contains("importlib.import_module") {
                return Err(format!(
                    "line {line_no}: dynamic import via importlib.import_module is blocked"
                ));
            }
            if candidate.contains("exec(") || candidate == "exec" || candidate.starts_with("exec ")
            {
                return Err(format!("line {line_no}: exec() is blocked"));
            }
            if candidate.contains("eval(") || candidate == "eval" || candidate.starts_with("eval ")
            {
                return Err(format!("line {line_no}: eval() is blocked"));
            }
            if candidate.contains("compile(")
                || candidate == "compile"
                || candidate.starts_with("compile ")
            {
                return Err(format!("line {line_no}: compile() is blocked"));
            }

            if let Some(message) = blocked_sys_usage(candidate) {
                return Err(format!("line {line_no}: {message}"));
            }

            if let Some(message) = blocked_pathlib_usage(candidate) {
                return Err(format!("line {line_no}: {message}"));
            }

            if let Some(message) = blocked_open_mode(raw_line, workspace_root) {
                return Err(format!("line {line_no}: {message}"));
            }
        }
    }

    Ok(())
}

pub(crate) fn blocked_sys_usage(line: &str) -> Option<&'static str> {
    let blocked_patterns = [
        "sys.exit",
        "sys.settrace",
        "sys.setprofile",
        "sys.setrecursionlimit",
        "sys.addaudithook",
        "sys.modules",
        "sys.path_hooks",
        "sys.path_importer_cache",
        "sys.meta_path",
        "sys.path =",
    ];

    for pattern in blocked_patterns {
        if line.contains(pattern) {
            return Some("sys usage is restricted to read-only inspection");
        }
    }

    if has_sys_attribute_assignment(line) {
        return Some("sys attribute assignment is blocked");
    }

    None
}

pub(crate) fn has_sys_attribute_assignment(line: &str) -> bool {
    let mut search_start = 0;
    while let Some(index) = find_token(line, "sys.", search_start) {
        let after = &line[index + "sys.".len()..];
        let mut chars = after.chars().peekable();
        let mut saw_identifier = false;

        while let Some(ch) = chars.peek().copied() {
            if ch.is_ascii_alphanumeric() || ch == '_' {
                saw_identifier = true;
                chars.next();
            } else {
                break;
            }
        }

        if !saw_identifier {
            search_start = index + "sys.".len();
            continue;
        }

        while matches!(chars.peek(), Some(ch) if ch.is_ascii_whitespace()) {
            chars.next();
        }

        if matches!(chars.peek(), Some(&'=')) && !matches!(chars.clone().nth(1), Some('=')) {
            return true;
        }

        search_start = index + "sys.".len();
    }

    false
}

pub(crate) fn blocked_pathlib_usage(line: &str) -> Option<&'static str> {
    let blocked_write_patterns = [
        ".write_text(",
        ".write_bytes(",
        ".touch(",
        ".mkdir(",
        ".rename(",
        ".replace(",
        ".unlink(",
        ".rmdir(",
        ".symlink_to(",
        ".hardlink_to(",
        ".chmod(",
        ".lchmod(",
    ];

    for pattern in blocked_write_patterns {
        if line.contains(pattern) {
            return Some("pathlib write helpers are blocked; read-only access only");
        }
    }

    let blocked_read_patterns = [".read_text(", ".read_bytes(", ".readlink(", ".open("];
    for pattern in blocked_read_patterns {
        if line.contains(pattern) {
            return Some("pathlib file access is blocked; use open() for workspace-confined reads");
        }
    }

    None
}

pub(crate) fn blocked_open_mode(
    line: &str,
    workspace_root: Option<&std::path::Path>,
) -> Option<&'static str> {
    let mut search_start = 0;
    while let Some(index) = find_token(line, "open(", search_start) {
        let tail = &line[index + "open(".len()..];
        if let Some(mode) = parse_open_mode(tail) {
            if mode.chars().any(|ch| matches!(ch, 'w' | 'a' | 'x' | '+')) {
                return Some("file open mode is write-capable; read-only access only");
            }
        } else {
            return Some("open() with a non-literal mode is blocked for safety");
        }

        if let Some(path_str) = parse_open_first_arg(tail) {
            if let Some(reason) = blocked_open_path(&path_str, workspace_root) {
                return Some(reason);
            }
        }

        search_start = index + "open(".len();
    }

    None
}

pub(crate) fn find_token(haystack: &str, needle: &str, start: usize) -> Option<usize> {
    let mut search = start;
    while let Some(index) = haystack[search..].find(needle) {
        let absolute = search + index;
        let is_boundary = haystack[..absolute]
            .chars()
            .next_back()
            .map(|ch| !ch.is_ascii_alphanumeric() && ch != '_')
            .unwrap_or(true);
        if is_boundary {
            return Some(absolute);
        }
        search = absolute + needle.len();
    }
    None
}

pub(crate) fn parse_open_mode(args: &str) -> Option<String> {
    let mut current = String::new();
    let mut args_list = Vec::new();
    let mut depth = 0usize;
    let mut string_quote: Option<char> = None;
    let mut escaped = false;

    for ch in args.chars() {
        if let Some(quote) = string_quote {
            current.push(ch);
            if escaped {
                escaped = false;
                continue;
            }
            match ch {
                '\\' => escaped = true,
                c if c == quote => string_quote = None,
                _ => {}
            }
            continue;
        }

        match ch {
            '(' | '[' | '{' => {
                depth += 1;
                current.push(ch);
            }
            ')' if depth == 0 => {
                if !current.trim().is_empty() {
                    args_list.push(current.trim().to_string());
                }
                break;
            }
            ')' => {
                depth = depth.saturating_sub(1);
                current.push(ch);
            }
            ',' if depth == 0 => {
                args_list.push(current.trim().to_string());
                current.clear();
            }
            '"' | '\'' => {
                string_quote = Some(ch);
                current.push(ch);
            }
            _ => current.push(ch),
        }
    }

    if args_list.is_empty() {
        return None;
    }

    for arg in args_list.iter().skip(1) {
        if let Some(value) = arg.strip_prefix("mode=") {
            return extract_string_literal(value.trim());
        }
    }

    if let Some(second) = args_list.get(1) {
        let second = second.trim();
        if second.contains('=') {
            return Some("r".to_string());
        }
        return extract_string_literal(second);
    }

    Some("r".to_string())
}

pub(crate) fn extract_string_literal(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() < 2 {
        return None;
    }

    let mut chars = trimmed.chars();
    let quote = chars.next()?;
    if quote != '\'' && quote != '"' {
        return None;
    }
    if !trimmed.ends_with(quote) {
        return None;
    }

    Some(trimmed[1..trimmed.len() - 1].to_string())
}

pub(crate) fn parse_open_first_arg(args: &str) -> Option<String> {
    let mut current = String::new();
    let mut depth = 0usize;
    let mut string_quote: Option<char> = None;
    let mut escaped = false;

    for ch in args.chars() {
        if let Some(quote) = string_quote {
            current.push(ch);
            if escaped {
                escaped = false;
                continue;
            }
            match ch {
                '\\' => escaped = true,
                c if c == quote => string_quote = None,
                _ => {}
            }
            continue;
        }

        match ch {
            '(' | '[' | '{' => {
                depth += 1;
                current.push(ch);
            }
            ')' if depth == 0 => {
                if !current.trim().is_empty() {
                    return extract_string_literal(&current);
                }
                break;
            }
            ')' => {
                depth = depth.saturating_sub(1);
                current.push(ch);
            }
            ',' if depth == 0 => {
                if !current.trim().is_empty() {
                    return extract_string_literal(&current);
                }
                current.clear();
            }
            '"' | '\'' => {
                string_quote = Some(ch);
                current.push(ch);
            }
            _ => current.push(ch),
        }
    }

    None
}

pub(crate) fn blocked_open_path(
    path_str: &str,
    workspace_root: Option<&std::path::Path>,
) -> Option<&'static str> {
    let trimmed = path_str.trim();
    if trimmed.is_empty() {
        return None;
    }

    let lower = trimmed.replace('\\', "/").to_lowercase();

    // Always block traversal attempts
    if trimmed.contains("..") {
        return Some("open() path contains traversal (..)");
    }

    // Always block network/UNC paths
    if trimmed.starts_with("\\\\") || lower.starts_with("//") {
        return Some("open() path targets a network location");
    }

    // Always block known system directories
    let dangerous_dirs = [
        "/etc", "/proc", "/sys", "/dev", "/root", "/boot", "/sbin", "/bin", "/lib", "/usr",
    ];
    for dir in &dangerous_dirs {
        if lower.starts_with(dir) || lower.contains(&format!("{}/", dir)) {
            return Some("open() path targets a restricted system directory");
        }
    }
    let windows_blocked = [
        "c:\\windows",
        "c:\\program files",
        "c:\\programdata",
        "c:\\$windows",
        "c:\\boot",
        "c:\\recovery",
        "d:\\windows",
        "d:\\program files",
        "e:\\windows",
        "e:\\program files",
    ];
    for prefix in &windows_blocked {
        if lower.starts_with(prefix) {
            return Some("open() path targets a restricted system directory");
        }
    }

    // When a workspace root is configured, enforce containment
    if let Some(ws) = workspace_root {
        let path = std::path::Path::new(trimmed);
        let resolved = if path.is_absolute() {
            match std::fs::canonicalize(path) {
                Ok(p) => p,
                Err(_) => return Some("open() path could not be resolved"),
            }
        } else {
            let candidate = ws.join(trimmed);
            match std::fs::canonicalize(&candidate) {
                Ok(p) => p,
                Err(_) => return Some("open() path could not be resolved"),
            }
        };

        let ws_canonical = match std::fs::canonicalize(ws) {
            Ok(p) => p,
            Err(_) => return Some("open() workspace root could not be resolved"),
        };
        if !resolved.starts_with(&ws_canonical) {
            return Some("open() path is outside the workspace root");
        }
    }

    None
}

pub(crate) fn strip_comments_and_strings(code: &str) -> (String, String) {
    let mut no_comments = String::with_capacity(code.len());
    let mut no_strings = String::with_capacity(code.len());
    let mut chars = code.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '#' => {
                for next in chars.by_ref() {
                    if next == '\n' {
                        no_comments.push('\n');
                        no_strings.push('\n');
                        break;
                    }
                }
            }
            '\'' | '"' => {
                let quote = ch;
                let triple = chars.peek() == Some(&quote) && {
                    let mut clone = chars.clone();
                    clone.next();
                    clone.peek() == Some(&quote)
                };

                no_comments.push(ch);
                no_strings.push(' ');
                if triple {
                    for _ in 0..2 {
                        if let Some(next) = chars.next() {
                            no_comments.push(next);
                            no_strings.push(' ');
                        }
                    }
                }

                let mut escaped = false;
                loop {
                    let Some(next) = chars.next() else {
                        break;
                    };
                    no_comments.push(next);
                    no_strings.push(if next == '\n' { '\n' } else { ' ' });

                    if escaped {
                        escaped = false;
                        continue;
                    }
                    if next == '\\' {
                        escaped = true;
                        continue;
                    }

                    if triple {
                        if next == quote && chars.peek() == Some(&quote) {
                            let mut clone = chars.clone();
                            clone.next();
                            if clone.peek() == Some(&quote) {
                                if let Some(second) = chars.next() {
                                    no_comments.push(second);
                                    no_strings.push(' ');
                                }
                                if let Some(third) = chars.next() {
                                    no_comments.push(third);
                                    no_strings.push(' ');
                                }
                                break;
                            }
                        }
                    } else if next == quote {
                        break;
                    }
                }
            }
            _ => {
                no_comments.push(ch);
                no_strings.push(ch);
            }
        }
    }

    (no_comments, no_strings)
}

#[cfg(test)]
mod tests {
    use super::scan_python_code;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_dir(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("veyra-code-exec-{name}-{nanos}"))
    }

    #[test]
    fn allows_safe_imports() {
        let code = r#"
import json
from math import sqrt
value = sqrt(9)
"#;
        assert!(scan_python_code(code, None).is_ok());
    }

    #[test]
    fn blocks_dangerous_imports() {
        let code = r#"import os
"#;
        let error = scan_python_code(code, None).unwrap_err();
        assert!(error.contains("os"));
    }

    #[test]
    fn blocks_exec_bypass() {
        let code = r#"exec("import os")"#;
        let error = scan_python_code(code, None).unwrap_err();
        assert!(error.contains("exec"));
    }

    #[test]
    fn blocks_write_open_mode() {
        let code = "with open('x.txt', 'w') as f:\n    f.write('nope')";
        let error = scan_python_code(code, None).unwrap_err();
        assert!(error.contains("write-capable"));
    }

    #[test]
    fn blocks_pathlib_writes() {
        let code = "from pathlib import Path\nPath('x.txt').write_text('hello')";
        let error = scan_python_code(code, None).unwrap_err();
        assert!(error.contains("pathlib"));
    }

    #[test]
    fn blocks_pathlib_reads() {
        let code = "from pathlib import Path\nsecret = Path('x.txt').read_text()";
        let error = scan_python_code(code, None).unwrap_err();
        assert!(error.contains("pathlib"));
    }

    #[test]
    fn allows_open_read_inside_workspace() {
        let workspace = unique_test_dir("workspace-read");
        fs::create_dir_all(&workspace).expect("create temp workspace");
        fs::write(workspace.join("safe.txt"), "ok").expect("write temp file");

        let code = "with open('safe.txt', 'r') as f:\n    data = f.read()";
        let result = scan_python_code(code, Some(&workspace));

        let _ = fs::remove_dir_all(&workspace);
        assert!(result.is_ok(), "unexpected scanner error: {result:?}");
    }

    #[test]
    fn blocks_open_read_outside_workspace() {
        let workspace = unique_test_dir("workspace");
        let outside = unique_test_dir("outside");
        fs::create_dir_all(&workspace).expect("create temp workspace");
        fs::create_dir_all(&outside).expect("create outside dir");
        let outside_file = outside.join("secret.txt");
        fs::write(&outside_file, "secret").expect("write outside file");
        let outside_path = outside_file.to_string_lossy().replace('\\', "/");
        let code = format!("with open('{outside_path}', 'r') as f:\n    data = f.read()");

        let error = scan_python_code(&code, Some(&workspace)).unwrap_err();

        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&outside);
        assert!(
            error.contains("outside the workspace"),
            "unexpected scanner error: {error}"
        );
    }
}

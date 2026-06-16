use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const CACHE_CAP_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Serialize, Deserialize, Clone)]
pub struct CachedEntry {
    pub url: String,
    pub fetched_at_unix: i64,
    pub ttl_secs: i64,
    pub status: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub error_reason: Option<String>,
    #[serde(default)]
    pub max_chars: usize,
}

#[derive(Serialize)]
pub struct CacheStats {
    pub entries: usize,
    pub total_bytes: u64,
}

fn ensure_dir(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| format!("Failed to create cache dir: {e}"))?;
    }
    Ok(())
}

fn key_path(url: &str, max_chars: usize, dir: &Path) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    hasher.update(b"|mc|");
    hasher.update(max_chars.to_le_bytes());
    let hash = format!("{:x}", hasher.finalize());
    dir.join(format!("{hash}.json"))
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn now_unix_static() -> i64 {
    now_unix()
}

pub fn read(url: &str, max_chars: usize, cache_dir: &Path) -> Option<CachedEntry> {
    let path = key_path(url, max_chars, cache_dir);
    let raw = fs::read_to_string(&path).ok()?;
    let entry: CachedEntry = serde_json::from_str(&raw).ok()?;

    let expires_at = entry.fetched_at_unix.saturating_add(entry.ttl_secs.max(0));
    if now_unix() >= expires_at {
        let _ = fs::remove_file(&path);
        return None;
    }

    Some(entry)
}

pub fn write(
    url: &str,
    max_chars: usize,
    entry: &CachedEntry,
    cache_dir: &Path,
) -> Result<(), String> {
    ensure_dir(cache_dir)?;
    let path = key_path(url, max_chars, cache_dir);
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string(entry).map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| format!("Failed to write cache entry: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Failed to commit cache entry: {e}"))?;
    prune_to_cap(cache_dir);
    Ok(())
}

pub fn clear(cache_dir: &Path) -> Result<(), String> {
    if cache_dir.exists() {
        fs::remove_dir_all(cache_dir).map_err(|e| format!("Failed to clear cache: {e}"))?;
    }
    ensure_dir(cache_dir)
}

pub fn stats(cache_dir: &Path) -> CacheStats {
    if !cache_dir.exists() {
        return CacheStats {
            entries: 0,
            total_bytes: 0,
        };
    }
    let mut entries = 0usize;
    let mut total_bytes = 0u64;
    if let Ok(read_dir) = fs::read_dir(cache_dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                entries += 1;
                if let Ok(meta) = entry.metadata() {
                    total_bytes += meta.len();
                }
            }
        }
    }
    CacheStats {
        entries,
        total_bytes,
    }
}

fn prune_to_cap(cache_dir: &Path) {
    if !cache_dir.exists() {
        return;
    }
    let Ok(read_dir) = fs::read_dir(cache_dir) else {
        return;
    };

    let mut files: Vec<(PathBuf, i64, u64)> = Vec::new();
    let mut total: u64 = 0;
    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        total += size;
        let mut fetched_at: i64 = i64::MAX;
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<CachedEntry>(&raw) {
                fetched_at = parsed.fetched_at_unix;
            }
        }
        files.push((path, fetched_at, size));
    }

    if total <= CACHE_CAP_BYTES {
        return;
    }

    files.sort_by_key(|(_, fetched_at, _)| *fetched_at);
    for (path, _, size) in files {
        if total <= CACHE_CAP_BYTES {
            break;
        }
        if fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(size);
        }
    }
}

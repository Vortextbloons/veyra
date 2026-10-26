use parking_lot::Mutex;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::http::{header, Response, StatusCode};
use tauri::{AppHandle, Manager, State};

pub const MAX_ARTIFACT_BYTES: usize = 256 * 1024;
const MAX_PREVIEWS: usize = 32;
const PREVIEW_TTL: Duration = Duration::from_secs(24 * 60 * 60);

struct PreviewEntry {
    html: String,
    created_at: Instant,
}

#[derive(Default)]
pub struct ArtifactPreviewState {
    previews: Mutex<HashMap<String, PreviewEntry>>,
}

#[tauri::command]
pub fn register_artifact_preview(
    id: String,
    html: String,
    state: State<'_, ArtifactPreviewState>,
) -> Result<(), String> {
    if !is_safe_id(&id) {
        return Err("invalid artifact preview id".into());
    }
    if html.len() > MAX_ARTIFACT_BYTES {
        return Err("artifact exceeds the 256 KB preview limit".into());
    }

    let mut previews = state.previews.lock();
    let now = Instant::now();
    previews.retain(|_, entry| now.duration_since(entry.created_at) < PREVIEW_TTL);
    if !previews.contains_key(&id) && previews.len() >= MAX_PREVIEWS {
        if let Some(oldest) = previews
            .iter()
            .min_by_key(|(_, entry)| entry.created_at)
            .map(|(id, _)| id.clone())
        {
            previews.remove(&oldest);
        }
    }
    previews.insert(
        id,
        PreviewEntry {
            html,
            created_at: now,
        },
    );
    Ok(())
}

pub fn serve_preview(
    request: &tauri::http::Request<Vec<u8>>,
    app: &AppHandle,
) -> Response<Vec<u8>> {
    if request.method() != tauri::http::Method::GET {
        return response(
            StatusCode::METHOD_NOT_ALLOWED,
            "method not allowed",
            "text/plain; charset=utf-8",
        );
    }

    let path = request.uri().path();
    let Some(id) = path.strip_prefix('/').filter(|id| !id.contains('/')) else {
        return response(
            StatusCode::NOT_FOUND,
            "not found",
            "text/plain; charset=utf-8",
        );
    };
    if !is_safe_id(id) {
        return response(
            StatusCode::NOT_FOUND,
            "not found",
            "text/plain; charset=utf-8",
        );
    }

    let state = app.state::<ArtifactPreviewState>();
    let html = {
        let mut previews = state.previews.lock();
        let expired = previews
            .get(id)
            .is_some_and(|entry| entry.created_at.elapsed() >= PREVIEW_TTL);
        if expired {
            previews.remove(id);
            None
        } else {
            previews.get(id).map(|entry| entry.html.clone())
        }
    };
    match html {
        Some(html) => html_response(html),
        None => response(
            StatusCode::NOT_FOUND,
            "preview expired",
            "text/plain; charset=utf-8",
        ),
    }
}

fn html_response(html: String) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        .header(
            header::CONTENT_SECURITY_POLICY,
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; sandbox allow-scripts",
        )
        .body(html.into_bytes())
        .expect("artifact preview response headers are valid")
}

fn response(status: StatusCode, body: &str, content_type: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(body.as_bytes().to_vec())
        .expect("artifact preview response headers are valid")
}

fn is_safe_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        })
}

#[cfg(test)]
mod tests {
    use super::{html_response, is_safe_id, MAX_ARTIFACT_BYTES};
    use tauri::http::header;

    #[test]
    fn artifact_preview_uses_an_opaque_origin_sandbox_and_blocks_external_resources() {
        let response = html_response("<h1>preview</h1>".into());
        let csp = response
            .headers()
            .get(header::CONTENT_SECURITY_POLICY)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(csp.contains("sandbox allow-scripts"));
        assert!(!csp.contains("allow-same-origin"));
        for directive in [
            "connect-src 'none'",
            "form-action 'none'",
            "base-uri 'none'",
            "object-src 'none'",
            "frame-src 'none'",
        ] {
            assert!(csp.contains(directive));
        }
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );
        assert_eq!(
            response.headers().get("X-Content-Type-Options").unwrap(),
            "nosniff"
        );
    }

    #[test]
    fn preview_ids_are_single_uuid_paths_and_html_size_is_bounded() {
        assert!(is_safe_id("d9428888-122b-4b24-8f0a-6b3f90e11f10"));
        assert!(!is_safe_id("../d9428888-122b-4b24-8f0a-6b3f90e11f10"));
        assert!(!is_safe_id("d9428888-122b-4b24-8f0a-6b3f90e11f10/more"));
        assert_eq!(MAX_ARTIFACT_BYTES, 256 * 1024);
    }
}

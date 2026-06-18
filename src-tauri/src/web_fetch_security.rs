use std::net::IpAddr;

fn is_private_or_loopback(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_multicast()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (v6.segments()[0] & 0xfe00) == 0xfc00 // unique local
                || (v6.segments()[0] & 0xffc0) == 0xfe80 // link local
        }
    }
}

pub async fn ssrf_check(parsed: &url::Url) -> Result<(), String> {
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?;

    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_or_loopback(ip) {
            return Err("URL points to a private or loopback address".into());
        }
        return Ok(());
    }

    let normalized = host.to_lowercase();
    if normalized == "localhost"
        || normalized.ends_with(".localhost")
        || normalized.ends_with(".local")
        || normalized.ends_with(".internal")
    {
        return Err("URL points to a local hostname".into());
    }

    let port = parsed.port_or_known_default().unwrap_or(443);
    let addrs: Vec<IpAddr> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| format!("DNS resolution failed: {e}"))?
        .map(|sa| sa.ip())
        .collect();

    if addrs.is_empty() {
        return Err("DNS resolution returned no addresses".into());
    }

    for ip in &addrs {
        if is_private_or_loopback(*ip) {
            return Err("URL resolves to a private or loopback address".into());
        }
    }
    Ok(())
}

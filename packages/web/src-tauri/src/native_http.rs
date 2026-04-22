use std::{collections::HashMap, time::Duration};

use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client, Method, Url,
};
use serde::{Deserialize, Serialize};

const DEFAULT_TIMEOUT_MS: u64 = 30_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHttpRequest {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body_text: Option<String>,
    pub body_bytes: Option<Vec<u8>>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHttpResponse {
    pub status: u16,
    pub ok: bool,
    pub headers: HashMap<String, String>,
    pub body_text: String,
}

type PreparedRequest = (
    Method,
    Url,
    HeaderMap,
    Option<String>,
    Option<Vec<u8>>,
    Duration,
);

fn prepare_request(req: &NativeHttpRequest) -> Result<PreparedRequest, String> {
    let method = req
        .method
        .as_deref()
        .unwrap_or("GET")
        .parse::<Method>()
        .map_err(|err| format!("Invalid HTTP method: {err}"))?;

    let url = Url::parse(&req.url).map_err(|err| format!("Invalid URL: {err}"))?;
    match url.scheme() {
        "http" | "https" => {}
        scheme => return Err(format!("Unsupported URL scheme: {scheme}")),
    }

    let mut headers = HeaderMap::new();
    for (key, value) in req.headers.clone().unwrap_or_default() {
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|err| format!("Invalid header name '{key}': {err}"))?;
        let value = HeaderValue::from_str(&value)
            .map_err(|err| format!("Invalid header value for '{key}': {err}"))?;
        headers.insert(name, value);
    }

    let timeout = Duration::from_millis(req.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
    Ok((
        method,
        url,
        headers,
        req.body_text.clone(),
        req.body_bytes.clone(),
        timeout,
    ))
}

#[tauri::command]
pub async fn native_http_request(req: NativeHttpRequest) -> Result<NativeHttpResponse, String> {
    let (method, url, headers, body_text, body_bytes, timeout) = prepare_request(&req)?;

    let client = Client::new();
    let mut request = client
        .request(method, url)
        .headers(headers)
        .timeout(timeout);
    if let Some(body_bytes) = body_bytes {
        request = request.body(body_bytes);
    } else if let Some(body_text) = body_text {
        request = request.body(body_text);
    }

    let response = request
        .send()
        .await
        .map_err(|err| format!("HTTP request failed: {err}"))?;

    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.as_str().to_string(),
                value.to_str().unwrap_or_default().to_string(),
            )
        })
        .collect::<HashMap<_, _>>();

    let body_text = response
        .text()
        .await
        .map_err(|err| format!("Failed to read response body: {err}"))?;

    Ok(NativeHttpResponse {
        status: status.as_u16(),
        ok: status.is_success(),
        headers,
        body_text,
    })
}

#[cfg(test)]
mod tests {
    use super::{prepare_request, NativeHttpRequest};

    #[test]
    fn rejects_non_http_urls() {
        let req = NativeHttpRequest {
            url: "file:///tmp/demo".into(),
            method: None,
            headers: None,
            body_text: None,
            body_bytes: None,
            timeout_ms: None,
        };

        let err = prepare_request(&req).expect_err("non-http urls should fail");
        assert!(err.contains("Unsupported URL scheme"));
    }

    #[test]
    fn accepts_custom_method_headers_and_timeout() {
        let req = NativeHttpRequest {
            url: "https://example.com/dav".into(),
            method: Some("PROPFIND".into()),
            headers: Some(
                [
                    ("Depth".to_string(), "1".to_string()),
                    ("Content-Type".to_string(), "application/xml".to_string()),
                ]
                .into_iter()
                .collect(),
            ),
            body_text: Some("<xml />".into()),
            body_bytes: None,
            timeout_ms: Some(1_500),
        };

        let (method, url, headers, body_text, body_bytes, timeout) =
            prepare_request(&req).expect("request should be valid");

        assert_eq!(method.as_str(), "PROPFIND");
        assert_eq!(url.as_str(), "https://example.com/dav");
        assert_eq!(
            headers.get("Depth").and_then(|value| value.to_str().ok()),
            Some("1")
        );
        assert_eq!(
            headers
                .get("Content-Type")
                .and_then(|value| value.to_str().ok()),
            Some("application/xml")
        );
        assert_eq!(body_text.as_deref(), Some("<xml />"));
        assert!(body_bytes.is_none());
        assert_eq!(timeout.as_millis(), 1_500);
    }
}

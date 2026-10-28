use reqwest::{
    Client,
    Method,
    header::HeaderMap,
};
use serde_json::{json, Value};
use std::time::Duration;
use url::Url;

/// WeFeed-Short API client.
///
/// API contract was inferred from the APK's endpoint declarations.
/// Live authentication and response compatibility remain unverified.
#[derive(Clone)]
pub struct WeFeedShortClient {
    client: Client,
    base_url: String,
    host_parameter: String,
    user_agent: String,
    client_info: String,
    spoofed_ip: String,
    /// Optional valid JWT issued by WeFeed for an authorized session.
    /// Configure as a server-side secret; never commit the token.
    auth_client: crate::providers::moviebox::client::MovieBoxClient,
}

#[derive(Debug)]
pub enum WeFeedShortError {
    Network(String),
    HttpStatus(u16),
    InvalidUrl(String),
    Json(String),
    InvalidResponse(String),
}

impl std::fmt::Display for WeFeedShortError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Network(message) => write!(f, "WeFeed network error: {message}"),
            Self::HttpStatus(status) => {
                write!(f, "WeFeed returned HTTP {status}")
            }
            Self::InvalidUrl(message) => {
                write!(f, "WeFeed invalid URL: {message}")
            }
            Self::Json(message) => {
                write!(f, "WeFeed JSON error: {message}")
            }
            Self::InvalidResponse(message) => {
                write!(f, "WeFeed invalid response: {message}")
            }
        }
    }
}

impl std::error::Error for WeFeedShortError {}

impl WeFeedShortClient {
    pub fn new() -> Self {
        let (user_agent, client_info) =
            crate::providers::moviebox::crypto::generate_client_info_and_ua();

        let spoofed_ip =
            crate::providers::moviebox::crypto::random_spoofed_ip();

        let client = crate::net::http_client_builder()
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            base_url: "https://sapi.aoneroom.com".to_string(),
            host_parameter: "sapi.aoneroom.com".to_string(),
            user_agent,
            client_info,
            spoofed_ip,
            auth_client: crate::providers::moviebox::client::MovieBoxClient::new(),
        }
    }

    /// Override the API base URL for controlled testing.
    ///
    /// Only use a trusted API host. This does not bypass authentication,
    /// access controls, DRM, or provider restrictions.
    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into().trim_end_matches('/').to_string();
        self
    }

    /// Override the `host` query parameter expected by the API.
    pub fn with_host_parameter(
        mut self,
        host: impl Into<String>,
    ) -> Self {
        self.host_parameter = host.into();
        self
    }

    fn make_url(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<String, WeFeedShortError> {
        let joined = format!(
            "{}{}",
            self.base_url.trim_end_matches('/'),
            if path.starts_with('/') {
                path.to_string()
            } else {
                format!("/{path}")
            }
        );

        let mut url = Url::parse(&joined)
            .map_err(|error| {
                WeFeedShortError::InvalidUrl(error.to_string())
            })?;

        {
            let mut pairs = url.query_pairs_mut();
            for (key, value) in query {
                pairs.append_pair(key, value);
            }
        }

        Ok(url.into())
    }

    fn signed_headers(
        &self,
        method: &str,
        url: &str,
        body: Option<&str>,
    auth_token: Option<&str>,
    ) -> HeaderMap {
        crate::providers::moviebox::crypto::build_signed_headers(
            method,
            url,
            body,
            auth_token,
            &self.user_agent,
            &self.client_info,
            &self.spoofed_ip,
        )
    }

    async fn request_json(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<Value>,
    ) -> Result<Value, WeFeedShortError> {
        let url = self.make_url(path, query)?;

        let body_text = body
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| {
                WeFeedShortError::Json(error.to_string())
            })?;

        let method_text = method.as_str();
        // Sign with the same guest token that is sent in Authorization.
        let token = self.auth_client.ensure_session().await.map_err(|error| {
            WeFeedShortError::Network(format!("Could not acquire automatic guest session: {error}"))
        })?;

        let headers = self.signed_headers(
            method_text,
            &url,
            body_text.as_deref(),
            Some(token.as_str()),
        );

        let mut request = self
            .client
            .request(method, &url)
            .headers(headers);

        request = request.header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {token}"),
        );

        if let Some(body_text) = body_text {
            request = request
                .header(
                    reqwest::header::CONTENT_TYPE,
                    "application/json",
                )
                .body(body_text);
        }

        let response = request
            .send()
            .await
            .map_err(|error| {
                WeFeedShortError::Network(error.to_string())
            })?;

        let status = response.status();

        if !status.is_success() {
            if status.as_u16() == 401 {
                return Err(WeFeedShortError::InvalidResponse(
                    "WeFeed guest session could not be acquired automatically".to_string(),
                ));
            }
            return Err(WeFeedShortError::HttpStatus(status.as_u16()));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|error| {
                WeFeedShortError::Network(error.to_string())
            })?;

        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|error| {
                WeFeedShortError::Json(error.to_string())
            })?;

        // Do not silently treat an API-level error as an empty catalogue.
        if value.get("code").and_then(Value::as_i64)
            .is_some_and(|code| code != 0 && code != 200)
        {
            return Err(WeFeedShortError::InvalidResponse(
                value
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("API reported an error")
                    .to_string(),
            ));
        }

        Ok(value)
    }

    /// GET /wefeed-short-bff/app/config
    pub async fn app_config(
        &self,
        keys: &str,
        version: &str,
    ) -> Result<Value, WeFeedShortError> {
        self.request_json(
            Method::GET,
            "/wefeed-short-bff/app/config",
            &[
                ("keys", keys.to_string()),
                ("version", version.to_string()),
            ],
            None,
        )
        .await
    }

    /// POST /wefeed-short-bff/shorts/search
    pub async fn search(
        &self,
        keyword: &str,
        page: usize,
        per_page: usize,
    ) -> Result<Value, WeFeedShortError> {
        let query = vec![
            ("host", self.host_parameter.clone()),
        ];

        self.request_json(
            Method::POST,
            "/wefeed-short-bff/shorts/search",
            &query,
            Some(json!({
                "keyword": keyword,
                "perPage": per_page.clamp(1, 50),
                "page": page.max(1)
            })),
        )
        .await
    }

    /// GET /wefeed-short-bff/shorts/get-info
    pub async fn get_info(
        &self,
        subject_id: &str,
    ) -> Result<Value, WeFeedShortError> {
        self.request_json(
            Method::GET,
            "/wefeed-short-bff/shorts/get-info",
            &[
                ("subjectId", subject_id.to_string()),
                ("host", self.host_parameter.clone()),
            ],
            None,
        )
        .await
    }

    /// GET /wefeed-short-bff/shorts/mini-list
    pub async fn mini_list(
        &self,
        subject_id: &str,
        start_position: usize,
        end_position: usize,
        pager_mode: &str,
    ) -> Result<Value, WeFeedShortError> {
        self.request_json(
            Method::GET,
            "/wefeed-short-bff/shorts/mini-list",
            &[
                ("subjectId", subject_id.to_string()),
                ("startPosition", start_position.to_string()),
                ("endPosition", end_position.to_string()),
                ("pagerMode", pager_mode.to_string()),
                ("host", self.host_parameter.clone()),
            ],
            None,
        )
        .await
    }

    /// GET /wefeed-short-bff/subject-api/resource
    pub async fn resource_page(
        &self,
        subject_id: &str,
        page: usize,
        per_page: usize,
        resolution: Option<&str>,
    ) -> Result<Value, WeFeedShortError> {
        let mut query = vec![
            ("host", self.host_parameter.clone()),
            ("subjectId", subject_id.to_string()),
            ("page", page.max(1).to_string()),
            ("perPage", per_page.clamp(1, 50).to_string()),
            ("all", "0".to_string()),
            ("startPosition", "0".to_string()),
            ("endPosition", per_page.clamp(1, 50).to_string()),
            ("pagerMode", "1".to_string()),
        ];

        if let Some(resolution) = resolution {
            query.push(("resolution", resolution.to_string()));
        }

        self.request_json(
            Method::GET,
            "/wefeed-short-bff/subject-api/resource",
            &query,
            None,
        )
        .await
    }

    /// GET /wefeed-short-bff/subject-api/resource-position
    pub async fn resource_position(
        &self,
        subject_id: &str,
        resource_id: &str,
        resource_num: usize,
        resolution: Option<&str>,
    ) -> Result<Value, WeFeedShortError> {
        let mut query = vec![
            ("host", self.host_parameter.clone()),
            ("subjectId", subject_id.to_string()),
            ("resourceId", resource_id.to_string()),
            ("resourceNum", resource_num.to_string()),
        ];

        if let Some(resolution) = resolution {
            query.push(("resolution", resolution.to_string()));
        }

        self.request_json(
            Method::GET,
            "/wefeed-short-bff/subject-api/resource-position",
            &query,
            None,
        )
        .await
    }

    /// POST /wefeed-short-bff/subject-api/search
    ///
    /// The APK route was identified, but the exact request body schema
    /// still needs to be confirmed from a real request.
    pub async fn subject_search(
        &self,
        body: Value,
    ) -> Result<Value, WeFeedShortError> {
        self.request_json(
            Method::POST,
            "/wefeed-short-bff/subject-api/search",
            &[("host", self.host_parameter.clone())],
            Some(body),
        )
        .await
    }
}

impl Default for WeFeedShortClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_base_url_can_be_overridden() {
        let client = WeFeedShortClient::new()
            .with_base_url("https://example.invalid");

        assert_eq!(
            client.base_url,
            "https://example.invalid"
        );
    }

    #[test]
    fn test_url_encodes_query_parameters() {
        let client = WeFeedShortClient::new();

        let url = client
            .make_url(
                "/wefeed-short-bff/shorts/get-info",
                &[
                    ("subjectId", "title id/1".to_string()),
                    ("host", client.host_parameter.clone()),
                ],
            )
            .expect("URL should be valid");

        let parsed = Url::parse(&url).expect("URL should parse");

        assert_eq!(
            parsed.query_pairs()
                .find(|(key, _)| key == "subjectId")
                .map(|(_, value)| value.into_owned()),
            Some("title id/1".to_string())
        );
    }
}

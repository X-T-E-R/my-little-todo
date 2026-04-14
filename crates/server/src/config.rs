use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthProvider {
    None,
    #[default]
    Embedded,
    Zitadel,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EmbeddedSignupPolicy {
    AdminOnly,
    Open,
    #[default]
    InviteOnly,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncMode {
    #[default]
    Hosted,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DbType {
    #[default]
    Sqlite,
    Postgres,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    pub port: u16,
    pub host: String,
    pub auth_provider: AuthProvider,
    pub embedded_signup_policy: EmbeddedSignupPolicy,
    pub sync_mode: SyncMode,
    pub db_type: DbType,
    pub data_dir: String,
    pub database_url: Option<String>,
    pub zitadel_issuer: String,
    pub zitadel_client_id: String,
    pub zitadel_audience: Option<String>,
    pub zitadel_admin_role: Option<String>,
    pub static_dir: Option<String>,
    pub cors_allowed_origins: Vec<String>,
    pub admin_export_dirs: Vec<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3001,
            host: "0.0.0.0".into(),
            auth_provider: AuthProvider::Embedded,
            embedded_signup_policy: EmbeddedSignupPolicy::InviteOnly,
            sync_mode: SyncMode::Hosted,
            db_type: DbType::Sqlite,
            data_dir: "./data".into(),
            database_url: None,
            zitadel_issuer: String::new(),
            zitadel_client_id: String::new(),
            zitadel_audience: None,
            zitadel_admin_role: None,
            static_dir: None,
            cors_allowed_origins: Vec::new(),
            admin_export_dirs: Vec::new(),
        }
    }
}

fn parse_csv_env(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn parse_auth_provider(value: &str) -> Option<AuthProvider> {
    match value {
        "none" => Some(AuthProvider::None),
        "embedded" => Some(AuthProvider::Embedded),
        "zitadel" => Some(AuthProvider::Zitadel),
        _ => None,
    }
}

fn parse_signup_policy(value: &str) -> Option<EmbeddedSignupPolicy> {
    match value {
        "admin_only" => Some(EmbeddedSignupPolicy::AdminOnly),
        "open" => Some(EmbeddedSignupPolicy::Open),
        "invite_only" => Some(EmbeddedSignupPolicy::InviteOnly),
        _ => None,
    }
}

fn parse_sync_mode(value: &str) -> Option<SyncMode> {
    match value {
        "hosted" => Some(SyncMode::Hosted),
        _ => None,
    }
}

impl ServerConfig {
    pub fn from_toml(path: impl AsRef<std::path::Path>) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let config: ServerConfig = toml::from_str(&content)?;
        Ok(config)
    }

    pub fn from_env() -> Self {
        let db_type = match std::env::var("DB_TYPE").as_deref() {
            Ok("postgres" | "postgresql") => DbType::Postgres,
            _ => DbType::Sqlite,
        };

        Self {
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3001),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            auth_provider: std::env::var("AUTH_PROVIDER")
                .ok()
                .as_deref()
                .and_then(parse_auth_provider)
                .unwrap_or_default(),
            embedded_signup_policy: std::env::var("EMBEDDED_SIGNUP_POLICY")
                .ok()
                .as_deref()
                .and_then(parse_signup_policy)
                .unwrap_or_default(),
            sync_mode: std::env::var("SYNC_MODE")
                .ok()
                .as_deref()
                .and_then(parse_sync_mode)
                .unwrap_or_default(),
            db_type,
            data_dir: std::env::var("DATA_DIR").unwrap_or_else(|_| "./data".into()),
            database_url: std::env::var("DATABASE_URL").ok(),
            zitadel_issuer: std::env::var("ZITADEL_ISSUER").unwrap_or_default(),
            zitadel_client_id: std::env::var("ZITADEL_CLIENT_ID").unwrap_or_default(),
            zitadel_audience: std::env::var("ZITADEL_AUDIENCE").ok(),
            zitadel_admin_role: std::env::var("ZITADEL_ADMIN_ROLE").ok(),
            static_dir: std::env::var("STATIC_DIR").ok(),
            cors_allowed_origins: std::env::var("CORS_ALLOWED_ORIGINS")
                .ok()
                .map(|v| parse_csv_env(&v))
                .unwrap_or_default(),
            admin_export_dirs: std::env::var("ADMIN_EXPORT_DIRS")
                .ok()
                .map(|v| parse_csv_env(&v))
                .unwrap_or_default(),
        }
    }

    pub fn load(toml_path: Option<&str>) -> Self {
        let base = toml_path
            .and_then(|p| Self::from_toml(p).ok())
            .or_else(|| Self::from_toml("config.toml").ok())
            .unwrap_or_default();

        base.override_from_env()
    }

    pub fn override_from_env(mut self) -> Self {
        if let Ok(p) = std::env::var("PORT") {
            if let Ok(v) = p.parse() {
                self.port = v;
            }
        }
        if let Ok(v) = std::env::var("HOST") {
            self.host = v;
        }
        if let Ok(v) = std::env::var("AUTH_PROVIDER") {
            if let Some(parsed) = parse_auth_provider(&v) {
                self.auth_provider = parsed;
            }
        }
        if let Ok(v) = std::env::var("EMBEDDED_SIGNUP_POLICY") {
            if let Some(parsed) = parse_signup_policy(&v) {
                self.embedded_signup_policy = parsed;
            }
        }
        if let Ok(v) = std::env::var("SYNC_MODE") {
            if let Some(parsed) = parse_sync_mode(&v) {
                self.sync_mode = parsed;
            }
        }
        if let Ok(v) = std::env::var("DB_TYPE") {
            match v.as_str() {
                "sqlite" => self.db_type = DbType::Sqlite,
                "postgres" | "postgresql" => self.db_type = DbType::Postgres,
                _ => {}
            }
        }
        if let Ok(v) = std::env::var("DATA_DIR") {
            self.data_dir = v;
        }
        if let Ok(v) = std::env::var("DATABASE_URL") {
            self.database_url = Some(v);
        }
        if let Ok(v) = std::env::var("ZITADEL_ISSUER") {
            self.zitadel_issuer = v;
        }
        if let Ok(v) = std::env::var("ZITADEL_CLIENT_ID") {
            self.zitadel_client_id = v;
        }
        if let Ok(v) = std::env::var("ZITADEL_AUDIENCE") {
            self.zitadel_audience = Some(v);
        }
        if let Ok(v) = std::env::var("ZITADEL_ADMIN_ROLE") {
            self.zitadel_admin_role = Some(v);
        }
        if let Ok(v) = std::env::var("STATIC_DIR") {
            self.static_dir = Some(v);
        }
        if let Ok(v) = std::env::var("CORS_ALLOWED_ORIGINS") {
            self.cors_allowed_origins = parse_csv_env(&v);
        }
        if let Ok(v) = std::env::var("ADMIN_EXPORT_DIRS") {
            self.admin_export_dirs = parse_csv_env(&v);
        }
        self
    }

    pub fn to_toml_string(&self) -> String {
        toml::to_string_pretty(self).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_values() {
        let config = ServerConfig::default();
        assert_eq!(config.port, 3001);
        assert_eq!(config.host, "0.0.0.0");
        assert_eq!(config.auth_provider, AuthProvider::Embedded);
        assert_eq!(
            config.embedded_signup_policy,
            EmbeddedSignupPolicy::InviteOnly
        );
        assert_eq!(config.sync_mode, SyncMode::Hosted);
        assert_eq!(config.db_type, DbType::Sqlite);
        assert_eq!(config.data_dir, "./data");
        assert!(config.database_url.is_none());
        assert!(config.zitadel_issuer.is_empty());
        assert!(config.zitadel_client_id.is_empty());
        assert!(config.zitadel_audience.is_none());
        assert!(config.zitadel_admin_role.is_none());
        assert!(config.static_dir.is_none());
        assert!(config.cors_allowed_origins.is_empty());
        assert!(config.admin_export_dirs.is_empty());
    }

    #[test]
    fn toml_serialization_roundtrip() {
        let config = ServerConfig {
            port: 8080,
            host: "127.0.0.1".into(),
            auth_provider: AuthProvider::Zitadel,
            embedded_signup_policy: EmbeddedSignupPolicy::AdminOnly,
            sync_mode: SyncMode::Hosted,
            db_type: DbType::Postgres,
            data_dir: "/tmp/data".into(),
            database_url: Some("postgres://localhost/test".into()),
            zitadel_issuer: "https://zitadel.example.com".into(),
            zitadel_client_id: "web-client".into(),
            zitadel_audience: Some("api://mlt".into()),
            zitadel_admin_role: Some("mlt-admin".into()),
            static_dir: Some("/var/www".into()),
            cors_allowed_origins: vec!["https://app.example.com".into()],
            admin_export_dirs: vec!["/srv/mlt-export".into()],
        };

        let toml_str = config.to_toml_string();
        let parsed: ServerConfig = toml::from_str(&toml_str).unwrap();

        assert_eq!(parsed.port, 8080);
        assert_eq!(parsed.host, "127.0.0.1");
        assert_eq!(parsed.auth_provider, AuthProvider::Zitadel);
        assert_eq!(
            parsed.embedded_signup_policy,
            EmbeddedSignupPolicy::AdminOnly
        );
        assert_eq!(parsed.sync_mode, SyncMode::Hosted);
        assert_eq!(parsed.db_type, DbType::Postgres);
        assert_eq!(parsed.data_dir, "/tmp/data");
        assert_eq!(
            parsed.database_url,
            Some("postgres://localhost/test".into())
        );
        assert_eq!(parsed.zitadel_issuer, "https://zitadel.example.com");
        assert_eq!(parsed.zitadel_client_id, "web-client");
        assert_eq!(parsed.zitadel_audience, Some("api://mlt".into()));
        assert_eq!(parsed.zitadel_admin_role, Some("mlt-admin".into()));
        assert_eq!(parsed.static_dir, Some("/var/www".into()));
        assert_eq!(
            parsed.cors_allowed_origins,
            vec!["https://app.example.com".to_string()]
        );
        assert_eq!(
            parsed.admin_export_dirs,
            vec!["/srv/mlt-export".to_string()]
        );
    }

    #[test]
    fn toml_deserialization_with_defaults() {
        let toml_str = r#"
            port = 9090
            host = "localhost"
        "#;
        let config: ServerConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.port, 9090);
        assert_eq!(config.host, "localhost");
        assert_eq!(config.auth_provider, AuthProvider::Embedded);
        assert_eq!(
            config.embedded_signup_policy,
            EmbeddedSignupPolicy::InviteOnly
        );
        assert_eq!(config.sync_mode, SyncMode::Hosted);
        assert_eq!(config.db_type, DbType::Sqlite);
    }
}

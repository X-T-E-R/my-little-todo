use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthMode {
    None,
    Single,
    Multi,
}

impl Default for AuthMode {
    fn default() -> Self {
        Self::Multi
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DbType {
    Sqlite,
    Postgres,
    Mysql,
    Mongodb,
}

impl Default for DbType {
    fn default() -> Self {
        Self::Sqlite
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    pub port: u16,
    pub host: String,
    pub auth_mode: AuthMode,
    pub db_type: DbType,
    pub data_dir: String,
    pub database_url: Option<String>,
    pub jwt_secret: String,
    pub default_admin_password: Option<String>,
    pub static_dir: Option<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3001,
            host: "0.0.0.0".into(),
            auth_mode: AuthMode::Multi,
            db_type: DbType::Sqlite,
            data_dir: "./data".into(),
            database_url: None,
            jwt_secret: uuid::Uuid::new_v4().to_string(),
            default_admin_password: None,
            static_dir: None,
        }
    }
}

impl ServerConfig {
    /// Load from a TOML file.
    pub fn from_toml(path: impl AsRef<std::path::Path>) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let config: ServerConfig = toml::from_str(&content)?;
        Ok(config)
    }

    /// Load from environment variables only (legacy).
    pub fn from_env() -> Self {
        let auth_mode = match std::env::var("AUTH_MODE").as_deref() {
            Ok("none") => AuthMode::None,
            Ok("single") => AuthMode::Single,
            _ => AuthMode::Multi,
        };

        let db_type = match std::env::var("DB_TYPE").as_deref() {
            Ok("postgres" | "postgresql") => DbType::Postgres,
            Ok("mysql") => DbType::Mysql,
            Ok("mongodb") => DbType::Mongodb,
            _ => DbType::Sqlite,
        };

        Self {
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3001),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            auth_mode,
            db_type,
            data_dir: std::env::var("DATA_DIR").unwrap_or_else(|_| "./data".into()),
            database_url: std::env::var("DATABASE_URL").ok(),
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string()),
            default_admin_password: std::env::var("DEFAULT_ADMIN_PASSWORD").ok(),
            static_dir: std::env::var("STATIC_DIR").ok(),
        }
    }

    /// Primary entry: try TOML first, then apply env var overrides.
    pub fn load(toml_path: Option<&str>) -> Self {
        let base = toml_path
            .and_then(|p| Self::from_toml(p).ok())
            .or_else(|| Self::from_toml("config.toml").ok())
            .unwrap_or_default();

        base.override_from_env()
    }

    /// Override individual fields when the corresponding env var is set.
    pub fn override_from_env(mut self) -> Self {
        if let Ok(p) = std::env::var("PORT") {
            if let Ok(v) = p.parse() {
                self.port = v;
            }
        }
        if let Ok(v) = std::env::var("HOST") {
            self.host = v;
        }
        if let Ok(v) = std::env::var("AUTH_MODE") {
            match v.as_str() {
                "none" => self.auth_mode = AuthMode::None,
                "single" => self.auth_mode = AuthMode::Single,
                "multi" => self.auth_mode = AuthMode::Multi,
                _ => {}
            }
        }
        if let Ok(v) = std::env::var("DB_TYPE") {
            match v.as_str() {
                "sqlite" => self.db_type = DbType::Sqlite,
                "postgres" | "postgresql" => self.db_type = DbType::Postgres,
                "mysql" => self.db_type = DbType::Mysql,
                "mongodb" => self.db_type = DbType::Mongodb,
                _ => {}
            }
        }
        if let Ok(v) = std::env::var("DATA_DIR") {
            self.data_dir = v;
        }
        if let Ok(v) = std::env::var("DATABASE_URL") {
            self.database_url = Some(v);
        }
        if let Ok(v) = std::env::var("JWT_SECRET") {
            self.jwt_secret = v;
        }
        if let Ok(v) = std::env::var("DEFAULT_ADMIN_PASSWORD") {
            self.default_admin_password = Some(v);
        }
        if let Ok(v) = std::env::var("STATIC_DIR") {
            self.static_dir = Some(v);
        }
        self
    }

    /// Serialize to TOML string (for L0 backup / export).
    pub fn to_toml_string(&self) -> String {
        toml::to_string_pretty(self).unwrap_or_default()
    }
}

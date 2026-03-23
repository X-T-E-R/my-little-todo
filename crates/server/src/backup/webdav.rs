use async_trait::async_trait;
use super::traits::BackupProvider;

/// WebDAV backup provider using HTTP requests.
#[allow(dead_code)]
pub struct WebDavBackupProvider {
    base_url: String,
    username: Option<String>,
    password: Option<String>,
}

impl WebDavBackupProvider {
    pub fn new(base_url: String, username: Option<String>, password: Option<String>) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            username,
            password,
        }
    }
}

#[async_trait]
impl BackupProvider for WebDavBackupProvider {
    async fn upload(&self, key: &str, _data: &[u8]) -> anyhow::Result<()> {
        anyhow::bail!(
            "WebDAV backup not yet fully implemented (url={}, key={}). Add reqwest dependency for production use.",
            self.base_url, key
        )
    }

    async fn download(&self, key: &str) -> anyhow::Result<Option<Vec<u8>>> {
        anyhow::bail!("WebDAV download not yet fully implemented (key={})", key)
    }

    async fn list(&self, prefix: &str) -> anyhow::Result<Vec<String>> {
        anyhow::bail!("WebDAV list not yet fully implemented (prefix={})", prefix)
    }

    async fn delete(&self, key: &str) -> anyhow::Result<()> {
        anyhow::bail!("WebDAV delete not yet fully implemented (key={})", key)
    }

    fn provider_name(&self) -> &str {
        "webdav"
    }
}

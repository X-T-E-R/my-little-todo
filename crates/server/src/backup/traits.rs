use async_trait::async_trait;

#[async_trait]
pub trait BackupProvider: Send + Sync {
    async fn upload(&self, key: &str, data: &[u8]) -> anyhow::Result<()>;
    async fn download(&self, key: &str) -> anyhow::Result<Option<Vec<u8>>>;
    async fn list(&self, prefix: &str) -> anyhow::Result<Vec<String>>;
    async fn delete(&self, key: &str) -> anyhow::Result<()>;
    fn provider_name(&self) -> &str;
}

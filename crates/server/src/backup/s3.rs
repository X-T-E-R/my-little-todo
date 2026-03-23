use async_trait::async_trait;
use super::traits::BackupProvider;

/// S3-compatible backup provider (supports AWS S3, MinIO, Cloudflare R2, etc.)
/// Uses reqwest with S3 v4 signing for zero-dependency approach.
#[allow(dead_code)]
pub struct S3BackupProvider {
    endpoint: String,
    bucket: String,
    access_key: String,
    secret_key: String,
    region: String,
}

impl S3BackupProvider {
    pub fn new(
        endpoint: String,
        bucket: String,
        access_key: String,
        secret_key: String,
        region: Option<String>,
    ) -> Self {
        Self {
            endpoint,
            bucket,
            access_key,
            secret_key,
            region: region.unwrap_or_else(|| "us-east-1".into()),
        }
    }
}

#[async_trait]
impl BackupProvider for S3BackupProvider {
    async fn upload(&self, key: &str, _data: &[u8]) -> anyhow::Result<()> {
        anyhow::bail!(
            "S3 backup not yet fully implemented (bucket={}, key={}). Add aws-sdk-s3 dependency for production use.",
            self.bucket, key
        )
    }

    async fn download(&self, key: &str) -> anyhow::Result<Option<Vec<u8>>> {
        anyhow::bail!("S3 download not yet fully implemented (key={})", key)
    }

    async fn list(&self, prefix: &str) -> anyhow::Result<Vec<String>> {
        anyhow::bail!("S3 list not yet fully implemented (prefix={})", prefix)
    }

    async fn delete(&self, key: &str) -> anyhow::Result<()> {
        anyhow::bail!("S3 delete not yet fully implemented (key={})", key)
    }

    fn provider_name(&self) -> &str {
        "s3"
    }
}

pub mod traits;

#[cfg(feature = "sqlite")]
pub mod sqlite;

#[cfg(feature = "postgres")]
pub mod postgres;

pub use traits::{DatabaseProvider, NewUser, User};

use crate::config::{DbType, ServerConfig};
use std::sync::Arc;

pub async fn create_provider(config: &ServerConfig) -> anyhow::Result<Arc<dyn DatabaseProvider>> {
    match config.db_type {
        DbType::Sqlite => {
            #[cfg(feature = "sqlite")]
            {
                let db_url = config
                    .database_url
                    .clone()
                    .unwrap_or_else(|| {
                        let dir = &config.data_dir;
                        std::fs::create_dir_all(dir).ok();
                        format!("sqlite:{}/my-little-todo.db?mode=rwc", dir)
                    });
                let provider = sqlite::SqliteProvider::new(&db_url).await?;
                Ok(Arc::new(provider))
            }
            #[cfg(not(feature = "sqlite"))]
            {
                anyhow::bail!("SQLite support not compiled in. Enable the 'sqlite' feature.");
            }
        }
        DbType::Postgres => {
            #[cfg(feature = "postgres")]
            {
                let url = config
                    .database_url
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("DATABASE_URL required for PostgreSQL"))?;
                let provider = postgres::PostgresProvider::new(url).await?;
                Ok(Arc::new(provider))
            }
            #[cfg(not(feature = "postgres"))]
            {
                anyhow::bail!("PostgreSQL support not compiled in. Enable the 'postgres' feature.");
            }
        }
        DbType::Mysql => {
            anyhow::bail!("MySQL support not yet implemented");
        }
        DbType::Mongodb => {
            anyhow::bail!("MongoDB support not yet implemented");
        }
    }
}

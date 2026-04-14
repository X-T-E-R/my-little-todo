use std::{collections::HashMap, sync::Arc};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExtensionStatus {
    Inactive,
    Starting,
    Running,
    Unavailable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolPermission {
    Read,
    Create,
    Full,
}

impl ToolPermission {
    pub fn rank(self) -> u8 {
        match self {
            ToolPermission::Read => 0,
            ToolPermission::Create => 1,
            ToolPermission::Full => 2,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredMcpTool {
    pub name: String,
    pub description: String,
    pub permission: ToolPermission,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredHttpRoute {
    pub path: String,
    pub method: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredExtension {
    pub plugin_id: String,
    pub status: ExtensionStatus,
    #[serde(default)]
    pub mcp_tools: Vec<RegisteredMcpTool>,
    #[serde(default)]
    pub http_routes: Vec<RegisteredHttpRoute>,
    pub proxy_base_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runner_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Clone, Default)]
pub struct ExtensionRegistry {
    inner: Arc<RwLock<HashMap<String, RegisteredExtension>>>,
}

impl ExtensionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn upsert(&self, extension: RegisteredExtension) {
        self.inner
            .write()
            .await
            .insert(extension.plugin_id.clone(), extension);
    }

    pub async fn remove(&self, plugin_id: &str) {
        self.inner.write().await.remove(plugin_id);
    }

    pub async fn get(&self, plugin_id: &str) -> Option<RegisteredExtension> {
        self.inner.read().await.get(plugin_id).cloned()
    }

    pub async fn all(&self) -> Vec<RegisteredExtension> {
        self.inner.read().await.values().cloned().collect()
    }

    pub async fn find_tool(
        &self,
        full_tool_name: &str,
    ) -> Option<(RegisteredExtension, RegisteredMcpTool)> {
        let registry = self.inner.read().await;
        registry.values().find_map(|extension| {
            extension
                .mcp_tools
                .iter()
                .find(|tool| {
                    let prefixed = if tool
                        .name
                        .starts_with(&format!("plugin.{}.", extension.plugin_id))
                    {
                        tool.name.clone()
                    } else {
                        format!("plugin.{}.{}", extension.plugin_id, tool.name)
                    };
                    prefixed == full_tool_name
                })
                .cloned()
                .map(|tool| (extension.clone(), tool))
        })
    }

    pub async fn find_http_route(
        &self,
        plugin_id: &str,
        method: &str,
        path: &str,
    ) -> Option<(RegisteredExtension, RegisteredHttpRoute)> {
        let registry = self.inner.read().await;
        let extension = registry.get(plugin_id)?;
        let route = extension
            .http_routes
            .iter()
            .find(|route| {
                route.method.eq_ignore_ascii_case(method)
                    && normalize_path(&route.path) == normalize_path(path)
            })?
            .clone();
        Some((extension.clone(), route))
    }
}

fn normalize_path(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    if normalized.is_empty() {
        return "/".into();
    }
    if normalized.starts_with('/') {
        normalized
    } else {
        format!("/{}", normalized)
    }
}

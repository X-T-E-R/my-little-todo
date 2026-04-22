use std::collections::HashMap;

use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config::ServerConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenIdConfiguration {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub jwks_uri: String,
    #[serde(default)]
    pub end_session_endpoint: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ExternalIdentity {
    pub subject: String,
    pub username: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub roles: Vec<String>,
    pub is_admin: bool,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AudienceClaim {
    One(String),
    Many(Vec<String>),
}

impl AudienceClaim {
    fn contains(&self, expected: &str) -> bool {
        match self {
            Self::One(value) => value == expected,
            Self::Many(values) => values.iter().any(|value| value == expected),
        }
    }
}

#[derive(Debug, Deserialize)]
struct VerifiedClaims {
    sub: String,
    iss: String,
    aud: AudienceClaim,
    #[serde(default)]
    preferred_username: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(flatten)]
    extra: HashMap<String, Value>,
}

fn normalize_issuer(input: &str) -> String {
    input.trim().trim_end_matches('/').to_string()
}

pub fn is_configured(config: &ServerConfig) -> bool {
    !config.zitadel_issuer.trim().is_empty() && !config.zitadel_client_id.trim().is_empty()
}

pub fn discovery_url(config: &ServerConfig) -> Option<String> {
    if !is_configured(config) {
        return None;
    }
    Some(format!(
        "{}/.well-known/openid-configuration",
        normalize_issuer(&config.zitadel_issuer)
    ))
}

pub async fn fetch_openid_configuration(
    config: &ServerConfig,
) -> anyhow::Result<OpenIdConfiguration> {
    let discovery =
        discovery_url(config).ok_or_else(|| anyhow::anyhow!("Zitadel/OIDC is not configured"))?;
    let response = reqwest::Client::new()
        .get(&discovery)
        .send()
        .await?
        .error_for_status()?;
    Ok(response.json::<OpenIdConfiguration>().await?)
}

fn extract_roles(extra: &HashMap<String, Value>) -> Vec<String> {
    let mut roles = Vec::new();

    if let Some(Value::Array(values)) = extra.get("roles") {
        for value in values.iter().filter_map(|value| value.as_str()) {
            if !roles.iter().any(|item| item == value) {
                roles.push(value.to_string());
            }
        }
    }

    if let Some(Value::Array(values)) = extra.get("groups") {
        for value in values.iter().filter_map(|value| value.as_str()) {
            if !roles.iter().any(|item| item == value) {
                roles.push(value.to_string());
            }
        }
    }

    if let Some(Value::Object(map)) = extra.get("urn:zitadel:iam:org:project:roles") {
        for (key, value) in map {
            if value.as_bool().unwrap_or(false) && !roles.iter().any(|item| item == key) {
                roles.push(key.clone());
            }
        }
    }

    roles
}

fn validation_for(config: &ServerConfig, algorithm: Algorithm) -> Validation {
    let mut validation = Validation::new(algorithm);
    validation.set_issuer(&[normalize_issuer(&config.zitadel_issuer)]);
    if let Some(audience) = config
        .zitadel_audience
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        validation.set_audience(&[audience]);
    }
    validation
}

pub async fn verify_access_token(
    token: &str,
    config: &ServerConfig,
) -> anyhow::Result<ExternalIdentity> {
    let header = decode_header(token)?;
    let algorithm = header.alg;
    let kid = header
        .kid
        .ok_or_else(|| anyhow::anyhow!("OIDC token is missing kid"))?;
    let oidc = fetch_openid_configuration(config).await?;
    let jwks = reqwest::Client::new()
        .get(&oidc.jwks_uri)
        .send()
        .await?
        .error_for_status()?
        .json::<JwkSet>()
        .await?;
    let jwk = jwks
        .find(&kid)
        .ok_or_else(|| anyhow::anyhow!("No JWKS key found for kid {}", kid))?;
    let key = DecodingKey::from_jwk(jwk)?;
    let claims = decode::<VerifiedClaims>(token, &key, &validation_for(config, algorithm))?.claims;

    if let Some(expected) = config
        .zitadel_audience
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        if !claims.aud.contains(expected) {
            anyhow::bail!("OIDC token audience does not include expected audience");
        }
    }
    if claims.iss.trim_end_matches('/') != normalize_issuer(&config.zitadel_issuer) {
        anyhow::bail!("OIDC token issuer does not match configured issuer");
    }

    let roles = extract_roles(&claims.extra);
    let is_admin = config
        .zitadel_admin_role
        .as_deref()
        .map(|role| roles.iter().any(|candidate| candidate == role))
        .unwrap_or(false);
    let username = claims
        .preferred_username
        .clone()
        .or_else(|| claims.email.clone())
        .or_else(|| claims.name.clone())
        .unwrap_or_else(|| claims.sub.clone());

    Ok(ExternalIdentity {
        subject: claims.sub,
        username,
        email: claims.email,
        name: claims.name,
        roles,
        is_admin,
    })
}

use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub username: String,
    pub is_admin: bool,
    pub exp: usize,
}

pub fn sign_token(
    user_id: &str,
    username: &str,
    is_admin: bool,
    secret: &str,
) -> anyhow::Result<String> {
    let expiration = chrono_exp();
    let claims = Claims {
        sub: user_id.to_string(),
        username: username.to_string(),
        is_admin,
        exp: expiration,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(token)
}

pub fn verify_token(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

fn chrono_exp() -> usize {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    (now + 7 * 24 * 3600) as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_and_verify_roundtrip() {
        let secret = "test-secret-key";
        let token = sign_token("user-1", "alice", false, secret).unwrap();
        let claims = verify_token(&token, secret).unwrap();

        assert_eq!(claims.sub, "user-1");
        assert_eq!(claims.username, "alice");
        assert!(!claims.is_admin);
    }

    #[test]
    fn sign_and_verify_admin() {
        let secret = "admin-secret";
        let token = sign_token("admin-1", "bob", true, secret).unwrap();
        let claims = verify_token(&token, secret).unwrap();

        assert!(claims.is_admin);
        assert_eq!(claims.username, "bob");
    }

    #[test]
    fn verify_rejects_wrong_secret() {
        let token = sign_token("user-1", "alice", false, "correct-secret").unwrap();
        let result = verify_token(&token, "wrong-secret");
        assert!(result.is_err());
    }

    #[test]
    fn token_expiration_is_in_the_future() {
        let secret = "test";
        let token = sign_token("u", "u", false, secret).unwrap();
        let claims = verify_token(&token, secret).unwrap();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize;
        assert!(claims.exp > now);
    }
}

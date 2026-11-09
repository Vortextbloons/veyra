//! Locked-project vault cryptography.
//!
//! Only maintained RustCrypto primitives are used here: Argon2id for password
//! hardening and XChaCha20-Poly1305 for authenticated encryption. Nothing in
//! this module invents a construction; it composes the two with a versioned
//! envelope and authenticated associated data that binds the project id, the
//! record kind/id, the envelope version, and the record revision.
//!
//! Threat model notes (also documented in `docs/projects/05-locked-projects.md`):
//! * The vault protects data at rest against someone who obtains the files but
//!   not the password. The password never leaves this process, is never stored,
//!   and no recovery path exists.
//! * Data is plaintext in memory and in transit while a project is unlocked.
//! * An attacker who can write to the disk can also restore an older copy of a
//!   vault file (rollback), which AEAD cannot detect on its own.

use base64::Engine as _;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use argon2::{Algorithm, Argon2, Params, Version};

/// Envelope format tag. Changing it invalidates every existing vault.
pub const FORMAT: &str = "veyra-project-vault";
/// Current envelope version.
pub const VERSION: u32 = 1;
pub const SALT_BYTES: usize = 16;
pub const NONCE_BYTES: usize = 24;
pub const KEY_BYTES: usize = 32;

/// RFC 9106 second recommended Argon2id profile (64 MiB, t=3, p=4).
pub const DEFAULT_M_COST_KIB: u32 = 65_536;
pub const DEFAULT_T_COST: u32 = 3;
pub const DEFAULT_P_COST: u32 = 4;

// Bounds applied to KDF parameters read back from disk. They cap the work an
// untrusted header can ask this process to do and reject nonsense parameters.
const M_COST_KIB_MIN: u32 = 32_768;
const M_COST_KIB_MAX: u32 = 262_144;
const T_COST_MIN: u32 = 1;
const T_COST_MAX: u32 = 10;
const P_COST_MIN: u32 = 1;
const P_COST_MAX: u32 = 8;

fn b64_encode(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn b64_decode(value: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(value.trim())
        .map_err(|_| "Vault data is not valid base64.".to_string())
}

fn random_bytes<const N: usize>() -> Result<[u8; N], String> {
    let mut bytes = [0_u8; N];
    getrandom::fill(&mut bytes)
        .map_err(|error| format!("Could not read secure randomness: {error}"))?;
    Ok(bytes)
}

/// A user-facing message that does not disclose whether the password, the
/// ciphertext, or the associated data was wrong.
pub fn authentication_error() -> String {
    "Locked project data failed authentication. The password is wrong or the encrypted files were changed."
        .to_string()
}

/// Argon2id parameters plus the random per-vault salt.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct KdfParams {
    pub algorithm: String,
    pub m_cost_kib: u32,
    pub t_cost: u32,
    pub p_cost: u32,
    pub salt_b64: String,
}

impl KdfParams {
    pub fn generate() -> Result<Self, String> {
        Ok(Self {
            algorithm: "argon2id".to_string(),
            m_cost_kib: DEFAULT_M_COST_KIB,
            t_cost: DEFAULT_T_COST,
            p_cost: DEFAULT_P_COST,
            salt_b64: b64_encode(&random_bytes::<SALT_BYTES>()?),
        })
    }

    /// Bounded, explicit validation before any KDF work happens.
    pub fn validate(&self) -> Result<(), String> {
        if self.algorithm != "argon2id" {
            return Err("The vault uses an unsupported key-derivation algorithm.".into());
        }
        if !(M_COST_KIB_MIN..=M_COST_KIB_MAX).contains(&self.m_cost_kib) {
            return Err("The vault key-derivation memory cost is outside the supported range.".into());
        }
        if !(T_COST_MIN..=T_COST_MAX).contains(&self.t_cost) {
            return Err("The vault key-derivation iteration count is outside the supported range.".into());
        }
        if !(P_COST_MIN..=P_COST_MAX).contains(&self.p_cost) {
            return Err("The vault key-derivation parallelism is outside the supported range.".into());
        }
        if self.salt()?.len() != SALT_BYTES {
            return Err("The vault salt must be exactly 16 bytes.".into());
        }
        Ok(())
    }

    pub fn salt(&self) -> Result<Vec<u8>, String> {
        b64_decode(&self.salt_b64)
    }
}

/// The password-wrapped data key stored beside the ciphertext.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KeyWrap {
    pub algorithm: String,
    pub nonce_b64: String,
    pub data_b64: String,
}

pub fn keywrap_aad(project_id: &str) -> Vec<u8> {
    format!("{FORMAT}:v{VERSION}:keywrap:{project_id}").into_bytes()
}

pub fn record_aad(project_id: &str, kind: &str, id: &str, revision: u64) -> Vec<u8> {
    format!("{FORMAT}:v{VERSION}:record:{project_id}:{kind}:{id}:{revision}").into_bytes()
}

/// Argon2id(password, salt) -> 32-byte wrapping key.
pub fn derive_wrapping_key(
    password: &str,
    params: &KdfParams,
) -> Result<Zeroizing<[u8; KEY_BYTES]>, String> {
    params.validate()?;
    let salt = params.salt()?;
    let argon_params = Params::new(
        params.m_cost_kib,
        params.t_cost,
        params.p_cost,
        Some(KEY_BYTES),
    )
    .map_err(|_| "The vault key-derivation parameters are invalid.".to_string())?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);
    let mut out = Zeroizing::new([0_u8; KEY_BYTES]);
    argon
        .hash_password_into(password.as_bytes(), &salt, out.as_mut())
        .map_err(|_| "Could not derive the vault key.".to_string())?;
    Ok(out)
}

pub fn generate_data_key() -> Result<Zeroizing<[u8; KEY_BYTES]>, String> {
    Ok(Zeroizing::new(random_bytes::<KEY_BYTES>()?))
}

fn cipher(key: &[u8; KEY_BYTES]) -> XChaCha20Poly1305 {
    XChaCha20Poly1305::new_from_slice(key).expect("32-byte keys are always valid")
}

pub fn wrap_data_key(
    project_id: &str,
    password: &str,
    params: &KdfParams,
    data_key: &[u8; KEY_BYTES],
) -> Result<KeyWrap, String> {
    let wrapping_key = derive_wrapping_key(password, params)?;
    let nonce = random_bytes::<NONCE_BYTES>()?;
    let ciphertext = cipher(&wrapping_key)
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: data_key,
                aad: &keywrap_aad(project_id),
            },
        )
        .map_err(|_| "Could not wrap the vault data key.".to_string())?;
    Ok(KeyWrap {
        algorithm: "xchacha20poly1305".to_string(),
        nonce_b64: b64_encode(&nonce),
        data_b64: b64_encode(&ciphertext),
    })
}

pub fn unwrap_data_key(
    project_id: &str,
    password: &str,
    params: &KdfParams,
    wrap: &KeyWrap,
) -> Result<Zeroizing<[u8; KEY_BYTES]>, String> {
    if wrap.algorithm != "xchacha20poly1305" {
        return Err("The vault uses an unsupported key-wrapping algorithm.".into());
    }
    let nonce = b64_decode(&wrap.nonce_b64)?;
    if nonce.len() != NONCE_BYTES {
        return Err("The vault key-wrapping nonce must be exactly 24 bytes.".into());
    }
    let ciphertext = b64_decode(&wrap.data_b64)?;
    let wrapping_key = derive_wrapping_key(password, params)?;
    let plaintext = cipher(&wrapping_key)
        .decrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &ciphertext,
                aad: &keywrap_aad(project_id),
            },
        )
        .map_err(|_| authentication_error())?;
    if plaintext.len() != KEY_BYTES {
        return Err("The vault data key has an invalid length.".into());
    }
    let mut key = Zeroizing::new([0_u8; KEY_BYTES]);
    key.copy_from_slice(&plaintext);
    Ok(key)
}

/// Encrypt one record. A fresh random nonce is generated for every write.
pub fn encrypt_record(
    project_id: &str,
    kind: &str,
    id: &str,
    revision: u64,
    key: &[u8; KEY_BYTES],
    plaintext: &[u8],
) -> Result<(Vec<u8>, Vec<u8>), String> {
    let nonce = random_bytes::<NONCE_BYTES>()?;
    let ciphertext = cipher(key)
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad: &record_aad(project_id, kind, id, revision),
            },
        )
        .map_err(|_| "Could not encrypt vault data.".to_string())?;
    Ok((nonce.to_vec(), ciphertext))
}

pub fn decrypt_record(
    project_id: &str,
    kind: &str,
    id: &str,
    revision: u64,
    key: &[u8; KEY_BYTES],
    nonce: &[u8],
    ciphertext: &[u8],
) -> Result<Zeroizing<Vec<u8>>, String> {
    if nonce.len() != NONCE_BYTES {
        return Err(authentication_error());
    }
    let plaintext = cipher(key)
        .decrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad: &record_aad(project_id, kind, id, revision),
            },
        )
        .map_err(|_| authentication_error())?;
    Ok(Zeroizing::new(plaintext))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fast_params() -> KdfParams {
        // The real profile is 64 MiB/t=3/p=4. Tests keep a valid, bounded
        // parameter set but trade memory hardness for suite runtime.
        KdfParams {
            algorithm: "argon2id".to_string(),
            m_cost_kib: 32_768,
            t_cost: 1,
            p_cost: 1,
            salt_b64: b64_encode(&[9_u8; SALT_BYTES]),
        }
    }

    #[test]
    fn generated_parameters_use_the_rfc9106_profile_and_a_random_salt() {
        let first = KdfParams::generate().unwrap();
        let second = KdfParams::generate().unwrap();
        assert_eq!(first.m_cost_kib, 65_536);
        assert_eq!(first.t_cost, 3);
        assert_eq!(first.p_cost, 4);
        assert_ne!(first.salt_b64, second.salt_b64);
        assert!(first.validate().is_ok());
    }

    #[test]
    fn rejects_out_of_range_kdf_parameters_before_deriving() {
        let mut params = fast_params();
        params.m_cost_kib = 4_000_000;
        assert!(params.validate().is_err());
        let mut params = fast_params();
        params.t_cost = 0;
        assert!(params.validate().is_err());
        let mut params = fast_params();
        params.p_cost = 64;
        assert!(params.validate().is_err());
        let mut params = fast_params();
        params.salt_b64 = b64_encode(&[1_u8; 8]);
        assert!(params.validate().is_err());
        let mut params = fast_params();
        params.algorithm = "pbkdf2".to_string();
        assert!(params.validate().is_err());
    }

    #[test]
    fn password_wrap_round_trips_and_rejects_the_wrong_password() {
        let params = fast_params();
        let data_key = generate_data_key().unwrap();
        let wrap = wrap_data_key("proj-1", "correct horse", &params, &data_key).unwrap();
        let unwrapped = unwrap_data_key("proj-1", "correct horse", &params, &wrap).unwrap();
        assert_eq!(&*unwrapped, &*data_key);

        let error = unwrap_data_key("proj-1", "wrong", &params, &wrap).unwrap_err();
        assert!(error.contains("failed authentication"), "{error}");
    }

    #[test]
    fn key_wrap_is_bound_to_the_project_id() {
        let params = fast_params();
        let data_key = generate_data_key().unwrap();
        let wrap = wrap_data_key("proj-1", "pw", &params, &data_key).unwrap();
        assert!(unwrap_data_key("proj-2", "pw", &params, &wrap).is_err());
    }

    #[test]
    fn records_reject_tampering_truncation_and_substitution() {
        let key = generate_data_key().unwrap();
        let (nonce, ciphertext) =
            encrypt_record("proj", "conversation", "c1", 1, &key, b"secret").unwrap();

        let mut flipped = ciphertext.clone();
        flipped[0] ^= 0x01;
        assert!(decrypt_record("proj", "conversation", "c1", 1, &key, &nonce, &flipped).is_err());

        let truncated = &ciphertext[..ciphertext.len() - 1];
        assert!(decrypt_record("proj", "conversation", "c1", 1, &key, &nonce, truncated).is_err());

        // Same key, different logical record: the AAD binding must reject it.
        assert!(decrypt_record("proj", "conversation", "c2", 1, &key, &nonce, &ciphertext).is_err());
        assert!(decrypt_record("proj", "memory", "c1", 1, &key, &nonce, &ciphertext).is_err());
        assert!(decrypt_record("other", "conversation", "c1", 1, &key, &nonce, &ciphertext).is_err());
        assert!(decrypt_record("proj", "conversation", "c1", 2, &key, &nonce, &ciphertext).is_err());

        assert_eq!(
            &*decrypt_record("proj", "conversation", "c1", 1, &key, &nonce, &ciphertext).unwrap(),
            b"secret"
        );
    }

    #[test]
    fn every_write_uses_a_fresh_nonce() {
        let key = generate_data_key().unwrap();
        let (first_nonce, first) =
            encrypt_record("proj", "conversation", "c1", 1, &key, b"same").unwrap();
        let (second_nonce, second) =
            encrypt_record("proj", "conversation", "c1", 2, &key, b"same").unwrap();
        assert_ne!(first_nonce, second_nonce);
        assert_ne!(first, second);
    }
}

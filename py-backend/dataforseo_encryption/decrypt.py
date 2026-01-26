"""
Runtime credential decryption module for DataForSEO
Decrypts encrypted credentials from environment variables at runtime
"""

import os
from Crypto.Cipher import AES
from typing import Dict


def decrypt(payload: str, key: bytes) -> str:
    """
    Decrypt encrypted payload using AES-256-GCM
    
    Args:
        payload: Encrypted string in format: iv_hex:tag_hex:encrypted_hex
        key: 32-byte decryption key
        
    Returns:
        Decrypted plain text string
        
    Raises:
        ValueError: If decryption fails (invalid key, corrupted data, etc.)
    """
    try:
        parts = payload.split(":")
        if len(parts) != 3:
            raise ValueError("Invalid encrypted payload format. Expected: iv:tag:encrypted")
        
        iv_hex, tag_hex, encrypted_hex = parts
        
        # Convert hex strings to bytes
        iv = bytes.fromhex(iv_hex)
        tag = bytes.fromhex(tag_hex)
        ciphertext = bytes.fromhex(encrypted_hex)
        
        # Decrypt
        cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
        decrypted = cipher.decrypt_and_verify(ciphertext, tag)
        
        return decrypted.decode("utf-8")
    except Exception as e:
        raise ValueError(f"Failed to decrypt credentials: {str(e)}") from e


def get_dataforseo_auth() -> Dict[str, str]:
    """
    Get decrypted DataForSEO credentials from environment variables
    
    Returns:
        Dictionary with 'username' and 'password' keys
        
    Raises:
        ValueError: If credentials are not configured or decryption fails
    """
    # Check for encrypted credentials
    username_enc = os.getenv("DATAFORSEO_USERNAME_ENC")
    password_enc = os.getenv("DATAFORSEO_PASSWORD_ENC")
    master_key_hex = os.getenv("DATAFORSEO_MASTER_KEY")
    
    if username_enc and password_enc and master_key_hex:
        # Use encrypted credentials
        try:
            key = bytes.fromhex(master_key_hex)
            if len(key) != 32:
                raise ValueError("MASTER_KEY must be 64 hex characters (32 bytes)")
            
            username = decrypt(username_enc, key)
            password = decrypt(password_enc, key)
            
            return {
                "username": username,
                "password": password,
            }
        except Exception as e:
            raise ValueError(
                f"Failed to decrypt DataForSEO credentials: {str(e)}. "
                "Please check your DATAFORSEO_USERNAME_ENC, DATAFORSEO_PASSWORD_ENC, "
                "and DATAFORSEO_MASTER_KEY environment variables."
            ) from e
    
    # No fallback - encrypted credentials are required
    raise ValueError(
        "DataForSEO credentials not provided. "
        "Please set DATAFORSEO_USERNAME_ENC, DATAFORSEO_PASSWORD_ENC, "
        "and DATAFORSEO_MASTER_KEY environment variables. "
        "Use py-backend/dataforseo_encryption/encrypt.py to generate encrypted credentials."
    )


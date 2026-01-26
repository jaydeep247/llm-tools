#!/usr/bin/env python3
"""
One-time script to encrypt DataForSEO credentials
Run this locally to generate encrypted credentials for .env file

Usage:
    python -m dataforseo_encryption.encrypt

⚠️  IMPORTANT: Save the MASTER_KEY securely. Do NOT commit it to git.
"""

from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
import os
import sys


def encrypt(text: str, key: bytes, iv: bytes) -> str:
    """
    Encrypt text using AES-256-GCM
    
    Args:
        text: Plain text to encrypt
        key: 32-byte encryption key
        iv: 12-byte initialization vector
        
    Returns:
        Encrypted string in format: iv_hex:tag_hex:encrypted_hex
    """
    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    ciphertext, tag = cipher.encrypt_and_digest(text.encode("utf-8"))
    
    # Format: iv:tag:encrypted
    return f"{iv.hex()}:{tag.hex()}:{ciphertext.hex()}"


def main():
    """Main function to encrypt credentials"""
    
    print("=" * 60)
    print("DataForSEO Credential Encryption Tool")
    print("=" * 60)
    print()
    
    # Try to load from root .env file
    from dotenv import load_dotenv

    # This package lives in py-backend/dataforseo_encryption/
    # Root .env is at py-backend/.env
    root_dir = os.path.dirname(os.path.dirname(__file__))
    env_path = os.path.join(root_dir, ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path)
        print(f"Loaded environment from: {env_path}")
    
    # Get credentials from user or environment
    username = os.getenv("DATAFORSEO_USERNAME")
    password = os.getenv("DATAFORSEO_PASSWORD")
    
    if not username:
        username = input("Enter DataForSEO username: ").strip()
    if not password:
        password = input("Enter DataForSEO password: ").strip()
    
    if not username or not password:
        print("ERROR: Username and password are required")
        sys.exit(1)
    
    # Generate key and IV
    print("\nGenerating encryption key and IV...")
    key = get_random_bytes(32)  # 256-bit key
    iv = get_random_bytes(12)   # 96-bit IV for GCM
    
    # Encrypt credentials
    print("Encrypting credentials...")
    username_enc = encrypt(username, key, iv)
    password_enc = encrypt(password, key, get_random_bytes(12))  # Different IV for password
    
    # Output results
    print("\n" + "=" * 60)
    print("ENCRYPTED CREDENTIALS - Add these to your .env file:")
    print("=" * 60)
    print()
    print(f"DATAFORSEO_USERNAME_ENC={username_enc}")
    print(f"DATAFORSEO_PASSWORD_ENC={password_enc}")
    print(f"DATAFORSEO_MASTER_KEY={key.hex()}")
    print()
    print("=" * 60)
    print("⚠️  SECURITY WARNING:")
    print("=" * 60)
    print("1. Save the MASTER_KEY securely (e.g., password manager)")
    print("2. Do NOT commit MASTER_KEY to git")
    print("3. Add DATAFORSEO_MASTER_KEY to your .env file")
    print("4. Remove old DATAFORSEO_USERNAME and DATAFORSEO_PASSWORD from .env")
    print("=" * 60)


if __name__ == "__main__":
    main()


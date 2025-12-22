import os
from pathlib import Path
from cryptography.fernet import Fernet

KEY_FILE_PATH = Path.home() / ".config" / "helpful-tools" / "encryption" / "key.txt"

def _get_key():
    """Get or generate encryption key."""
    if KEY_FILE_PATH.exists():
        with open(KEY_FILE_PATH, "rb") as f:
            return f.read()
    
    # Generate new key
    key = Fernet.generate_key()
    
    # Ensure directory exists
    KEY_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    with open(KEY_FILE_PATH, "wb") as f:
        f.write(key)
        
    return key

def encrypt_data(data: bytes) -> bytes:
    """Encrypt data using Fernet."""
    key = _get_key()
    f = Fernet(key)
    return f.encrypt(data)

def decrypt_data(data: bytes) -> bytes:
    """Decrypt data using Fernet."""
    key = _get_key()
    f = Fernet(key)
    return f.decrypt(data)

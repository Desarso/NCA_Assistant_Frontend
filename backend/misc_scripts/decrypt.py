import argparse
import os
import json
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

def generate_key():
    """Generate a new key and save it to keys.json"""
    key = Fernet.generate_key()
    key_str = base64.b64encode(key).decode('utf-8')
    with open('keys.json', 'w') as f:
        json.dump({'ENCRYPTION_KEY': key_str}, f, indent=4)
    print("New key generated and saved to keys.json")
    return key

def load_key():
    """Load encryption key from keys.json file"""
    try:
        with open('keys.json', 'r') as f:
            keys = json.load(f)
            key_str = keys.get('ENCRYPTION_KEY')
            if not key_str:
                return generate_key()
            return base64.b64decode(key_str)
    except FileNotFoundError:
        return generate_key()

def decrypt_file(input_file: str = 'age.env', output_file: str = 'new.env'):
    """Decrypt a file using Fernet symmetric encryption"""
    key = load_key()
    f = Fernet(key)
    
    with open(input_file, 'rb') as file:
        encrypted_data = file.read()
    
    decrypted_data = f.decrypt(encrypted_data)
    
    with open(output_file, 'wb') as file:
        file.write(decrypted_data)

def encrypt_file(input_file: str = '.env', output_file: str = 'age.env'):
    """Encrypt a file using Fernet symmetric encryption"""
    key = load_key()
    f = Fernet(key)
    
    with open(input_file, 'rb') as file:
        file_data = file.read()
    
    encrypted_data = f.encrypt(file_data)
    
    with open(output_file, 'wb') as file:
        file.write(encrypted_data)

def main():
    parser = argparse.ArgumentParser(description='Encrypt/Decrypt files using cryptography')
    parser.add_argument('input_file', nargs='?', 
                        help='Input file to process (default: .env for encrypt, age.env for decrypt)')
    parser.add_argument('output_file', nargs='?',
                        help='Output file path (default: age.env for encrypt, new.env for decrypt)')
    parser.add_argument('-e', '--encrypt', action='store_true', 
                        help='Encrypt instead of decrypt (default: decrypt)')
    parser.add_argument('-g', '--generate', action='store_true',
                        help='Generate a new encryption key')
    
    args = parser.parse_args()
    
    try:
        if args.generate:
            generate_key()
            return

        if args.encrypt:
            input_file = args.input_file or '.env'
            output_file = args.output_file or 'age.env'
            encrypt_file(input_file, output_file)
            print(f"Successfully encrypted {input_file} to {output_file}")
        else:
            input_file = args.input_file or 'age.env'
            output_file = args.output_file or 'new.env'
            decrypt_file(input_file, output_file)
            print(f"Successfully decrypted {input_file} to {output_file}")
    except Exception as e:
        print(f"Error processing file: {e}")

if __name__ == "__main__":
    main()

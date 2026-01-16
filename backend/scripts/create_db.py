#!/usr/bin/env python3
"""
Script to create the PostgreSQL database if it doesn't exist.
This connects to PostgreSQL and creates the database specified in DATABASE_URL.
"""
import os
import sys
from urllib.parse import urlparse
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Add backend to path
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)
sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
load_dotenv()

def create_database():
    """Create the database if it doesn't exist"""
    db_url = os.getenv("DATABASE_URL")
    
    if not db_url:
        print("No DATABASE_URL found in environment. Using SQLite default.")
        return
    
    if not db_url.startswith(("postgres://", "postgresql://", "postgresql+psycopg2://")):
        print(f"Database URL is not PostgreSQL: {db_url[:50]}...")
        print("Skipping database creation (not PostgreSQL).")
        return
    
    # Parse the database URL
    # Handle postgresql+psycopg2:// scheme
    if db_url.startswith("postgresql+psycopg2://"):
        db_url = db_url.replace("postgresql+psycopg2://", "postgresql://")
    
    parsed = urlparse(db_url)
    
    # Extract connection details
    db_name = parsed.path.lstrip('/')
    db_user = parsed.username or 'postgres'
    db_password = parsed.password or ''
    db_host = parsed.hostname or 'localhost'
    db_port = parsed.port or 5432
    
    print(f"Connecting to PostgreSQL at {db_host}:{db_port} as {db_user}...")
    print(f"Target database: {db_name}")
    
    # Connect to PostgreSQL server (not the specific database)
    # Use 'postgres' database to create the new database
    try:
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            database='postgres'  # Connect to default database
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (db_name,)
        )
        exists = cursor.fetchone()
        
        if exists:
            print(f"✓ Database '{db_name}' already exists.")
        else:
            # Create the database
            cursor.execute(f'CREATE DATABASE "{db_name}"')
            print(f"✓ Database '{db_name}' created successfully!")
        
        cursor.close()
        conn.close()
        
    except psycopg2.OperationalError as e:
        print(f"✗ Error connecting to PostgreSQL: {e}")
        print("\nMake sure:")
        print("  1. PostgreSQL is running")
        print("  2. Connection details in DATABASE_URL are correct")
        print("  3. You have permission to create databases")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    create_database()

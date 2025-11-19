#!/usr/bin/env python3
"""
Script to check current database schema and compare with expected migration state.
Run this on the server to see what migrations will change.
"""
import os
import sys
from sqlalchemy import inspect, text

# Add backend to path
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)
sys.path.insert(0, backend_dir)

from database.models import engine

def check_schema():
    """Check current database schema"""
    print("=" * 70)
    print("DATABASE SCHEMA CHECK")
    print("=" * 70)
    
    db_url = os.getenv("DATABASE_URL", "sqlite:///./db/chat_history.sqlite")
    print(f"\nDatabase URL: {db_url[:50]}..." if len(db_url) > 50 else f"\nDatabase URL: {db_url}")
    
    try:
        with engine.connect() as conn:
            # Test connectivity
            v = conn.execute(text("SELECT 1")).scalar()
            print(f"✓ Database connectivity OK")
            
            # Get database type
            try:
                db_type = conn.execute(text("SELECT version()")).fetchone()[0]
                print(f"✓ Database: {db_type[:50]}...")
            except:
                print(f"✓ Database: SQLite")
            
            inspector = inspect(engine)
            all_tables = inspector.get_table_names()
            
            print(f"\n{'='*70}")
            print("TABLE CHECK")
            print(f"{'='*70}")
            print(f"\nFound {len(all_tables)} table(s): {', '.join(sorted(all_tables))}")
            
            # Check for expected tables
            expected_tables = {
                'user': 'User table',
                'role': 'Role table',
                'permission': 'Permission table',
                'userrolelink': 'User-Role association table',
                'rolepermissionlink': 'Role-Permission association table',
            }
            
            print(f"\n{'Table':<30} {'Status':<15} {'Description'}")
            print("-" * 70)
            for table_key, description in expected_tables.items():
                exists = table_key.lower() in [t.lower() for t in all_tables]
                status = "✓ EXISTS" if exists else "✗ MISSING"
                print(f"{table_key:<30} {status:<15} {description}")
            
            # Check user table columns
            print(f"\n{'='*70}")
            print("USER TABLE COLUMNS")
            print(f"{'='*70}")
            
            if 'user' in [t.lower() for t in all_tables]:
                try:
                    columns = inspector.get_columns('user')
                    column_names = [col['name'] for col in columns]
                    
                    print(f"\nFound {len(column_names)} column(s) in user table:")
                    for col in columns:
                        col_type = str(col['type'])
                        nullable = "NULL" if col.get('nullable', True) else "NOT NULL"
                        default = f" DEFAULT {col.get('default')}" if col.get('default') is not None else ""
                        print(f"  - {col['name']:<30} {col_type:<20} {nullable}{default}")
                    
                    # Check for expected columns from migrations
                    expected_user_columns = {
                        'github_token': 'GitHub OAuth token',
                        'github_username': 'GitHub username',
                        'preferred_model': 'Preferred AI model',
                        'microsoft_access_token': 'Microsoft access token',
                        'microsoft_refresh_token': 'Microsoft refresh token',
                        'microsoft_token_expires_at': 'Microsoft token expiration',
                        'microsoft_consent_given': 'Microsoft consent flag',
                        'roles': 'Roles (old JSON column - may be removed after migration)',
                    }
                    
                    print(f"\n{'Column':<35} {'Status':<15} {'Description'}")
                    print("-" * 70)
                    for col_name, description in expected_user_columns.items():
                        exists = col_name in column_names
                        status = "✓ EXISTS" if exists else "✗ MISSING"
                        print(f"{col_name:<35} {status:<15} {description}")
                        
                except Exception as e:
                    print(f"✗ Error inspecting user table: {e}")
            else:
                print("✗ User table not found!")
            
            # Check Role and Permission tables
            print(f"\n{'='*70}")
            print("ROLE & PERMISSION TABLES")
            print(f"{'='*70}")
            
            if 'role' in [t.lower() for t in all_tables]:
                try:
                    role_columns = inspector.get_columns('role')
                    print(f"\nRole table columns ({len(role_columns)}):")
                    for col in role_columns:
                        print(f"  - {col['name']:<30} {col['type']}")
                except Exception as e:
                    print(f"✗ Error inspecting role table: {e}")
            else:
                print("✗ Role table not found!")
            
            if 'permission' in [t.lower() for t in all_tables]:
                try:
                    perm_columns = inspector.get_columns('permission')
                    print(f"\nPermission table columns ({len(perm_columns)}):")
                    for col in perm_columns:
                        print(f"  - {col['name']:<30} {col['type']}")
                except Exception as e:
                    print(f"✗ Error inspecting permission table: {e}")
            else:
                print("✗ Permission table not found!")
            
            # Check association tables
            print(f"\n{'='*70}")
            print("ASSOCIATION TABLES")
            print(f"{'='*70}")
            
            link_tables = {
                'userrolelink': 'User-Role many-to-many',
                'rolepermissionlink': 'Role-Permission many-to-many',
            }
            
            for table_name, description in link_tables.items():
                exists = table_name.lower() in [t.lower() for t in all_tables]
                status = "✓ EXISTS" if exists else "✗ MISSING"
                print(f"{table_name:<30} {status:<15} {description}")
                if exists:
                    try:
                        cols = inspector.get_columns(table_name)
                        print(f"  Columns: {', '.join([c['name'] for c in cols])}")
                    except:
                        pass
            
            print(f"\n{'='*70}")
            print("SUMMARY")
            print(f"{'='*70}")
            print("\nThis script shows what migrations will add/modify.")
            print("Run the migration scripts to apply changes:")
            print("  1. python backend/migrations/versions/migrate.py")
            print("  2. python backend/migrations/versions/add_microsoft_columns.py")
            print("  3. python backend/migrations/versions/migrate_roles.py")
            print("  4. python backend/migrations/versions/seed_default_permissions.py")
            print(f"\n{'='*70}\n")
            
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    check_schema()


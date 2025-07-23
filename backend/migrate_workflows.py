#!/usr/bin/env python3
"""
Migration script to add workflow tables to the existing database.
Run this script after updating models.py with workflow functionality.
"""

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))

from ai.models import create_db_and_tables, engine
from sqlmodel import SQLModel, text
from sqlalchemy import inspect

def main():
    """Run the migration to add workflow tables"""
    print("Starting workflow tables migration...")
    
    # Check if tables already exist
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    workflow_tables = ['workflow', 'workflowschedule', 'workflowrun']
    missing_tables = [table for table in workflow_tables if table not in existing_tables]
    
    if not missing_tables:
        print("✅ All workflow tables already exist. No migration needed.")
        return
    
    print(f"📋 Missing tables: {missing_tables}")
    print("🔄 Creating missing workflow tables...")
    
    # Create all tables (existing ones will be skipped)
    create_db_and_tables()
    
    # Verify the tables were created
    inspector = inspect(engine)
    existing_tables_after = inspector.get_table_names()
    
    newly_created = [table for table in workflow_tables if table in existing_tables_after and table not in existing_tables]
    
    if newly_created:
        print(f"✅ Successfully created tables: {newly_created}")
    else:
        print("⚠️  No new tables were created. They may already exist.")
    
    print("🎉 Migration completed successfully!")

if __name__ == "__main__":
    main() 
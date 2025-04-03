from sqlalchemy import text, inspect
from ai.models import engine, User, create_db_and_tables

def add_new_columns():
    # First ensure all tables exist
    create_db_and_tables()
    
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('user')]
    
    with engine.connect() as conn:
        # Add columns if they don't exist
        if 'github_token' not in columns:
            conn.execute(text("ALTER TABLE user ADD COLUMN github_token TEXT"))
        if 'github_username' not in columns:
            conn.execute(text("ALTER TABLE user ADD COLUMN github_username TEXT"))
        if 'preferred_model' not in columns:
            conn.execute(text("ALTER TABLE user ADD COLUMN preferred_model TEXT DEFAULT 'gemini'"))
        conn.commit()

if __name__ == "__main__":
    print("Starting database migration...")
    add_new_columns()
    print("Database migration completed successfully!") 
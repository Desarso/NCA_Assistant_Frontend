import yaml
import sqlite3
import json
import os
import sys

# --- Configuration ---
# <<<--- REPLACE with the path to your large OpenAPI input file
INPUT_YAML_FILE = "openapi.yaml"
# <<<--- REPLACE with the desired path for the output SQLite database file
OUTPUT_SQLITE_DB = "openapi_components.db"
# --- End Configuration ---

def create_database_tables(cursor):
    """Creates the necessary tables in the SQLite database if they don't exist."""
    try:
        # Table for Schemas
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS schemas (
                name TEXT PRIMARY KEY,
                definition_json TEXT NOT NULL
            )
        ''')
        # Table for Parameters
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS parameters (
                name TEXT PRIMARY KEY,
                definition_json TEXT NOT NULL
            )
        ''')
        # Table for Responses
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS responses (
                name TEXT PRIMARY KEY,
                definition_json TEXT NOT NULL
            )
        ''')
        # Table for Request Bodies
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS requestBodies (
                name TEXT PRIMARY KEY,
                definition_json TEXT NOT NULL
            )
        ''')
        # Add more tables here if needed (e.g., for headers, securitySchemes)
        print("Database tables ensured.")
    except sqlite3.Error as e:
        print(f"Database table creation error: {e}", file=sys.stderr)
        raise # Re-raise the exception to stop the script if tables can't be made

def load_components_to_sqlite(input_yaml_path, output_db_path):
    """
    Loads OpenAPI components from a YAML file into an SQLite database.
    """
    print(f"Starting processing of {input_yaml_path}...")

    # 1. Load YAML file
    try:
        with open(input_yaml_path, 'r', encoding='utf-8') as f_in:
            print("Loading YAML file (this may take a while)...")
            openapi_data = yaml.safe_load(f_in)
            print("YAML file loaded.")
    except FileNotFoundError:
        print(f"Error: Input YAML file not found at '{input_yaml_path}'", file=sys.stderr)
        return False
    except yaml.YAMLError as e:
        print(f"Error parsing YAML file: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"An unexpected error occurred during YAML loading: {e}", file=sys.stderr)
        return False

    if not isinstance(openapi_data, dict) or 'components' not in openapi_data:
        print("Error: Parsed YAML is not a dictionary or missing 'components' section.", file=sys.stderr)
        return False

    components = openapi_data['components']
    if not isinstance(components, dict):
        print("Error: 'components' section is not a dictionary.", file=sys.stderr)
        return False

    # 2. Connect to SQLite DB and Create Tables
    conn = None
    try:
        conn = sqlite3.connect(output_db_path)
        cursor = conn.cursor()
        print(f"Connected to SQLite database: {output_db_path}")
        create_database_tables(cursor) # Ensure tables exist
    except sqlite3.Error as e:
        print(f"SQLite connection or table creation error: {e}", file=sys.stderr)
        if conn:
            conn.close()
        return False

    # 3. Process and Insert Components
    component_types_to_process = {
        "schemas": "schemas",
        "parameters": "parameters",
        "responses": "responses",
        "requestBodies": "requestBodies"
        # Add mappings here if table names differ or to process more types
    }
    total_inserted = 0
    total_processed = 0

    try:
        print("Processing components and inserting into database...")
        for component_type_key, table_name in component_types_to_process.items():
            if component_type_key in components and isinstance(components[component_type_key], dict):
                print(f"  Processing '{component_type_key}'...")
                count_in_type = 0
                for name, definition in components[component_type_key].items():
                    total_processed += 1
                    if not isinstance(definition, dict):
                         print(f"Warning: Skipping non-dictionary definition for {component_type_key} '{name}'", file=sys.stderr)
                         continue
                    try:
                        # Convert the Python dictionary definition to a JSON string
                        definition_json = json.dumps(definition, separators=(',', ':')) # Compact JSON

                        # Insert or replace the entry in the corresponding table
                        # Using INSERT OR REPLACE handles updates if the script is run again
                        sql = f"INSERT OR REPLACE INTO {table_name} (name, definition_json) VALUES (?, ?)"
                        cursor.execute(sql, (name, definition_json))
                        count_in_type += 1
                        total_inserted += 1

                    except json.JSONDecodeError as e:
                         print(f"Warning: Could not serialize definition for {component_type_key} '{name}' to JSON: {e}", file=sys.stderr)
                    except sqlite3.Error as e:
                         print(f"Warning: Failed to insert {component_type_key} '{name}': {e}", file=sys.stderr)
                         # Optionally rollback or break here depending on desired atomicity
                print(f"    -> Inserted/Replaced {count_in_type} entries for '{component_type_key}'.")
            else:
                print(f"  Component type '{component_type_key}' not found or not a dictionary in YAML.")

        # Commit changes to the database
        conn.commit()
        print(f"\nDatabase commit successful.")
        print(f"Total components processed: {total_processed}")
        print(f"Total components inserted/replaced: {total_inserted}")
        return True

    except Exception as e:
        print(f"\nAn error occurred during component processing or insertion: {e}", file=sys.stderr)
        if conn:
            conn.rollback() # Rollback any partial changes on error
            print("Database transaction rolled back.")
        return False
    finally:
        if conn:
            conn.close()
            print("Database connection closed.")


# --- Main execution ---
if __name__ == "__main__":
    print("--- OpenAPI Components to SQLite Loader ---")
    success = load_components_to_sqlite(INPUT_YAML_FILE, OUTPUT_SQLITE_DB)
    if success:
        print("\nScript finished successfully.")
    else:
        print("\nScript finished with errors.")
        sys.exit(1) # Exit with error code

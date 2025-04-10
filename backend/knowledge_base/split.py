import yaml
import sys
import json # Using json for deepcopy
import os
from collections import defaultdict

# --- Configuration ---
# <<<--- REPLACE with the path to your large OpenAPI input file
INPUT_FILE = "openapi.yaml"
# <<<--- REPLACE with the desired DIRECTORY to save the output group files
OUTPUT_DIR = "output_api_groups"
# --- End Configuration ---

def resolve_schema_ref(ref, schemas_dict):
    """
    Resolves a $ref pointer within the components/schemas section.
    Returns a deep copy of the resolved schema or None if not found/invalid.
    """
    if not isinstance(ref, str) or not ref.startswith('#/components/schemas/'):
        # print(f"Warning: Invalid or unsupported schema reference format: {ref}", file=sys.stderr)
        return None # Keep quiet on warnings for cleaner output unless debugging

    schema_name = ref.split('/')[-1]
    resolved_schema = schemas_dict.get(schema_name)

    if resolved_schema is None:
        # print(f"Warning: Schema reference not found: {ref}", file=sys.stderr)
        return None

    # Return a deep copy using json load/dump for safety
    try:
        return json.loads(json.dumps(resolved_schema))
    except TypeError as e:
        # print(f"Warning: Could not deep copy schema {schema_name}: {e}", file=sys.stderr)
        # Fallback to returning the reference itself or handle differently if needed
        return {"$ref": ref, "error": "Could not resolve/copy"}

def process_and_split_openapi_spec(input_filepath, output_dir):
    """
    Reads a large OpenAPI spec, extracts key endpoint information,
    resolves request body schemas, groups by path segment, and writes
    a separate distilled YAML file for each group to the output directory.
    """
    print(f"Starting processing of {input_filepath}...")

    try:
        with open(input_filepath, 'r', encoding='utf-8') as f_in:
            print("Loading YAML file (this may take a while)...")
            openapi_data = yaml.safe_load(f_in)
            print("YAML file loaded.")
    except FileNotFoundError:
        print(f"Error: Input file not found at '{input_filepath}'")
        return
    except yaml.YAMLError as e:
        print(f"Error parsing YAML file: {e}")
        return
    except Exception as e:
        print(f"An unexpected error occurred during file loading: {e}")
        return

    if not isinstance(openapi_data, dict):
        print("Error: Parsed YAML data is not a dictionary.")
        return

    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        try:
            os.makedirs(output_dir)
            print(f"Created output directory: {output_dir}")
        except OSError as e:
            print(f"Error creating output directory '{output_dir}': {e}")
            return

    # Extract components/schemas for resolving references
    schemas_dict = openapi_data.get('components', {}).get('schemas', {})
    # if not schemas_dict:
        # print("Warning: No 'components/schemas' section found. Request body schema resolution might fail.", file=sys.stderr)

    if 'paths' not in openapi_data or not isinstance(openapi_data['paths'], dict):
        print("Error: 'paths' section not found or is not a dictionary in the OpenAPI spec.")
        return

    grouped_distilled_data = defaultdict(list) # Group distilled data

    print(f"Processing {len(openapi_data['paths'])} paths and grouping...")
    path_count = 0
    for path_string, path_item in openapi_data['paths'].items():
        path_count += 1
        if path_count % 250 == 0: # Print progress less often
             print(f"  Processed {path_count} paths...")

        if not isinstance(path_item, dict):
            # print(f"Warning: Skipping invalid path item for '{path_string}'. Expected a dictionary.", file=sys.stderr)
            continue

        # --- Determine Group Name (same logic as before) ---
        stripped_path = path_string.strip('/')
        if not stripped_path:
            group_name = "root"
        else:
            group_name = stripped_path.split('/')[0]
            if '{' in group_name:
                parts = stripped_path.split('/')
                if len(parts) > 1 and not parts[0].startswith('{'):
                    group_name = parts[0]
                else:
                    group_name = "variable_root"
        # --- End Group Name Logic ---

        path_info = {
            'path': path_string,
            'path_description': path_item.get('description', 'No description provided.'),
            'path_parameters': path_item.get('parameters', []),
            'methods': []
        }

        # Iterate through possible HTTP methods
        for method_name, operation_object in path_item.items():
            method_name_upper = method_name.upper()
            if method_name_upper not in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE'] or not isinstance(operation_object, dict):
                continue

            method_details = {
                'method': method_name_upper,
                'summary': operation_object.get('summary', 'No summary.'),
                'description': operation_object.get('description', 'No description provided.'),
                'parameters': operation_object.get('parameters', []),
                'requestBody': None
            }

            # Process requestBody if it exists
            request_body_data = operation_object.get('requestBody')
            if isinstance(request_body_data, dict) and 'content' in request_body_data:
                json_content = request_body_data['content'].get('application/json')
                if isinstance(json_content, dict) and 'schema' in json_content:
                    schema_info = json_content['schema']
                    resolved_body_schema = None
                    if isinstance(schema_info, dict) and '$ref' in schema_info:
                         resolved_body_schema = resolve_schema_ref(schema_info['$ref'], schemas_dict)
                    elif isinstance(schema_info, dict): # Inline schema
                         try:
                            resolved_body_schema = json.loads(json.dumps(schema_info))
                         except TypeError:
                             resolved_body_schema = {"error": "Could not copy inline schema"}

                    method_details['requestBody'] = {
                        'description': request_body_data.get('description', 'No description.'),
                        'required': request_body_data.get('required', False),
                        'schema': resolved_body_schema if resolved_body_schema is not None else "Schema not found or could not be resolved."
                    }

            path_info['methods'].append(method_details)

        # Only add path_info if it contains at least one valid method
        if path_info['methods']:
            grouped_distilled_data[group_name].append(path_info) # Add to the correct group

    print(f"\nProcessing complete. Found {len(grouped_distilled_data)} groups.")

    # Write each group's distilled data to a separate YAML file
    print(f"Writing group files to directory: {output_dir}...")
    groups_written = 0
    for group_name, group_data in grouped_distilled_data.items():
        # Sanitize group name for filename (replace invalid chars)
        safe_group_name = "".join(c if c.isalnum() or c in ('_', '-') else '_' for c in group_name)
        output_filename = os.path.join(output_dir, f"group_{safe_group_name}.yaml")

        try:
            with open(output_filename, 'w', encoding='utf-8') as f_out:
                yaml.dump(
                    group_data,
                    f_out,
                    default_flow_style=False,
                    sort_keys=False,
                    allow_unicode=True,
                    width=1000
                )
            groups_written += 1
            if groups_written % 10 == 0:
                 print(f"  Written {groups_written} group files...")

        except Exception as e:
            print(f"An error occurred while writing the output file '{output_filename}': {e}", file=sys.stderr)

    print(f"\nFinished writing {groups_written} distilled group YAML files to {output_dir}.")

# --- Main execution ---
if __name__ == "__main__":
    process_and_split_openapi_spec(INPUT_FILE, OUTPUT_DIR)
    print("\nScript finished.")

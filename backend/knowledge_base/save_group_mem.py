import yaml
import os
import sys
import json
from typing import Dict, List, Set, Tuple # For type hinting
from dotenv import load_dotenv

# Add parent directory to Python path so we can import from ai module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
load_dotenv()

# Fix database path in mem0_local config before importing
# Create absolute path for the database
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
db_dir = os.path.join(project_root, "db")
os.makedirs(db_dir, exist_ok=True)  # Create db directory if it doesn't exist

# First initialize the memory module with absolute path config
from mem0 import Memory
import requests
from requests.exceptions import RequestException

# Initialize memory client manually for this script
m = None

# Now import the module and memory function
from ai.mem0_local import _add_memory_to_specific_group
import logging
from error_logger.error_logger import ErrorLogger

logger = logging.getLogger(__name__)

# Initialize error logger
error_logger = ErrorLogger()

# --- Configuration ---
# <<<--- Directory containing the 'group_*.yaml' files created earlier
GROUP_FILES_DIR = "output_api_groups" 
# <<<--- Name of the JSON file to store loading state
STATE_FILE = "mem0_loading_state.json"
# <<<--- Target Mem0 Group ID
MEM0_GROUP_ID = "graph_api"
# --- End Configuration ---






def load_state(state_filepath: str) -> Dict[str, Dict[str, List[str]] | List[str]]:
    """Loads the processing state from a JSON file."""
    default_state = {
        "fully_processed_groups": [],       # List of group names (e.g., "admin")
        "partially_processed_paths": {}     # Dict: {"group_name": ["path1", "path2"]}
    }
    if not os.path.exists(state_filepath):
        print(f"State file '{state_filepath}' not found. Starting with empty state.")
        return default_state
    try:
        with open(state_filepath, 'r', encoding='utf-8') as f:
            state = json.load(f)
            # Ensure essential keys exist, merge with default if loading partial/old state
            if "fully_processed_groups" not in state: state["fully_processed_groups"] = []
            if "partially_processed_paths" not in state: state["partially_processed_paths"] = {}
            print(f"Loaded state from '{state_filepath}'.")
            return state
    except json.JSONDecodeError:
        print(f"Error decoding JSON from '{state_filepath}'. Starting with empty state.", file=sys.stderr)
        return default_state
    except Exception as e:
        print(f"Error loading state file '{state_filepath}': {e}. Starting with empty state.", file=sys.stderr)
        return default_state

def save_state(state_filepath: str, state_data: dict):
    """Saves the processing state to a JSON file."""
    try:
        with open(state_filepath, 'w', encoding='utf-8') as f:
            json.dump(state_data, f, indent=2) # Use indent for readability
        # print(f"State saved to '{state_filepath}'.") # Optional: print on every save
    except Exception as e:
        print(f"Error saving state to '{state_filepath}': {e}", file=sys.stderr)

def format_path_info_for_memory(path_data: dict) -> str:
    """Formats the distilled path dictionary into a string for memory. (Same as before)"""
    if not isinstance(path_data, dict): return "Error: Invalid path data format."
    message_parts = []
    path_str = path_data.get('path', 'N/A')
    message_parts.append(f"PATH: {path_str}")
    message_parts.append(f"DESCRIPTION: {path_data.get('path_description', 'N/A')}")
    path_params = path_data.get('path_parameters'); filtered_path_params = [p for p in path_params if p] if path_params else []
    if filtered_path_params: message_parts.append("PATH PARAMETERS:\n" + yaml.dump(filtered_path_params, indent=2, default_flow_style=False, sort_keys=False, width=1000).strip())
    methods = path_data.get('methods', [])
    if methods:
        message_parts.append("METHODS:")
        for method_info in methods:
            if not isinstance(method_info, dict): continue
            method_str = f"  - METHOD: {method_info.get('method', 'N/A')}"
            method_str += f"\n    SUMMARY: {method_info.get('summary', 'N/A')}"
            method_str += f"\n    DESCRIPTION: {method_info.get('description', 'N/A')}"
            method_params = method_info.get('parameters'); filtered_method_params = [p for p in method_params if p] if method_params else []
            if filtered_method_params: method_str += "\n    PARAMETERS:\n" + yaml.dump(filtered_method_params, indent=4, default_flow_style=False, sort_keys=False, width=1000).strip()
            request_body = method_info.get('requestBody')
            if request_body and isinstance(request_body, dict):
                 method_str += "\n    REQUEST BODY:"
                 method_str += f"\n      Description: {request_body.get('description', 'N/A')}"
                 method_str += f"\n      Required: {request_body.get('required', False)}"
                 schema = request_body.get('schema')
                 if schema: method_str += "\n      SCHEMA:\n" + yaml.dump(schema, indent=6, default_flow_style=False, sort_keys=False, width=1000).strip()
                 else: method_str += "\n      SCHEMA: Not specified or resolved."
            message_parts.append(method_str)
    return "\n".join(message_parts)


def load_group_paths_to_memory_with_state(
    group_name: str,
    group_yaml_path: str,
    mem0_group_id: str,
    current_state: dict,
    state_filepath: str
) -> bool:
    """
    Loads individual paths from a group YAML into memory, using state file for tracking.
    Returns True if the group was fully processed successfully, False otherwise.
    """
    print(f"\n--- Processing Group: '{group_name}' ---")
    print(f"   Loading paths from '{group_yaml_path}' to Mem0 group '{mem0_group_id}'")

    if not os.path.exists(group_yaml_path):
        print(f"Error: Input group YAML file not found at '{group_yaml_path}'", file=sys.stderr)
        return False # Cannot process this group

    try:
        with open(group_yaml_path, 'r', encoding='utf-8') as f_in:
            paths_in_group = yaml.safe_load(f_in)
    except yaml.YAMLError as e:
        print(f"Error parsing YAML file '{group_yaml_path}': {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"An unexpected error occurred loading '{group_yaml_path}': {e}", file=sys.stderr)
        return False

    if not isinstance(paths_in_group, list):
        print(f"Error: Expected a list of paths in '{group_yaml_path}', but found {type(paths_in_group)}.", file=sys.stderr)
        return False

    total_paths = len(paths_in_group)
    print(f"   Found {total_paths} path definitions in the file.")
    
    # Get the set of paths already processed for this group from the state
    processed_paths_in_group: Set[str] = set(current_state["partially_processed_paths"].get(group_name, []))
    
    paths_newly_added_count = 0
    errors_count = 0
    paths_skipped_count = 0
    
    group_fully_processed = True # Assume success unless an error occurs

    for i, path_data in enumerate(paths_in_group):
        path_string = path_data.get('path')
        if not path_string:
            print(f"Warning: Skipping path entry {i+1}/{total_paths} due to missing 'path' key.", file=sys.stderr)
            errors_count += 1
            group_fully_processed = False # Cannot be sure group is complete
            continue

        # --- Resume Logic ---
        if path_string in processed_paths_in_group:
            paths_skipped_count += 1
            # print(f"   Skipping already processed path {i+1}/{total_paths}: {path_string}")
            continue
        # --- End Resume Logic ---
            
        print(f"   Processing path {i+1}/{total_paths}: {path_string}")

        memory_message = format_path_info_for_memory(path_data)
        if "Error:" in memory_message:
            print(f"     -> Error formatting path data: {memory_message}", file=sys.stderr)
            errors_count += 1
            group_fully_processed = False # Mark group as incomplete due to error
            continue # Skip this path

        # --- Call Memory Saving Function ---
        try:
            result_status, _ = _add_memory_to_specific_group(
                message=memory_message,
                group_id=mem0_group_id
            )

            # Check success and update state *only on success*
            if "Success" in result_status: # Adapt check if your function returns differently
                paths_newly_added_count += 1
                # Add successfully processed path to the state for this group
                if group_name not in current_state["partially_processed_paths"]:
                     current_state["partially_processed_paths"][group_name] = []
                current_state["partially_processed_paths"][group_name].append(path_string)
                # Save state frequently (after each successful add) for better recovery
                # save_state(state_filepath, current_state) # Option: save after each path
            else:
                 print(f"     -> Memory save failed for path '{path_string}'. Status: {result_status}", file=sys.stderr)
                 errors_count += 1
                 group_fully_processed = False # Mark group as incomplete

        except Exception as e:
            print(f"     -> CRITICAL ERROR calling _add_memory_to_specific_group for path '{path_string}': {e}", file=sys.stderr)
            errors_count += 1
            group_fully_processed = False # Mark group as incomplete
            # Decide whether to stop processing this group or continue with next path
            # For now, we continue to report all errors in the group.
            # break # Uncomment this to stop processing the group on the first critical error

    # --- Post-Group Processing ---
    print(f"\n   Group '{group_name}' Summary:")
    print(f"     Paths in file: {total_paths}")
    print(f"     Skipped (already processed): {paths_skipped_count}")
    print(f"     Newly Added to Memory: {paths_newly_added_count}")
    print(f"     Errors during processing/saving: {errors_count}")

    # Update overall state if group processed fully *without errors this run*
    if group_fully_processed and errors_count == 0:
        print(f"   Marking group '{group_name}' as fully processed.")
        if group_name not in current_state["fully_processed_groups"]:
             current_state["fully_processed_groups"].append(group_name)
        # Clean up partial state for this group if it existed
        if group_name in current_state["partially_processed_paths"]:
             del current_state["partially_processed_paths"][group_name]
        # Save state after successfully completing a group
        save_state(state_filepath, current_state)
        return True
    else:
        print(f"   Group '{group_name}' processing incomplete or encountered errors.")
        # Save state even if incomplete to record partially processed paths
        save_state(state_filepath, current_state)
        return False


def main():
    """Main function to handle CLI and processing loop."""
    print("--- Mem0 Path Loader with State Tracking ---")

    # 1. Load current state
    state = load_state(STATE_FILE)
    fully_processed_set = set(state["fully_processed_groups"])

    # 2. Discover available group files
    available_group_files = {} # Map group_name -> file_path
    if not os.path.isdir(GROUP_FILES_DIR):
        print(f"Error: Group files directory '{GROUP_FILES_DIR}' not found!", file=sys.stderr)
        return
    
    print(f"\nScanning for group files in '{GROUP_FILES_DIR}'...")
    for filename in os.listdir(GROUP_FILES_DIR):
        if filename.startswith("group_") and filename.endswith(".yaml"):
            # Extract group name: remove prefix and suffix
            group_name = filename[len("group_"): -len(".yaml")]
            if group_name: # Ensure name is not empty
                available_group_files[group_name] = os.path.join(GROUP_FILES_DIR, filename)
            else:
                 print(f"Warning: Could not extract group name from file '{filename}'", file=sys.stderr)

    if not available_group_files:
        print("No group YAML files found in the directory.")
        return
        
    print(f"Found {len(available_group_files)} potential group files.")

    # 3. Identify groups needing processing
    groups_to_process = []
    for group_name, filepath in available_group_files.items():
        if group_name not in fully_processed_set:
            groups_to_process.append({"name": group_name, "path": filepath})

    if not groups_to_process:
        print("\nAll available groups appear to be fully processed according to the state file.")
        return

    # 4. CLI Menu Loop
    while True:
        print("\n--- Groups Available for Processing ---")
        # Re-identify groups needing processing based on potentially updated state
        current_state = load_state(STATE_FILE) # Reload state in case it changed
        fully_processed_set = set(current_state["fully_processed_groups"])
        groups_to_display = []
        for group_name, filepath in available_group_files.items():
            if group_name not in fully_processed_set:
                status = "(Partially processed)" if group_name in current_state["partially_processed_paths"] else "(Not started)"
                groups_to_display.append({"name": group_name, "path": filepath, "status": status})
        
        if not groups_to_display:
             print("All available groups have now been fully processed.")
             break # Exit loop if nothing left to do

        groups_to_display.sort(key=lambda x: x['name']) # Sort for consistent display

        for i, group_info in enumerate(groups_to_display):
            print(f"  {i+1}: {group_info['name']} {group_info['status']}")

        print("Enter the number(s) of the group(s) to process (e.g., '1', '3,5'), or 'q' to quit:")
        
        user_input = input("> ").strip().lower()

        if user_input == 'q':
            print("Exiting.")
            break

        selected_indices = set()
        try:
            parts = user_input.split(',')
            for part in parts:
                index = int(part.strip()) - 1 # Convert to 0-based index
                if 0 <= index < len(groups_to_display):
                    selected_indices.add(index)
                else:
                    print(f"Warning: Invalid number '{index+1}'. Please choose from the list.", file=sys.stderr)
            
            if not selected_indices:
                 print("No valid selections made.")
                 continue # Ask again

        except ValueError:
            print("Invalid input. Please enter numbers separated by commas or 'q'.", file=sys.stderr)
            continue # Ask again

        # 5. Process Selected Groups
        print("\nSelected groups to process:")
        groups_to_run = [groups_to_display[idx] for idx in sorted(list(selected_indices))]
        for group in groups_to_run: print(f"- {group['name']}")
            
        confirm = input("Proceed? (y/n): ").strip().lower()
        if confirm != 'y':
             print("Processing cancelled.")
             continue # Go back to menu

        for group_info in groups_to_run:
            # Reload state right before processing a group for latest partial progress
            state_for_group = load_state(STATE_FILE)
            load_group_paths_to_memory_with_state(
                group_name=group_info['name'],
                group_yaml_path=group_info['path'],
                mem0_group_id=MEM0_GROUP_ID,
                current_state=state_for_group, # Pass the reloaded state
                state_filepath=STATE_FILE
            )
            # State is saved within the function after processing the group
            print("-" * 40) # Separator between groups

        print("\nFinished processing selected groups.")
        # Loop continues to show updated menu

# --- Run Main ---
if __name__ == "__main__":
    # Ensure the placeholder function is defined if running directly
    if '_add_memory_to_specific_group' not in globals():
        print("Error: _add_memory_to_specific_group function not defined.", file=sys.stderr)
        sys.exit(1)
    main()
    print("\nScript finished.")

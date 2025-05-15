import sys
import os

# Add the project root (backend/) to the Python path
# This ensures that top-level packages like 'ai', 'helpers', 'error_logger' can be found
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, PROJECT_ROOT)

import json
import os
from ai.assistant_functions.graph import (
    graph_api_request_no_ctx,
    upload_file_to_channel,
    upload_folder_to_channel
)

# --- Configuration ---
# All paths are relative to the scripts directory
SCRIPTS_DIR = os.path.dirname(__file__)
DEAL_USERS_FILE = os.path.join(SCRIPTS_DIR, 'deal_users.json')
LEGAL_USERS_FILE = os.path.join(SCRIPTS_DIR, 'legal_users.json')
DEFAULT_PRIVATE_CHANNEL_OWNER_EMAIL = "mm@novastonecapital.com" # Added default owner

# --- Helper Functions ---

def load_user_emails(file_path):
    """Loads user emails from a JSON file."""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: User list file not found at {file_path}")
        return []
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {file_path}")
        return []

def get_searcher_name_from_team_name(team_name_full):
    """
    Extracts the searcher's name from the full team name.
    Example: "NCA SF 099 - Filippo Ceffoli" -> "Filippo Ceffoli"
    """
    parts = team_name_full.split(" - ", 1) # Split only on the first occurrence
    if len(parts) > 1:
        return parts[-1].strip()
    print(f"Warning: Could not reliably extract searcher name from '{team_name_full}'. Using full name as fallback.")
    return team_name_full 

# --- MS Graph API Interaction Functions ---

def _find_team_by_prefix_graph(search_prefix: str):
    """
    Finds a Microsoft Team by a prefix of its display name using graph_api_request_no_ctx.
    Handles cases for no matches, one match, or multiple matches.
    Returns a dict {"id": team_id, "displayName": full_team_name} if one unique team is found, else None.
    """
    print(f"Graph API: Searching for Team with prefix '{search_prefix}'...")
    # Using startsWith for displayName filter
    query_params = {"$filter": f"startswith(displayName, '{search_prefix}')"}
    response = graph_api_request_no_ctx(
        endpoint_version="v1.0", 
        path="/teams", 
        method="GET", 
        query_params_json=json.dumps(query_params)
    )

    if isinstance(response, dict) and "value" in response:
        found_teams = response["value"]
        if len(found_teams) == 1:
            team_data = found_teams[0]
            print(f"Found unique Team: ID '{team_data['id']}', Name: '{team_data['displayName']}'")
            return {"id": team_data["id"], "displayName": team_data["displayName"]}
        elif len(found_teams) > 1:
            print(f"Error: Multiple teams found matching prefix '{search_prefix}':")
            for team in found_teams:
                print(f"  - ID: {team[id]}, Name: {team['displayName']}")
            print("Please use a more specific identifier or the full team name.")
            return None
        else:
            print(f"Error: No Team found with prefix '{search_prefix}'.")
            return None
    else:
        print(f"Graph API: Error occurred while searching for team with prefix '{search_prefix}'. Response: {response}")
        return None

def _get_team_id_graph(team_name):
    """
    Finds the ID of a Microsoft Team by its display name using graph_api_request_no_ctx.
    """
    print(f"Graph API: Searching for Team ID for '{team_name}'...")
    query_params = {"$filter": f"displayName eq '{team_name}'"}
    response = graph_api_request_no_ctx(endpoint_version="v1.0", path="/teams", method="GET", query_params_json=json.dumps(query_params))
    if isinstance(response, dict) and "value" in response and len(response["value"]) > 0:
         return response["value"][0]["id"]
    print(f"Graph API: Team '{team_name}' not found or error occurred.")
    return None

def _get_channel_in_team_graph(team_id, channel_name):
    """
    Retrieves a specific channel by name within a team using graph_api_request_no_ctx.
    Returns channel object (dict with 'id') if found, else None.
    """
    print(f"Graph API: Checking for Channel '{channel_name}' in Team ID '{team_id}'...")
    query_params = {"$filter": f"displayName eq '{channel_name}'"}
    response = graph_api_request_no_ctx(endpoint_version="v1.0", path=f"/teams/{team_id}/channels", method="GET", query_params_json=json.dumps(query_params))
    if isinstance(response, dict) and "value" in response and len(response["value"]) > 0:
         return {"id": response["value"][0]["id"], "displayName": response["value"][0]["displayName"]}
    print(f"Graph API: Channel '{channel_name}' not found in Team ID '{team_id}' or error occurred.")
    return None

def _create_channel_in_team_graph(team_id, channel_name, description="", membership_type="standard", initial_owner_email: str = None):
    """
    Creates a new channel in the specified team using graph_api_request_no_ctx.
    Can create 'standard' or 'private' channels.
    For private channels with app permissions, an initial_owner_email must be provided.
    Returns channel object (dict with 'id') upon successful creation.
    """
    print(f"Graph API: Creating Channel '{channel_name}' in Team ID '{team_id}' with description '{description}', Type: '{membership_type}'...")
    body = {
        "displayName": channel_name,
        "description": description,
        "membershipType": membership_type
    }
    if membership_type == "private":
        body["@odata.type"] = "#microsoft.graph.channel"
        if initial_owner_email:
            print(f"Assigning initial owner for private channel: {initial_owner_email}")
            body["members"] = [
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "roles": ["owner"],
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{initial_owner_email}')"
                }
            ]
        else:
            # This case should ideally be prevented by the calling function for app permissions
            print(f"Warning: Creating private channel '{channel_name}' without an initial owner specified. This will fail with Application permissions.")
            # The API will reject this if called with App Permissions as per error: "CreateChannel_Private: Cannot create private channel, no members specified..."

    response = graph_api_request_no_ctx(
        endpoint_version="v1.0", 
        path=f"/teams/{team_id}/channels", 
        method="POST", 
        body_json=json.dumps(body)
    )
    if isinstance(response, dict) and "id" in response and "displayName" in response:
         return {"id": response["id"], "displayName": response["displayName"], "membershipType": response.get("membershipType")}
    print(f"Graph API: Failed to create Channel '{channel_name}' in Team ID '{team_id}'. Response: {response}")
    return None

def _add_members_to_channel_graph(team_id, channel_id, user_emails):
    """
    Adds a list of users (by email/UPN) as members to a channel using graph_api_request_no_ctx.
    This function assumes the channel is a private channel (or requires explicit member add).
    For standard channels, adding to the team is usually sufficient.
    """
    if not user_emails:
        print(f"INFO: No users to add to Channel ID '{channel_id}'.")
        return True
    print(f"Graph API: Adding {len(user_emails)} members to Channel ID '{channel_id}' in Team ID '{team_id}': {', '.join(user_emails)}")
    success_count = 0
    for email in user_emails:
         member_body = {
             "@odata.type": "#microsoft.graph.aadUserConversationMember",
             "roles": ["member"],
             "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{email}')"
         }
         response = graph_api_request_no_ctx(endpoint_version="v1.0", path=f"/teams/{team_id}/channels/{channel_id}/members", method="POST", body_json=json.dumps(member_body))
         if isinstance(response, dict) and "id" in response:
             print(f"  Successfully added {email} (Member ID: {response['id']})")
             success_count += 1
         else:
             print(f"  Failed to add {email}. Response: {response}")
    return success_count == len(user_emails)

# --- Main Orchestration Logic ---

def setup_team_channels_for_searcher(
    team_name_full,
    legal_docs_source_folder_for_searcher,
    general_channel_items_source_folder,
    force_member_update: bool = False, # New flag
    force_file_upload: bool = False    # New flag
):
    """
    Main function to set up the required channels, members, and files/folders for a specific team.
    Uses graph_api_request_no_ctx for all Graph API interactions.
    By default, members and files/folders are only processed for newly created channels.
    Use force_member_update=True or force_file_upload=True to process for existing channels.
    """
    print(f"\nProcessing Team: {team_name_full}")

    searcher_name = get_searcher_name_from_team_name(team_name_full)
    if not searcher_name:
        print(f"Error: Could not extract searcher name from '{team_name_full}'. Aborting for this team.")
        return

    print(f"Identified Searcher: {searcher_name}")

    # Get Team ID using the new Graph API function
    team_id = _get_team_id_graph(team_name_full)
    if not team_id:
        print(f"Error: Team '{team_name_full}' not found or ID could not be retrieved. Aborting for this team.")
        return
    print(f"Found Team ID: {team_id}")

    # Define expected channels and their configurations
    channel_configurations = [
        {
            "name": "General", 
            "description": "General discussion channel for the team.",
            "members_json_path": None, # Members are inherited from the team for General channel
            "files_source_path": general_channel_items_source_folder,
            "upload_type": "folders",
            "membership_type": "standard" # General channel is always standard
        },
        {
            "name": "Deals", 
            "description": f"Private deals channel for {searcher_name}",
            "members_json_path": DEAL_USERS_FILE,
            "files_source_path": None, # No files specified for deals channel in example
            "upload_type": "files",
            "membership_type": "private" # Deals channel should be private
        },
        {
            "name": f"Legal Channel - {searcher_name}", 
            "description": f"Private legal channel for {searcher_name}",
            "members_json_path": LEGAL_USERS_FILE,
            "files_source_path": legal_docs_source_folder_for_searcher,
            "upload_type": "folders",
            "membership_type": "private" # Legal channel should be private
        }
    ]

    for config in channel_configurations:
        channel_name = config["name"]
        current_membership_type = config.get("membership_type", "standard")
        print(f"\n--- Managing Channel: {channel_name} (Type: {current_membership_type}) ---")

        channel_info = _get_channel_in_team_graph(team_id, channel_name)
        channel_id = None
        channel_created_this_run = False # Flag to track if channel was created in this run

        if channel_info and channel_info.get("id"):
            channel_id = channel_info["id"]
            print(f"Channel '{channel_name}' already exists with ID: {channel_id}.")
        else:
            print(f"Channel '{channel_name}' does not exist. Attempting to create as '{current_membership_type}'...")
            initial_owner_for_private_channel = None
            if current_membership_type == "private":
                initial_owner_for_private_channel = DEFAULT_PRIVATE_CHANNEL_OWNER_EMAIL
                print(f"Using default owner '{initial_owner_for_private_channel}' for new private channel '{channel_name}'.")

            created_channel_info = _create_channel_in_team_graph(
                team_id, channel_name, config["description"],
                current_membership_type, initial_owner_email=initial_owner_for_private_channel
            )
            if not created_channel_info or not created_channel_info.get("id"):
                print(f"Error: Failed to create or identify Channel '{channel_name}'. Skipping further setup for this channel.")
                continue
            
            channel_id = created_channel_info["id"]
            print(f"Successfully created Channel '{channel_name}' with ID: {channel_id}.")
            channel_created_this_run = True # Set flag as channel was created now

        if channel_id: # Proceed if channel exists or was successfully created
            # --- Member Addition Logic ---
            if channel_created_this_run or force_member_update:
                if config["members_json_path"] and current_membership_type == "private":
                    user_emails = load_user_emails(config["members_json_path"])
                    if user_emails:
                        print(f"Processing members for private Channel '{channel_name}' (Force update: {force_member_update})...")
                        _add_members_to_channel_graph(team_id, channel_id, user_emails)
                    else:
                        print(f"No members found or failed to load from {config['members_json_path']} for Channel '{channel_name}'.")
                elif config["members_json_path"] and current_membership_type == "standard": # Only print if we would have acted
                    print(f"Info: Channel '{channel_name}' is standard. Members inherited. Direct member add from config skipped.")
            elif not channel_created_this_run: # If channel existed and force_member_update is False
                print(f"Skipping member update for existing channel '{channel_name}' (force_member_update is False). Members only added on creation by default.")

            # --- File/Folder Upload Logic ---
            if channel_created_this_run or force_file_upload:
                if config["files_source_path"]:
                    if config["upload_type"] == "files":
                        print(f"Uploading files from '{config['files_source_path']}' to Channel '{channel_name}' (Force update: {force_file_upload})...")
                    elif config["upload_type"] == "folders":
                        print(f"Uploading folder(s) from '{config['files_source_path']}' to Channel '{channel_name}' (Force update: {force_file_upload})...")
                    # The actual call to upload_file_to_channel or upload_folder_to_channel happens inside the original blocks
                    # This edit is primarily for the conditional logic and print statements
                    # --- Duplicated original file/folder upload logic below, wrapped in the new condition ---
                    if config["upload_type"] == "files":
                        success_count = 0
                        total_files = 0
                        for file_name_iter in os.listdir(config["files_source_path"]):
                            file_path_iter = os.path.join(config["files_source_path"], file_name_iter)
                            if os.path.isfile(file_path_iter):
                                total_files += 1
                                print(f"  Uploading file: {file_name_iter}")
                                result = upload_file_to_channel(
                                    endpoint_version="v1.0", team_id=team_id, channel_id=channel_id,
                                    file_path=file_path_iter, file_name=file_name_iter
                                )
                                if "error" not in result: success_count += 1; print(f"    Successfully uploaded {file_name_iter}")
                                else: print(f"    Failed to upload {file_name_iter}: {result.get('error')}")
                        print(f"  Uploaded {success_count} out of {total_files} files to '{channel_name}'.")
                    elif config["upload_type"] == "folders":
                        result = upload_folder_to_channel(
                            endpoint_version="v1.0", 
                            team_id=team_id, 
                            channel_id=channel_id,
                            local_dir_to_upload=config["files_source_path"]
                        )
                        if "error" in result:
                            print(f"  Failed to upload base folder from '{config['files_source_path']}': {result.get('error')}")
                        else:
                            success_count = len(result.get("success", [])); error_count = len(result.get("errors", []))
                            print(f"  From '{config['files_source_path']}', uploaded {success_count} files successfully to '{channel_name}'.")
                            if error_count > 0:
                                print(f"  Failed to upload {error_count} files from within '{config['files_source_path']}':")
                                for error_detail in result.get("errors", []):
                                    print(f"    - File: {error_detail.get('file')}, Error: {error_detail.get('error')}")
                elif (channel_created_this_run or force_file_upload): # If no path, but we would have acted
                    print(f"No files/folders source path specified for Channel '{channel_name}'. Skipping content upload.")
            elif not channel_created_this_run: # If channel existed and force_file_upload is False
                print(f"Skipping file/folder upload for existing channel '{channel_name}' (force_file_upload is False). Content only uploaded on creation by default.")
        else:
            print(f"Skipping member and file operations for '{channel_name}' as channel_id was not obtained.")
        
        print(f"--- Finished managing Channel: {channel_name} ---")


# --- Example Usage ---
if __name__ == "__main__":
    print("Starting Microsoft Teams Channel Management Script...")
    print("IMPORTANT: This script uses the Graph API for file uploads.\n")

    # --- USER CONFIGURATION REQUIRED ---
    TEAM_NUMBER_TO_FIND = "100"  # Example: User provides just the number
    TEAM_NAME_PREFIX_TO_SEARCH = f"NCA SF {TEAM_NUMBER_TO_FIND}"

    print(f"Attempting to find Team based on number: {TEAM_NUMBER_TO_FIND} (Searching for prefix: '{TEAM_NAME_PREFIX_TO_SEARCH}')")
    found_team_info = _find_team_by_prefix_graph(TEAM_NAME_PREFIX_TO_SEARCH)

    if not found_team_info:
        print("Aborting script as required team could not be uniquely identified.")
        exit(1)

    TEAM_TO_CONFIGURE_FULL_NAME = found_team_info["displayName"]
    # TEAM_ID_FROM_PREFIX_SEARCH = found_team_info["id"] # We have the ID, could optimize setup_team_channels_for_searcher later

    # Paths relative to scripts directory with correct folder names
    PATH_TO_LEGAL_DOCS_FILES = os.path.join(SCRIPTS_DIR, "Private channel - Legal channel")
    PATH_TO_GENERAL_CHANNEL_FOLDERS = os.path.join(SCRIPTS_DIR, "General channel - folders")

    # Check for required files
    missing_files = []
    if not os.path.exists(DEAL_USERS_FILE):
        missing_files.append(DEAL_USERS_FILE)
    if not os.path.exists(LEGAL_USERS_FILE):
        missing_files.append(LEGAL_USERS_FILE)
    
    if missing_files:
        print("FATAL ERROR: Required files are missing:")
        for file in missing_files:
            print(f"  - {os.path.abspath(file)}")
        print("\nPlease ensure all required files exist before running the script.")
        exit(1)

    # Check for required directories
    missing_dirs = []
    if not os.path.exists(PATH_TO_LEGAL_DOCS_FILES):
        missing_dirs.append(PATH_TO_LEGAL_DOCS_FILES)
    if not os.path.exists(PATH_TO_GENERAL_CHANNEL_FOLDERS):
        missing_dirs.append(PATH_TO_GENERAL_CHANNEL_FOLDERS)
    
    if missing_dirs:
        print("FATAL ERROR: Required directories are missing:")
        for dir in missing_dirs:
            print(f"  - {os.path.abspath(dir)}")
        print("\nPlease ensure all required directories exist before running the script.")
        exit(1)

    # Run the setup
    FORCE_MEMBER_UPDATE_FLAG = False # Set to True to force member updates on existing channels
    FORCE_FILE_UPLOAD_FLAG = True   # Set to True to force file/folder uploads on existing channels

    setup_team_channels_for_searcher(
        team_name_full=TEAM_TO_CONFIGURE_FULL_NAME,
        legal_docs_source_folder_for_searcher=PATH_TO_LEGAL_DOCS_FILES,
        general_channel_items_source_folder=PATH_TO_GENERAL_CHANNEL_FOLDERS,
        force_member_update=FORCE_MEMBER_UPDATE_FLAG, # Pass the flag
        force_file_upload=FORCE_FILE_UPLOAD_FLAG    # Pass the flag
    )

    print("\nScript execution finished.") 
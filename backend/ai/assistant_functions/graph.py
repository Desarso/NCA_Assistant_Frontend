from typing import Dict, Union, Optional, Any, List
from pydantic_ai import RunContext
from helpers.RequestHelper import make_request
from error_logger.error_logger import ErrorLogger
import logging
import json
import urllib.parse
import traceback
import os

# Initialize error logger
error_logger = ErrorLogger()

def graph_api_request(
    ctx: RunContext,
    endpoint_version: str,
    path: str,
    method: str,
    # LLM provides body and query params as JSON strings
    body_json: Optional[str] = None,
    query_params_json: Optional[str] = None,
    headers_json: Optional[str] = None
) -> Union[Dict[str, Any], List[Any]]:
    print(ctx)
    """
    Acts as a tool interface for the LLM to interact with Microsoft Graph API,
    delegating the actual request execution, header management, and auth handling
    to the make_request helper. The LLM MUST provide body, query params, and headers
    as VALID JSON formatted strings where applicable.

    Args:
        endpoint_version (str): 'v1.0' or 'beta'.
        path (str): The API endpoint path (e.g., '/users', '/groups/ID/members'). MUST start with '/'.
        method (str): HTTP method ('GET', 'POST', 'PUT', 'PATCH', 'DELETE').
        body_json (Optional[str]): A **valid JSON string** for the request body (for POST, PUT, PATCH).
                                   Keys/strings MUST use double quotes. Example: '{"displayName": "New Group"}'.
        query_params_json (Optional[str]): A **valid JSON string** for query parameters.
                                          Keys/strings MUST use double quotes. Example: '{"$select": "id,displayName"}'.
        headers_json (Optional[str]): A **valid JSON string** for additional HTTP headers.
                                     Keys/strings MUST use double quotes. Example: '{"Prefer": "outlook.timezone=\"Eastern Standard Time\""}'. 
                                     Note: Authentication headers are automatically handled.

    Returns:
        Union[Dict[str, Any], List[Any]]:
            - On successful API call (2xx status, excluding 204): The parsed JSON response body (usually a Dict or List).
            - On successful API call with 204 No Content: An empty dictionary `{}`.
            - On any failure: A dictionary containing error details and a user-friendly message.
            
    Error Handling Notes:
        - If you receive a permission error (typically status 403 Forbidden or 401 Unauthorized), 
          you should search the web to find which specific Microsoft Graph API permission 
          is required for the endpoint you're trying to access, then inform the user which 
          permission needs to be added to the application. These errors usually indicate 
          the app registration in Azure AD needs additional API permission scopes.
    """
    print("WE ARE HERE CALLING GRAPH API REQUEST")
    if not path.startswith('/'):
        path = '/' + path # Ensure path starts with a slash

    parsed_body: Optional[Any] = None
    parsed_query_params: Optional[Dict[str, str]] = None
    parsed_headers: Optional[Dict[str, str]] = None

    # 1. Parse LLM inputs (JSON strings to Python objects)
    try:
        if body_json:
            try:
                parsed_body = json.loads(body_json)
            except json.JSONDecodeError as e:
                error_params = {
                    "endpoint_version": endpoint_version,
                    "path": path,
                    "method": method,
                    "body_json": body_json,
                    "query_params_json": query_params_json,
                    "headers_json": headers_json
                }
                return error_logger.log_error(
                    function_name="graph_api_request",
                    error_text=f"Invalid JSON format in body_json: {str(e)}",
                    parameters=error_params,
                    stack_trace=traceback.format_exc()
                )
    except Exception as e:
        error_params = {
            "endpoint_version": endpoint_version,
            "path": path,
            "method": method,
            "body_json": body_json,
            "query_params_json": query_params_json,
            "headers_json": headers_json
        }
        return error_logger.log_error(
            function_name="graph_api_request",
            error_text=f"Error parsing body_json: {str(e)}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

    try:
        if query_params_json:
            try:
                parsed_query_params = json.loads(query_params_json)
                if not isinstance(parsed_query_params, dict):
                    error_params = {
                        "endpoint_version": endpoint_version,
                        "path": path,
                        "method": method,
                        "body_json": body_json,
                        "query_params_json": query_params_json,
                        "headers_json": headers_json
                    }
                    return error_logger.log_error(
                        function_name="graph_api_request",
                        error_text="query_params_json must decode to a JSON object (dictionary)",
                        parameters=error_params,
                        stack_trace=traceback.format_exc()
                    )
            except json.JSONDecodeError as e:
                error_params = {
                    "endpoint_version": endpoint_version,
                    "path": path,
                    "method": method,
                    "body_json": body_json,
                    "query_params_json": query_params_json,
                    "headers_json": headers_json
                }
                return error_logger.log_error(
                    function_name="graph_api_request",
                    error_text=f"Invalid JSON format in query_params_json: {str(e)}",
                    parameters=error_params,
                    stack_trace=traceback.format_exc()
                )
    except Exception as e:
        error_params = {
            "endpoint_version": endpoint_version,
            "path": path,
            "method": method,
            "body_json": body_json,
            "query_params_json": query_params_json,
            "headers_json": headers_json
        }
        return error_logger.log_error(
            function_name="graph_api_request",
            error_text=f"Error parsing query_params_json: {str(e)}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        
    # Parse headers if provided
    try:
        if headers_json:
            try:
                parsed_headers = json.loads(headers_json)
                if not isinstance(parsed_headers, dict):
                    error_params = {
                        "endpoint_version": endpoint_version,
                        "path": path,
                        "method": method,
                        "body_json": body_json,
                        "query_params_json": query_params_json,
                        "headers_json": headers_json
                    }
                    return error_logger.log_error(
                        function_name="graph_api_request",
                        error_text="headers_json must decode to a JSON object (dictionary)",
                        parameters=error_params,
                        stack_trace=traceback.format_exc()
                    )
            except json.JSONDecodeError as e:
                error_params = {
                    "endpoint_version": endpoint_version,
                    "path": path,
                    "method": method,
                    "body_json": body_json,
                    "query_params_json": query_params_json,
                    "headers_json": headers_json
                }
                return error_logger.log_error(
                    function_name="graph_api_request",
                    error_text=f"Invalid JSON format in headers_json: {str(e)}",
                    parameters=error_params,
                    stack_trace=traceback.format_exc()
                )
    except Exception as e:
        error_params = {
            "endpoint_version": endpoint_version,
            "path": path,
            "method": method,
            "body_json": body_json,
            "query_params_json": query_params_json,
            "headers_json": headers_json
        }
        return error_logger.log_error(
            function_name="graph_api_request",
            error_text=f"Error parsing headers_json: {str(e)}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

    # 2. Construct the full URL
    base_url = f'https://graph.microsoft.com/{endpoint_version}'
    full_url = f"{base_url}{path}"

    # 3. Add query parameters to the URL if they exist
    if parsed_query_params:
        # Filter out None values, urlencode handles basic types like str, int, float, bool
        filtered_params = {k: v for k, v in parsed_query_params.items() if v is not None}
        if filtered_params:
             query_string = urllib.parse.urlencode(filtered_params)
             full_url += f"?{query_string}"

    # 4. Call the make_request helper
    logging.debug(f"graph_api_request: Calling make_request for {method} {full_url}")
    try:
        response_data, error_data = make_request(
            method=method.upper(),
            url=full_url,
            headers=parsed_headers,  # Now passing optional headers
            json_data=parsed_body
        )

        # 5. Return the result from make_request
        if error_data:
            # Log the error but also preserve all the original error information
            logging.error(f"graph_api_request: make_request failed: {error_data.get('error')}")
            
            # Enhance the error_data with graph API context
            error_data["graph_context"] = {
                "endpoint_version": endpoint_version,
                "path": path,
                "method": method,
                "body_json": body_json,
                "query_params_json": query_params_json,
                "headers_json": headers_json,
                "full_url": full_url
            }
            
            # Add function name for context
            error_data["source_function"] = "graph_api_request"
            
            # Return the complete error response with the original error body and response text
            return error_data
        else:
            logging.debug(f"graph_api_request: make_request successful for {method} {path}.")
            return response_data if response_data is not None else {}
    except Exception as e:
        error_params = {
            "endpoint_version": endpoint_version,
            "path": path,
            "method": method,
            "body_json": body_json,
            "query_params_json": query_params_json,
            "headers_json": headers_json,
            "full_url": full_url
        }
        return error_logger.log_error(
            function_name="graph_api_request",
            error_text=f"Unexpected error in make_request: {str(e)}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

def graph_api_request_no_ctx(
    endpoint_version: str,
    path: str,
    method: str,
    # LLM provides body and query params as JSON strings
    body_json: Optional[str] = None,
    query_params_json: Optional[str] = None,
    headers_json: Optional[str] = None
) -> Union[Dict[str, Any], List[Any]]:
    """
    Acts as a tool interface for the LLM to interact with Microsoft Graph API,
    delegating the actual request execution, header management, and auth handling
    to the make_request helper. The LLM MUST provide body, query parameters, and headers
    as VALID JSON formatted strings where applicable.

    Args:
        endpoint_version (str): 'v1.0' or 'beta'.
        path (str): The API endpoint path (e.g., '/users', '/groups/ID/members'). MUST start with '/'.
        method (str): HTTP method ('GET', 'POST', 'PUT', 'PATCH', 'DELETE').
        body_json (Optional[str]): A **valid JSON string** for the request body (for POST, PUT, PATCH).
                                   Keys/strings MUST use double quotes. Example: '{"displayName": "New Group"}'.
        query_params_json (Optional[str]): A **valid JSON string** for query parameters.
                                          Keys/strings MUST use double quotes. Example: '{"$select": "id,displayName"}'.
        headers_json (Optional[str]): A **valid JSON string** for additional HTTP headers.
                                     Keys/strings MUST use double quotes. Example: '{"Prefer": "outlook.timezone=\"Eastern Standard Time\""}'. 
                                     Note: Authentication headers are automatically handled.

    Returns:
        Union[Dict[str, Any], List[Any]]:
            - On successful API call (2xx status, excluding 204): The parsed JSON response body (usually a Dict or List).
            - On successful API call with 204 No Content: An empty dictionary `{}`.
            - On any failure: A dictionary containing error details and a user-friendly message.
            
    Error Handling Notes:
        - If you receive a permission error (typically status 403 Forbidden or 401 Unauthorized), 
          you should search the web to find which specific Microsoft Graph API permission 
          is required for the endpoint you're trying to access, then inform the user which 
          permission needs to be added to the application. These errors usually indicate 
          the app registration in Azure AD needs additional API permission scopes.
    """
    if not path.startswith('/'):
        path = '/' + path # Ensure path starts with a slash

    parsed_body: Optional[Any] = None
    parsed_query_params: Optional[Dict[str, str]] = None
    parsed_headers: Optional[Dict[str, str]] = None

    # 1. Parse LLM inputs (JSON strings to Python objects)
    try:
        if body_json:
            parsed_body = json.loads(body_json)
    except json.JSONDecodeError as e:
        error_params = {
            "endpoint_version": endpoint_version,
            "path": path,
            "method": method,
            "body_json": body_json,
            "query_params_json": query_params_json,
            "headers_json": headers_json
        }
        return error_logger.log_error(
            function_name="graph_api_request_no_ctx",
            error_text=f"Invalid JSON format in body_json: {str(e)}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

    try:
        if query_params_json:
            parsed_query_params = json.loads(query_params_json)
            if not isinstance(parsed_query_params, dict):
                error_params = {
                    "endpoint_version": endpoint_version,
                    "path": path,
                    "method": method,
                    "body_json": body_json,
                    "query_params_json": query_params_json,
                    "headers_json": headers_json
                }
                return error_logger.log_error(
                    function_name="graph_api_request_no_ctx",
                    error_text="query_params_json must decode to a JSON object (dictionary)",
                    parameters=error_params,
                    stack_trace=traceback.format_exc()
                )
    except json.JSONDecodeError as e:
        error_params = {
            "endpoint_version": endpoint_version,
            "path": path,
            "method": method,
            "body_json": body_json,
            "query_params_json": query_params_json,
            "headers_json": headers_json
        }
        return error_logger.log_error(
            function_name="graph_api_request_no_ctx",
            error_text=f"Invalid JSON format in query_params_json: {str(e)}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        
    # Parse headers if provided
    try:
        if headers_json:
            parsed_headers = json.loads(headers_json)
            if not isinstance(parsed_headers, dict):
                error_params = {
                    "endpoint_version": endpoint_version,
                    "path": path,
                    "method": method,
                    "body_json": body_json,
                    "query_params_json": query_params_json,
                    "headers_json": headers_json
                }
                return error_logger.log_error(
                    function_name="graph_api_request_no_ctx",
                    error_text="headers_json must decode to a JSON object (dictionary)",
                    parameters=error_params,
                    stack_trace=traceback.format_exc()
                )
    except json.JSONDecodeError as e:
        error_params = {
            "endpoint_version": endpoint_version,
            "path": path,
            "method": method,
            "body_json": body_json,
            "query_params_json": query_params_json,
            "headers_json": headers_json
        }
        return error_logger.log_error(
            function_name="graph_api_request_no_ctx",
            error_text=f"Invalid JSON format in headers_json: {str(e)}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

    # 2. Construct the full URL
    base_url = f'https://graph.microsoft.com/{endpoint_version}'
    full_url = f"{base_url}{path}"

    # 3. Add query parameters to the URL if they exist
    if parsed_query_params:
        # Filter out None values, urlencode handles basic types like str, int, float, bool
        filtered_params = {k: v for k, v in parsed_query_params.items() if v is not None}
        if filtered_params:
             query_string = urllib.parse.urlencode(filtered_params)
             full_url += f"?{query_string}"

    # 4. Call the make_request helper
    logging.debug(f"graph_api_request: Calling make_request for {method} {full_url}")
    try:
        response_data, error_data = make_request(
            method=method.upper(),
            url=full_url,
            headers=parsed_headers,  # Now passing optional headers
            json_data=parsed_body
        )

        # 5. Return the result from make_request
        if error_data:
            # Log the error but also preserve all the original error information
            logging.error(f"graph_api_request_no_ctx: make_request failed: {error_data.get('error')}")
            
            # Enhance the error_data with graph API context
            error_data["graph_context"] = {
                "endpoint_version": endpoint_version,
                "path": path,
                "method": method,
                "body_json": body_json,
                "query_params_json": query_params_json,
                "headers_json": headers_json,
                "full_url": full_url
            }
            
            # Add function name for context
            error_data["source_function"] = "graph_api_request_no_ctx"
            
            # Return the complete error response with the original error body and response text
            return error_data
        else:
            logging.debug(f"graph_api_request: make_request successful for {method} {path}.")
            return response_data if response_data is not None else {}
    except Exception as e:
        error_params = {
            "endpoint_version": endpoint_version,
            "path": path,
            "method": method,
            "body_json": body_json,
            "query_params_json": query_params_json,
            "headers_json": headers_json,
            "full_url": full_url
        }
        return error_logger.log_error(
            function_name="graph_api_request_no_ctx",
            error_text=f"Unexpected error in make_request: {str(e)}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

def upload_file_to_channel(
    endpoint_version: str,
    team_id: str,
    channel_id: str,
    file_path: str,
    file_name: Optional[str] = None,
    parent_folder_path: Optional[str] = None
) -> Union[Dict[str, Any], List[Any]]:
    """
    Uploads a file to a Teams channel's files folder. Can upload to root or a specific folder.
    
    Args:
        endpoint_version (str): 'v1.0' or 'beta'
        team_id (str): The ID of the team
        channel_id (str): The ID of the channel
        file_path (str): Local path to the file to upload
        file_name (Optional[str]): Name to give the file in Teams. If None, uses the original filename
        parent_folder_path (Optional[str]): Path to the folder in Teams where the file should be uploaded.
                                          If None, uploads to channel root. Use forward slashes.
                                          Example: "Folder1/Subfolder1"
    
    Returns:
        Union[Dict[str, Any], List[Any]]: The response from the upload operation or error details
    """
    try:
        # 1. First get the drive ID and root folder ID for the channel
        drive_info_path = f"/teams/{team_id}/channels/{channel_id}/filesFolder"
        drive_info = graph_api_request_no_ctx(
            endpoint_version=endpoint_version,
            path=drive_info_path,
            method="GET"
        )
        
        if "error" in drive_info:
            return drive_info
            
        drive_id = drive_info.get("parentReference", {}).get("driveId")
        root_folder_id = drive_info.get("id")
        
        if not drive_id or not root_folder_id:
            return {
                "error": "Could not get drive information",
                "details": "Failed to extract drive ID or root folder ID from channel files folder"
            }
            
        # 2. If parent folder path is specified, create/get the folder path
        current_folder_id = root_folder_id
        if parent_folder_path:
            folder_parts = parent_folder_path.strip("/").split("/")
            for folder_name in folder_parts:
                # Check if folder exists
                folder_path = f"/drives/{drive_id}/items/{current_folder_id}/children"
                folder_query = json.dumps({
                    "$filter": f"name eq '{folder_name}' and folder ne null"
                })
                
                folder_info = graph_api_request_no_ctx(
                    endpoint_version=endpoint_version,
                    path=folder_path,
                    method="GET",
                    query_params_json=folder_query
                )
                
                if "error" in folder_info:
                    return folder_info
                    
                if folder_info.get("value") and len(folder_info["value"]) > 0:
                    # Folder exists, use its ID
                    current_folder_id = folder_info["value"][0]["id"]
                else:
                    # Create the folder
                    create_folder_body = json.dumps({
                        "name": folder_name,
                        "folder": {},
                        "@microsoft.graph.conflictBehavior": "rename"
                    })
                    
                    new_folder = graph_api_request_no_ctx(
                        endpoint_version=endpoint_version,
                        path=folder_path,
                        method="POST",
                        body_json=create_folder_body
                    )
                    
                    if "error" in new_folder:
                        return new_folder
                        
                    current_folder_id = new_folder["id"]
        
        # 3. Upload the file
        if not file_name:
            file_name = os.path.basename(file_path)
            
        upload_path = f"/drives/{drive_id}/items/{current_folder_id}:/{file_name}:/content"
        
        # Read file in binary mode
        with open(file_path, 'rb') as file_content:
            file_data = file_content.read()
            
        # Upload using PUT request with binary content
        headers = {
            "Content-Type": "application/octet-stream"
        }
        
        upload_result = graph_api_request_no_ctx(
            endpoint_version=endpoint_version,
            path=upload_path,
            method="PUT",
            headers_json=json.dumps(headers),
            body_json=file_data  # Note: body_json will be treated as binary data in this case
        )
        
        return upload_result
        
    except Exception as e:
        error_params = {
            "team_id": team_id,
            "channel_id": channel_id,
            "file_path": file_path,
            "file_name": file_name,
            "parent_folder_path": parent_folder_path
        }
        return error_logger.log_error(
            function_name="upload_file_to_channel",
            error_text=f"Error uploading file: {str(e)}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

def upload_folder_to_channel(
    endpoint_version: str,
    team_id: str,
    channel_id: str,
    local_dir_to_upload: str, # Renamed for clarity from 'folder_path' to distinguish from Teams paths
    teams_target_base_path: Optional[str] = None # Renamed for clarity from 'parent_folder_path'
) -> Union[Dict[str, Any], List[Any]]:
    """
    Uploads a local folder and its entire contents (files and subfolders) to a Teams channel's files folder.
    It preserves the folder structure.

    Args:
        endpoint_version (str): 'v1.0' or 'beta'.
        team_id (str): The ID of the team.
        channel_id (str): The ID of the channel.
        local_dir_to_upload (str): Local path to the folder whose contents are to be uploaded.
        teams_target_base_path (Optional[str]): Optional path string within the Teams channel's files folder
                                               where the 'local_dir_to_upload' (by its basename) should be placed.
                                               If None, it's placed at the root of the channel's files.
                                               Example: "Shared Documents/Reports". The 'local_dir_to_upload'
                                               will then be created inside "Reports".
                                               Use forward slashes for path separators.

    Returns:
        Dict[str, List[Any]]: A dictionary with "success" and "errors" lists, detailing outcomes.
    """
    if not os.path.isdir(local_dir_to_upload):
        return {
            "error": "Invalid local_dir_to_upload",
            "details": f"The path '{local_dir_to_upload}' is not a valid directory.",
            "success": [],
            "errors": [{"file": local_dir_to_upload, "error": "Path is not a directory"}]
        }

    local_dir_actual_name = os.path.basename(local_dir_to_upload) # e.g., "General channel - folders"
    results = {"success": [], "errors": []}

    logging.info(f"Starting upload of local folder '{local_dir_to_upload}' to Teams channel {channel_id}.")

    for root, _dirs, files in os.walk(local_dir_to_upload):
        # Determine the path of the current 'root' relative to the 'local_dir_to_upload'
        # This gives the subfolder structure within the local directory.
        relative_path_in_local_dir = os.path.relpath(root, local_dir_to_upload)
        if relative_path_in_local_dir == ".":
            relative_path_in_local_dir = "" # Represents the top level of local_dir_to_upload

        # Construct the target folder path in Teams for the files in the current 'root'.
        # This path starts with the name of the local directory being uploaded.
        current_teams_path = local_dir_actual_name 
        if relative_path_in_local_dir:
            # Append the relative sub-path, ensuring forward slashes for Teams.
            current_teams_path = os.path.join(current_teams_path, relative_path_in_local_dir).replace(os.sep, "/")
        
        # If a base path in Teams was specified, prepend it.
        if teams_target_base_path:
            current_teams_path = os.path.join(teams_target_base_path.strip("/"), current_teams_path).replace(os.sep, "/")
            
        logging.debug(f"Processing local path: '{root}'. Target Teams folder path for contents: '{current_teams_path}'")

        for file_name in files:
            local_file_full_path = os.path.join(root, file_name)
            
            # `upload_file_to_channel` will handle creation of `current_teams_path` if it doesn't exist.
            logging.info(f"Uploading file '{local_file_full_path}' to Teams path '{current_teams_path}/{file_name}'")
            upload_result = upload_file_to_channel(
                endpoint_version=endpoint_version,
                team_id=team_id,
                channel_id=channel_id,
                file_path=local_file_full_path,      # This is an actual file path
                file_name=file_name,                 # Name of the file in Teams
                parent_folder_path=current_teams_path # Teams path string, e.g., "BaseFolder/SubDir1"
            )

            if "error" in upload_result:
                error_message = upload_result.get("error", "Unknown error during file upload.")
                if isinstance(error_message, dict) and "message" in error_message: # If error is a dict from graph_api_request
                    error_message = error_message.get("message")

                logging.error(f"Failed to upload '{local_file_full_path}': {error_message}")
                results["errors"].append({"file": local_file_full_path, "error": error_message})
                error_logger.log_error(
                    function_name="upload_folder_to_channel (iterating files)",
                    error_text=f"Failed to upload file '{local_file_full_path}' during folder upload.",
                    parameters={
                        "local_file_path": local_file_full_path, 
                        "teams_target_path": f"{current_teams_path}/{file_name}",
                        "upload_result": upload_result
                    }
                )
            else:
                logging.info(f"Successfully uploaded '{local_file_full_path}' to Teams.")
                results["success"].append(local_file_full_path)
                
    logging.info(f"Finished upload of local folder '{local_dir_to_upload}'. Success: {len(results['success'])}, Errors: {len(results['errors'])}.")
    if results["errors"]:
        logging.warning(f"Some files failed to upload from '{local_dir_to_upload}'. Check logs for details.")
    return results

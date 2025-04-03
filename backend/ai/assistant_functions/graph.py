from typing import Dict, Union, Optional, Any, List
from pydantic_ai import RunContext
from helpers.RequestHelper import make_request
from error_logger.error_logger import ErrorLogger
import logging
import json
import urllib.parse
import traceback

# Initialize error logger
error_logger = ErrorLogger()

def graph_api_request(
    ctx: RunContext,
    endpoint_version: str,
    path: str,
    method: str,
    # LLM provides body and query params as JSON strings
    body_json: Optional[str] = None,
    query_params_json: Optional[str] = None
) -> Union[Dict[str, Any], List[Any]]:
    """
    Acts as a tool interface for the LLM to interact with Microsoft Graph API,
    delegating the actual request execution, header management, and auth handling
    to the make_request helper. The LLM MUST provide body and query params as JSON strings
    as VALID JSON formatted strings where applicable.

    Args:
        endpoint_version (str): 'v1.0' or 'beta'.
        path (str): The API endpoint path (e.g., '/users', '/groups/ID/members'). MUST start with '/'.
        method (str): HTTP method ('GET', 'POST', 'PUT', 'PATCH', 'DELETE').
        body_json (Optional[str]): A **valid JSON string** for the request body (for POST, PUT, PATCH).
                                   Keys/strings MUST use double quotes. Example: '{"displayName": "New Group"}'.
        query_params_json (Optional[str]): A **valid JSON string** for query parameters.
                                          Keys/strings MUST use double quotes. Example: '{"$select": "id,displayName"}'.

    Returns:
        Union[Dict[str, Any], List[Any]]:
            - On successful API call (2xx status, excluding 204): The parsed JSON response body (usually a Dict or List).
            - On successful API call with 204 No Content: An empty dictionary `{}`.
            - On any failure: A dictionary containing error details and a user-friendly message.
    """
    if not path.startswith('/'):
        path = '/' + path # Ensure path starts with a slash

    parsed_body: Optional[Any] = None
    parsed_query_params: Optional[Dict[str, str]] = None

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
                    "query_params_json": query_params_json
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
            "query_params_json": query_params_json
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
                        "query_params_json": query_params_json
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
                    "query_params_json": query_params_json
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
            "query_params_json": query_params_json
        }
        return error_logger.log_error(
            function_name="graph_api_request",
            error_text=f"Error parsing query_params_json: {str(e)}",
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
            headers=None,  # Rely on make_request's header logic
            json_data=parsed_body
        )

        # 5. Return the result from make_request
        if error_data:
            error_params = {
                "endpoint_version": endpoint_version,
                "path": path,
                "method": method,
                "body_json": body_json,
                "query_params_json": query_params_json,
                "full_url": full_url
            }
            return error_logger.log_error(
                function_name="graph_api_request",
                error_text=f"make_request failed: {error_data.get('error')}",
                parameters=error_params,
                stack_trace=traceback.format_exc()
            )
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
    query_params_json: Optional[str] = None
) -> Union[Dict[str, Any], List[Any]]:
    """
    Acts as a tool interface for the LLM to interact with Microsoft Graph API,
    delegating the actual request execution, header management, and auth handling
    to the make_request helper. The LLM MUST provide body and query parameters
    as VALID JSON formatted strings where applicable.

    Args:
        endpoint_version (str): 'v1.0' or 'beta'.
        path (str): The API endpoint path (e.g., '/users', '/groups/ID/members'). MUST start with '/'.
        method (str): HTTP method ('GET', 'POST', 'PUT', 'PATCH', 'DELETE').
        body_json (Optional[str]): A **valid JSON string** for the request body (for POST, PUT, PATCH).
                                   Keys/strings MUST use double quotes. Example: '{"displayName": "New Group"}'.
        query_params_json (Optional[str]): A **valid JSON string** for query parameters.
                                          Keys/strings MUST use double quotes. Example: '{"$select": "id,displayName"}'.

    Returns:
        Union[Dict[str, Any], List[Any]]:
            - On successful API call (2xx status, excluding 204): The parsed JSON response body (usually a Dict or List).
            - On successful API call with 204 No Content: An empty dictionary `{}`.
            - On any failure: A dictionary containing error details and a user-friendly message.
    """
    if not path.startswith('/'):
        path = '/' + path # Ensure path starts with a slash

    parsed_body: Optional[Any] = None
    parsed_query_params: Optional[Dict[str, str]] = None

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
            "query_params_json": query_params_json
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
                    "query_params_json": query_params_json
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
            "query_params_json": query_params_json
        }
        return error_logger.log_error(
            function_name="graph_api_request_no_ctx",
            error_text=f"Invalid JSON format in query_params_json: {str(e)}",
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
            headers=None,  # Rely on make_request's header logic
            json_data=parsed_body
        )

        # 5. Return the result from make_request
        if error_data:
            error_params = {
                "endpoint_version": endpoint_version,
                "path": path,
                "method": method,
                "body_json": body_json,
                "query_params_json": query_params_json,
                "full_url": full_url
            }
            return error_logger.log_error(
                function_name="graph_api_request_no_ctx",
                error_text=f"make_request failed: {error_data.get('error')}",
                parameters=error_params,
                stack_trace=traceback.format_exc()
            )
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
            "full_url": full_url
        }
        return error_logger.log_error(
            function_name="graph_api_request_no_ctx",
            error_text=f"Unexpected error in make_request: {str(e)}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

import threading
import time
import requests
import json
from typing import Tuple, Optional, Dict, Any
import logging
import os
from dotenv import load_dotenv
from error_logger.error_logger import ErrorLogger
import traceback

load_dotenv()

# Initialize error logger
error_logger = ErrorLogger()

tenant_id = os.getenv("TENANT_ID")
client_id = os.getenv("APP_ID")
client_secret = os.getenv("SECRET")


_token = None
_headers = {}
_token_expiry = None
_token_lock = threading.Lock()


def refresh_token() -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    # print credentials
    print("tenant_id", tenant_id)
    print("client_id", client_id)
    print("client_secret", client_secret)
    """Refreshes the access token for Microsoft Graph API"""
    global _token, _headers, _token_expiry

    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://graph.microsoft.com/.default",
    }

    try:
        response = requests.post(token_url, data=token_data)
        response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
        data = response.json()
        token = data.get("access_token")
        expires_in = data.get("expires_in")  # Get token lifetime

        if not token:
            print(response.text)
            logging.error("Failed to get token: " + response.text)
            return None, {"error": "Failed to get token", "details": response.text}

        # Update the global token variables
        _token = token
        _headers = {
            "Authorization": f"Bearer {_token}",
            "Content-Type": "application/json",
        }
        _token_expiry = time.time() + int(expires_in)
        logging.info("Token refreshed successfully.")

        return _token, None

    except requests.exceptions.RequestException as e:
        logging.error(f"Request failed: {e}")
        return None, {"error": "Failed to refresh token", "details": str(e)}
    except Exception as e:
        logging.exception("An unexpected error occurred during token refresh.")
        return None, {
            "error": "Unexpected error during token refresh",
            "details": str(e),
        }


def _check_and_refresh_token() -> Optional[Dict[str, Any]]:
    """Checks if the token is expired and refreshes it if needed."""
    global _token, _headers, _token_expiry

    if _token_expiry is None or time.time() >= _token_expiry:
        logging.info("Token expired or about to expire. Refreshing...")
        with _token_lock:
            token, error = refresh_token()
            if error:
                return error  # Return the error encountered during refresh

            # Update global token variables if refresh was successful
            if token:
                _token = token
                _headers["Authorization"] = f"Bearer {_token}"
                schedule_token_refresh()

    return None  # No error


def schedule_token_refresh():
    """Schedules the token refresh to occur before it expires."""
    global _token_expiry

    if _token_expiry:
        # Refresh token 5 minutes before expiry
        refresh_time = _token_expiry - time.time() - 300
        if refresh_time > 0:
            logging.info(f"Scheduling token refresh in {refresh_time} seconds.")
            threading.Timer(refresh_time, _refresh_token_and_reschedule).start()
        else:
            logging.warning(
                "Token is already expired or about to expire. Refreshing now."
            )
            _refresh_token_and_reschedule()
    else:
        logging.warning("Token expiry not set. Refreshing immediately.")
        _refresh_token_and_reschedule()


def _refresh_token_and_reschedule():
    """Refreshes the token and reschedules the next refresh."""
    global _token, _headers

    with _token_lock:  # Ensure thread safety
        token, error = refresh_token()
        if error:
            logging.error(f"Failed to refresh token: {error}")
            # Handle the error (e.g., stop the application or retry later)
            return

        if token:
            _token = token
            _headers["Authorization"] = f"Bearer {_token}"
            schedule_token_refresh()


def make_request(
    method: str,
    url: str,
    headers: Optional[Dict[str, str]] = None,
    json_data: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Makes an HTTP request, handling token refresh and returning structured errors.
    Attempts to gracefully handle successful 2xx responses even with non-JSON/empty bodies.
    Includes refined exception handling.
    """
    global _headers
    response: Optional[requests.Response] = None
    req_id = f"{method} {url}"

    # --- Token Check and Header Prep (Keep as before) ---
    logging.debug(f"[{req_id}] Checking token...")
    token_error = _check_and_refresh_token()
    if token_error:
        logging.error(f"[{req_id}] Token refresh failed: {token_error}")
        err_payload = token_error if isinstance(token_error, dict) else {"details": str(token_error)}
        err_payload.setdefault("error", "Token refresh failed")
        error_params = {
            "method": method,
            "url": url,
            "headers": headers,
            "json_data": json_data
        }
        return None, error_logger.log_error(
            function_name="make_request",
            error_text=f"Token refresh failed: {err_payload.get('error')}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
    logging.debug(f"[{req_id}] Token check OK.")

    request_headers = _headers
    if not request_headers:
        logging.error(f"[{req_id}] Missing request headers.")
        error_params = {
            "method": method,
            "url": url,
            "headers": headers,
            "json_data": json_data
        }
        return None, error_logger.log_error(
            function_name="make_request",
            error_text="Missing request headers",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
    logging.debug(f"[{req_id}] Headers prepared.")
    # --- End Token/Header Prep ---

    try:
        logging.info(f"[{req_id}] Making request...")
        response = requests.request(
            method, url, headers=request_headers, json=json_data, timeout=30
        )
        logging.info(f"[{req_id}] Request completed. Status: {response.status_code}")
        logging.debug(f"[{req_id}] Response Headers: {dict(response.headers)}")

        # Check for HTTP errors first (4xx/5xx)
        response.raise_for_status() # Raises HTTPError for bad status

        # --- Success Handling (2xx) ---
        if response.status_code == 204:
            logging.debug(f"[{req_id}] Successful: 204 No Content.")
            return {}, None # Success, no body

        # Try parsing JSON for other 2xx status codes
        try:
            # IMPORTANT: Check if body actually has content before trying .json()
            if not response.content: # Access raw bytes first
                 logging.warning(f"[{req_id}] Successful ({response.status_code}) but response body is empty.")
                 # Return success, indicating no data was returned
                 return {"status_code": response.status_code, "message": "Success, but empty response body."}, None
            else:
                 # Body has content, now try decoding JSON
                 response_json = response.json()
                 logging.debug(f"[{req_id}] Successful ({response.status_code}) with JSON body.")
                 return response_json, None
        except json.JSONDecodeError:
            # 2xx status, but body wasn't valid JSON
            response_text = response.text
            logging.warning(
                f"[{req_id}] Successful ({response.status_code}) but response body was not valid JSON. Body start: '{response_text[:200]}...'"
            )
            # Return success, but provide the text preview
            return {"status_code": response.status_code, "message": "Success, but non-JSON response body.", "response_text_preview": response_text[:200]}, None

    # --- Exception Handling ---
    except requests.exceptions.HTTPError as e:
        # Handles 4xx/5xx errors raised by raise_for_status()
        # response is guaranteed available via e.response
        err_status = e.response.status_code
        err_headers = dict(e.response.headers)
        err_text = e.response.text
        log_msg = f"[{req_id}] HTTP Error {err_status}. Response: '{err_text[:500]}...'"
        if 400 <= err_status < 500: logging.warning(log_msg)
        else: logging.error(log_msg)
        error_params = {
            "method": method,
            "url": url,
            "headers": headers,
            "json_data": json_data,
            "status_code": err_status,
            "response_headers": err_headers,
            "response_text": err_text
        }
        return None, error_logger.log_error(
            function_name="make_request",
            error_text=f"HTTP Error: {err_status}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

    except requests.exceptions.Timeout as e:
        logging.error(f"[{req_id}] Request timed out: {e}")
        error_params = {
            "method": method,
            "url": url,
            "headers": headers,
            "json_data": json_data
        }
        return None, error_logger.log_error(
            function_name="make_request",
            error_text="Request Timeout",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

    except requests.exceptions.ConnectionError as e:
        logging.error(f"[{req_id}] Connection error: {e}")
        error_params = {
            "method": method,
            "url": url,
            "headers": headers,
            "json_data": json_data
        }
        return None, error_logger.log_error(
            function_name="make_request",
            error_text="Connection Error",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

    # Catch OTHER request-related errors (could happen before response is fully formed)
    except requests.exceptions.RequestException as e:
        logging.error(f"[{req_id}] Generic RequestException: {e.__class__.__name__}: {e}", exc_info=True)
        # --- CRITICAL CHECK: Does the exception *itself* have a response object? ---
        err_status = None
        err_headers = {}
        err_text = None
        if hasattr(e, 'response') and e.response is not None:
            logging.warning(f"[{req_id}] RequestException had a response object attached (Status: {e.response.status_code}). Re-evaluating.")
            # If it has a response, maybe it SHOULD have been an HTTPError or handled like one?
            # Or maybe it's a successful response caught here due to weird internal issue?
            # Let's try to extract info, but still report as Request Failed unless status is 2xx
            err_status = e.response.status_code
            err_headers = dict(e.response.headers)
            try:
                 err_text = e.response.text
            except Exception: # Handle cases where reading text might also fail
                 err_text = "[Could not read response text]"

            # If status code is actually OK despite the exception, log it but still return error for safety
            if 200 <= err_status < 300:
                 logging.error(f"[{req_id}] RequestException caught BUT response status ({err_status}) was OK. Returning error due to underlying exception: {e}")
                 # Return a specific error indicating this weird state
                 error_params = {
                     "method": method,
                     "url": url,
                     "headers": headers,
                     "json_data": json_data,
                     "status_code": err_status,
                     "response_headers": err_headers,
                     "response_text": err_text
                 }
                 return None, error_logger.log_error(
                     function_name="make_request",
                     error_text="Request Exception Despite OK Status",
                     parameters=error_params,
                     stack_trace=traceback.format_exc()
                 )
            # Otherwise, treat as a standard failure caught by this handler
            error_params = {
                "method": method,
                "url": url,
                "headers": headers,
                "json_data": json_data,
                "status_code": err_status,
                "response_headers": err_headers,
                "response_text": err_text
            }
            return None, error_logger.log_error(
                function_name="make_request",
                error_text="Request Failed",
                parameters=error_params,
                stack_trace=traceback.format_exc()
            )
        else:
            # No response object attached to the exception, return standard Request Failed
            error_params = {
                "method": method,
                "url": url,
                "headers": headers,
                "json_data": json_data
            }
            return None, error_logger.log_error(
                function_name="make_request",
                error_text="Request Failed",
                parameters=error_params,
                stack_trace=traceback.format_exc()
            )

    # Outer JSONDecodeError - should be less likely now, but catches issues during body read perhaps
    except json.JSONDecodeError as e:
        err_status = response.status_code if response else None # Try to get status if response exists
        err_headers = dict(response.headers) if response else {}
        err_text = response.text if response else "[Response object not available]"
        logging.error(f"[{req_id}] Unexpected JSONDecodeError (Status: {err_status}): {e}. Body: '{err_text[:200]}...'", exc_info=True)
        error_params = {
            "method": method,
            "url": url,
            "headers": headers,
            "json_data": json_data,
            "status_code": err_status,
            "response_headers": err_headers,
            "response_text": err_text
        }
        return None, error_logger.log_error(
            function_name="make_request",
            error_text="Failed unexpectedly during JSON decode",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )

    except Exception as e:
        # Catch-all for truly unexpected errors
        err_status = response.status_code if response else None
        logging.exception(f"[{req_id}] An unexpected error occurred (Status: {err_status})")
        error_params = {
            "method": method,
            "url": url,
            "headers": headers,
            "json_data": json_data,
            "status_code": err_status
        }
        return None, error_logger.log_error(
            function_name="make_request",
            error_text="Unexpected error during request",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
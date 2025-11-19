import threading
import time
import requests
import json
from typing import Tuple, Optional, Dict, Any
import logging
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from error_logger.error_logger import ErrorLogger
import traceback
from cryptography.fernet import Fernet
from helpers.Firebase_helpers import FirebaseUser
from database.models import engine

load_dotenv()

# Initialize error logger
error_logger = ErrorLogger()

# Token encryption utilities
ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY")
_cipher = None

def _get_cipher():
    """Get or create Fernet cipher for token encryption"""
    global _cipher
    if _cipher is None:
        if not ENCRYPTION_KEY:
            raise ValueError("TOKEN_ENCRYPTION_KEY environment variable not set. Generate one with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'")
        _cipher = Fernet(ENCRYPTION_KEY.encode())
    return _cipher

def encrypt_token(token: str) -> str:
    """Encrypt token before storing"""
    if not token:
        return token
    return _get_cipher().encrypt(token.encode()).decode()

def decrypt_token(encrypted_token: str) -> str:
    """Decrypt token after retrieving"""
    if not encrypted_token:
        return encrypted_token
    return _get_cipher().decrypt(encrypted_token.encode()).decode()

class TokenManager:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        
        self.tenant_id = os.getenv("TENANT_ID")
        self.client_id = os.getenv("APP_ID")
        self.client_secret = os.getenv("SECRET")
        self._token: Optional[str] = None
        self._token_expiry: Optional[float] = None
        self._token_lock = threading.Lock()
        self._initialized = True

    def __new__(cls):
        with cls._lock:
            if not cls._instance:
                cls._instance = super().__new__(cls)
        return cls._instance

    def get_token(self) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        """Gets a valid access token, refreshing if necessary."""
        with self._token_lock:
            # Refresh if token is missing, or expired (with a 5-min buffer)
            if self._token is None or self._token_expiry is None or time.time() >= self._token_expiry:
                logging.info("Token is expired or missing. Refreshing...")
                return self._refresh_token()
            
            logging.debug("Returning cached token.")
            return self._token, None

    def _refresh_token(self) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        """Internal method to refresh the token. Must be called within a lock."""
        token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
        token_data = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }
        
        try:
            response = requests.post(token_url, data=token_data)
            response.raise_for_status()
            data = response.json()
            
            self._token = data.get("access_token")
            expires_in = data.get("expires_in", 3600)
            
            if not self._token:
                logging.error(f"Failed to get token from response: {response.text}")
                return None, {"error": "Failed to get token", "details": response.text}

            self._token_expiry = time.time() + int(expires_in) - 300  # 5-minute buffer
            logging.info("Token refreshed successfully.")
            return self._token, None

        except requests.exceptions.RequestException as e:
            logging.error(f"Request failed during token refresh: {e}")
            # Invalidate token on failure
            self._token = None
            self._token_expiry = None
            return None, {"error": "Failed to refresh token", "details": str(e)}

# Instantiate the single, thread-safe token manager
token_manager = TokenManager()


class UserTokenManager:
    """Manages Microsoft tokens for individual users with delegated permissions"""
    
    def __init__(self):
        self.tenant_id = os.getenv("TENANT_ID")
        self.client_id = os.getenv("APP_ID")
        self.client_secret = os.getenv("SECRET")
    
    def get_user_token(self, user: FirebaseUser) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        """
        Get a valid Microsoft token for a user, refreshing if necessary.
        Returns (token, error) tuple. Returns (None, None) if user hasn't provided consent.
        """
        from database.models import Session, User, engine
        from sqlalchemy import select
        
        with Session(engine) as session:
            db_user = session.exec(select(User).where(User.id == user.uid)).first()
            
            if not db_user or not db_user.microsoft_access_token:
                # User hasn't provided Microsoft consent, return None
                logging.debug(f"User {user.uid} has no Microsoft token stored")
                return None, None
            
            # Check if token is expired (with 5-minute buffer)
            if db_user.microsoft_token_expires_at:
                time_until_expiry = (db_user.microsoft_token_expires_at - datetime.now()).total_seconds()
                if time_until_expiry <= 300:  # 5 minutes buffer
                    logging.info(f"User {user.uid} token expired or expiring soon. Refreshing...")
                    return self._refresh_user_token(db_user, session)
            
            # Token is still valid
            try:
                token = decrypt_token(db_user.microsoft_access_token)
                logging.debug(f"Using cached Microsoft token for user {user.uid}")
                return token, None
            except Exception as e:
                logging.error(f"Failed to decrypt token for user {user.uid}: {e}")
                return None, {"error": "Failed to decrypt token", "details": str(e)}
    
    def _refresh_user_token(self, db_user, session) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        """Refresh user's Microsoft token using refresh token or re-authentication"""
        try:
            # If we have a refresh token, use it
            if db_user.microsoft_refresh_token:
                refresh_token = decrypt_token(db_user.microsoft_refresh_token)
                
                token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
                token_data = {
                    "grant_type": "refresh_token",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": refresh_token,
                    "scope": "https://graph.microsoft.com/.default"
                }
                
                response = requests.post(token_url, data=token_data)
                response.raise_for_status()
                data = response.json()
                
                new_access_token = data.get("access_token")
                new_refresh_token = data.get("refresh_token", refresh_token)  # Use new or keep old
                expires_in = data.get("expires_in", 3600)
                
                if not new_access_token:
                    logging.error(f"Failed to refresh token for user {db_user.id}: {response.text}")
                    return None, {"error": "Failed to refresh token", "details": response.text}
                
                # Update stored tokens
                db_user.microsoft_access_token = encrypt_token(new_access_token)
                if new_refresh_token != refresh_token:
                    db_user.microsoft_refresh_token = encrypt_token(new_refresh_token)
                db_user.microsoft_token_expires_at = datetime.now() + timedelta(seconds=expires_in)
                
                session.add(db_user)
                session.commit()
                
                logging.info(f"Successfully refreshed Microsoft token for user {db_user.id}")
                return new_access_token, None
            else:
                # No refresh token available - user needs to re-authenticate
                logging.warning(f"User {db_user.id} has no refresh token. Token refresh not possible.")
                return None, {"error": "No refresh token available", "details": "User needs to re-authenticate"}
            
        except requests.exceptions.RequestException as e:
            logging.error(f"Failed to refresh token for user {db_user.id}: {e}")
            return None, {"error": "Failed to refresh token", "details": str(e)}
        except Exception as e:
            logging.error(f"Unexpected error refreshing token for user {db_user.id}: {e}")
            return None, {"error": "Unexpected error during token refresh", "details": str(e)}

# Instantiate user token manager
user_token_manager = UserTokenManager()

def make_request(
    method: str,
    url: str,
    headers: Optional[Dict[str, str]] = None,
    json_data: Optional[Dict[str, Any]] = None,
    user: Optional[FirebaseUser] = None,
    use_delegated_permissions: bool = False,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Makes an HTTP request, handling token refresh and returning structured errors.
    Attempts to gracefully handle successful 2xx responses even with non-JSON/empty bodies.
    Includes refined exception handling.
    
    Args:
        method: HTTP method (GET, POST, PUT, DELETE, etc.)
        url: The URL to make the request to
        headers: Optional additional headers to include with the request
        json_data: Optional JSON data to include in the request body
        user: Optional FirebaseUser object for delegated permissions
        use_delegated_permissions: If True and user provided, use user's delegated token; otherwise use application token
        
    Returns:
        Tuple of (response_data, error) where:
        - response_data is the parsed JSON response (if successful)
        - error is the error information (if request failed)
    """
    response: Optional[requests.Response] = None
    req_id = f"{method} {url}"

    # --- Token Check and Header Prep ---
    logging.debug(f"[{req_id}] Getting auth token (delegated={use_delegated_permissions})...")
    
    token: Optional[str] = None
    token_error: Optional[Dict[str, Any]] = None
    
    # Get token based on permission mode
    if use_delegated_permissions:
        # Using delegated permissions - MUST use user token, no fallback to app token
        if not user:
            token_error = {
                "error": "User required for delegated permissions",
                "details": "use_delegated_permissions=True requires a user object"
            }
        else:
            # Check if user has delegated permissions permission
            from database.models import Session, User, Role, Permission, RolePermissionLink
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload
            from database.seed_permissions import MICROSOFT_ENTRA_DELEGATED_PERMISSIONS
            
            with Session(engine) as session:
                db_user = session.exec(
                    select(User)
                    .where(User.id == user.uid)
                    .options(selectinload(User.roles).selectinload(Role.permissions))
                ).first()
                
                if not db_user:
                    token_error = {
                        "error": "User not found",
                        "details": "User not found in database"
                    }
                else:
                    # Get all permissions from user's roles
                    user_permissions = set()
                    if db_user.roles:
                        for role in db_user.roles:
                            if role.permissions:
                                for perm in role.permissions:
                                    user_permissions.add(perm.id)
                    
                    if MICROSOFT_ENTRA_DELEGATED_PERMISSIONS not in user_permissions:
                        token_error = {
                            "error": "Insufficient permissions",
                            "details": f"User does not have '{MICROSOFT_ENTRA_DELEGATED_PERMISSIONS}' permission. User has permissions: {list(user_permissions)}"
                        }
                        logging.warning(f"[{req_id}] User {user.uid} ({user.email}) attempted to use delegated permissions without required permission. Permissions: {list(user_permissions)}")
                    else:
                        # User has permission - proceed with delegated token
                        logging.debug(f"[{req_id}] User {user.uid} has delegated permissions - using user token")
                        token, token_error = user_token_manager.get_user_token(user)
                        if token_error:
                            logging.error(f"[{req_id}] Failed to get user delegated token: {token_error}")
                        elif not token:
                            token_error = {
                                "error": "No Microsoft token available",
                                "details": "User has not provided Microsoft OAuth consent or token is missing. User needs to authenticate with Microsoft."
                            }
            # End of database session
    else:
        # Using application permissions - Check if user has app permissions permission
        if not user:
            token_error = {
                "error": "User required for application permissions",
                "details": "Application permissions require a user object for permission verification"
            }
        else:
            # Check if user has application permissions permission
            from database.models import Session, User, Role, Permission, RolePermissionLink
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload
            from database.seed_permissions import MICROSOFT_ENTRA_APP_PERMISSIONS
            
            with Session(engine) as session:
                db_user = session.exec(
                    select(User)
                    .where(User.id == user.uid)
                    .options(selectinload(User.roles).selectinload(Role.permissions))
                ).first()
                
                if not db_user:
                    token_error = {
                        "error": "User not found",
                        "details": "User not found in database"
                    }
                else:
                    # Get all permissions from user's roles
                    user_permissions = set()
                    if db_user.roles:
                        for role in db_user.roles:
                            if role.permissions:
                                for perm in role.permissions:
                                    user_permissions.add(perm.id)
                    
                    if MICROSOFT_ENTRA_APP_PERMISSIONS not in user_permissions:
                        token_error = {
                            "error": "Insufficient permissions",
                            "details": f"User does not have '{MICROSOFT_ENTRA_APP_PERMISSIONS}' permission. User has permissions: {list(user_permissions)}"
                        }
                        logging.warning(f"[{req_id}] User {user.uid} ({user.email}) attempted to use application permissions without required permission. Permissions: {list(user_permissions)}")
                    else:
                        # User has permission - proceed with application token
                        logging.debug(f"[{req_id}] User {user.uid} has app permissions - using application token")
                        token, token_error = token_manager.get_token()
            # End of database session
    
    if token_error or not token:
        logging.error(f"[{req_id}] Token acquisition failed: {token_error}")
        err_payload = token_error if isinstance(token_error, dict) else {"details": str(token_error)}
        err_payload.setdefault("error", "Token acquisition failed")
        error_params = {
            "method": method,
            "url": url,
            "headers": headers,
            "json_data": json_data
        }
        return None, error_logger.log_error(
            function_name="make_request",
            error_text=f"Token acquisition failed: {err_payload.get('error')}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
    logging.debug(f"[{req_id}] Token acquired successfully.")

    # Start with fresh headers for every request
    request_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    # Merge with any custom headers provided by the caller
    if headers:
        request_headers.update(headers)
        logging.debug(f"[{req_id}] Custom headers merged with default headers.")
    
    logging.debug(f"[{req_id}] Headers prepared: {', '.join(request_headers.keys())}")
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
        # Gracefully handle 404 Not Found by returning an error response
        if e.response.status_code == 404:
            logging.warning(f"[{req_id}] Resource not found (404).")
            error_params = {
                "method": method,
                "url": url,
                "headers": headers,
                "json_data": json_data,
                "status_code": 404,
                "response_headers": dict(e.response.headers),
                "response_text": e.response.text
            }
            
            error_response = error_logger.log_error(
                function_name="make_request",
                error_text="Resource not found (404)",
                parameters=error_params,
                stack_trace=traceback.format_exc()
            )
            
            # Try to parse error body if it exists
            try:
                error_body = json.loads(e.response.text)
                error_response["error_body"] = error_body
            except json.JSONDecodeError:
                error_response["error_body"] = {"raw_response": e.response.text}
            
            error_response["full_response_text"] = e.response.text
            return None, error_response
            
        # Handles other 4xx/5xx errors raised by raise_for_status()
        # response is guaranteed available via e.response
        err_status = e.response.status_code
        err_headers = dict(e.response.headers)
        err_text = e.response.text
        log_msg = f"[{req_id}] HTTP Error {err_status}. Response: '{err_text[:500]}...'"
        if 400 <= err_status < 500: logging.warning(log_msg)
        else: logging.error(log_msg)
        
        # Try to parse the error response as JSON
        error_body = None
        try:
            error_body = json.loads(err_text)
        except json.JSONDecodeError:
            error_body = {"raw_response": err_text}
        
        error_params = {
            "method": method,
            "url": url,
            "headers": headers,
            "json_data": json_data,
            "status_code": err_status,
            "response_headers": err_headers,
            "response_text": err_text
        }
        
        # Create a complete error response with the original error body
        error_response = error_logger.log_error(
            function_name="make_request",
            error_text=f"HTTP Error: {err_status}",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        
        # Add the complete error body to the error response
        error_response["error_body"] = error_body
        error_response["full_response_text"] = err_text
        
        return None, error_response

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

            # Try to parse the error response as JSON
            error_body = None
            try:
                if err_text and err_text != "[Could not read response text]":
                    error_body = json.loads(err_text)
            except json.JSONDecodeError:
                error_body = {"raw_response": err_text}

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
                 
                 error_response = error_logger.log_error(
                     function_name="make_request",
                     error_text="Request Exception Despite OK Status",
                     parameters=error_params,
                     stack_trace=traceback.format_exc()
                 )
                 
                 # Add the complete error body to the error response
                 if error_body:
                     error_response["error_body"] = error_body
                 error_response["full_response_text"] = err_text
                 
                 return None, error_response
            
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
            
            error_response = error_logger.log_error(
                function_name="make_request",
                error_text="Request Failed",
                parameters=error_params,
                stack_trace=traceback.format_exc()
            )
            
            # Add the complete error body to the error response
            if error_body:
                error_response["error_body"] = error_body
            error_response["full_response_text"] = err_text
            
            return None, error_response
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
        
        error_response = error_logger.log_error(
            function_name="make_request",
            error_text="Failed unexpectedly during JSON decode",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        
        # Add the complete response text to the error
        error_response["full_response_text"] = err_text
        
        return None, error_response

    except Exception as e:
        # Catch-all for truly unexpected errors
        err_status = response.status_code if response else None
        err_text = response.text if (response and hasattr(response, 'text')) else None
        
        logging.exception(f"[{req_id}] An unexpected error occurred (Status: {err_status})")
        error_params = {
            "method": method,
            "url": url,
            "headers": headers,
            "json_data": json_data,
            "status_code": err_status
        }
        
        error_response = error_logger.log_error(
            function_name="make_request",
            error_text="Unexpected error during request",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        
        # Add the response text if available
        if err_text:
            error_response["full_response_text"] = err_text
        
        return None, error_response
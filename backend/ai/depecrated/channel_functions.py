from ai.assistant_functions.team_functions import search_teams_by_field, search_teams_by_field_no_ctx
from pydantic_ai import RunContext
import logging
import time

# from pydantic_ai import agent_tool # Assuming you'll use agent_tool later, but not crucial for this core logic.
from typing import Tuple, Optional, Dict, Any, List
from helpers.RequestHelper import make_request
from concurrent.futures import ThreadPoolExecutor, as_completed

MAX_RETRIES_PER_TEAM = 3
DEFAULT_RETRY_SECONDS = 5  # Default wait if Retry-After is missing/invalid


## ✅ 13. Create a standard channel
def create_standard_channel(
    ctx: RunContext, team_id: str, channel_name: str, description: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Creates a new standard channel within a Microsoft Team.

    Args:
        team_id (str): The ID of the team
        channel_name (str): The display name of the channel
        description (str): A description for the channel

    Returns:
        tuple: (response_data, error) where response_data contains the created channel details if successful,
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels"
    payload = {"displayName": channel_name, "description": description}

    response, error = make_request("POST", url, json_data=payload)

    if error:
        logging.error(f"Failed to create channel: {error}")
        return None, error

    logging.info(
        f"Channel '{channel_name}' created successfully in team '{team_id}' with ID {response.get('id')}"
    )
    return response, None


def create_standard_channel_no_ctx(
    team_id: str, channel_name: str, description: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Creates a new standard channel within a Microsoft Team.

    Args:
        team_id (str): The ID of the team
        channel_name (str): The display name of the channel
        description (str): A description for the channel

    Returns:
        tuple: (response_data, error) where response_data contains the created channel details if successful,
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels"
    payload = {"displayName": channel_name, "description": description}

    response, error = make_request("POST", url, json_data=payload)

    if error:
        logging.error(f"Failed to create channel: {error}")
        return None, error

    logging.info(
        f"Channel '{channel_name}' created successfully in team '{team_id}' with ID {response.get('id')}"
    )
    return response, None


## ✅ 13b. Create a private channel
def create_private_channel(
    ctx: RunContext,
    team_id: str,
    channel_name: str,
    description: str,
    owners: List[str],
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Creates a new private channel within a Microsoft Team.

    Args:
        team_id (str): The ID of the team
        channel_name (str): The display name of the channel
        description (str): A description for the channel
        owners (list): A list of user IDs who should be owners of the private channel

    Returns:
        tuple: (response_data, error) where response_data contains the created channel details if successful,
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels"
    payload = {
        "displayName": channel_name,
        "description": description,
        "membershipType": "private",
        "owners@odata.bind": [
            f"https://graph.microsoft.com/v1.0/users('{owner}')" for owner in owners
        ],
    }

    response, error = make_request("POST", url, json_data=payload)

    if error:
        logging.error(f"Failed to create private channel: {error}")
        return None, error

    logging.info(
        f"Private channel '{channel_name}' created successfully in team '{team_id}' with ID {response.get('id')} and {len(owners)} owners"
    )
    return response, None


def create_private_channel_no_ctx(
    team_id: str,
    channel_name: str,
    description: str,
    owners: List[str],
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Creates a new private channel within a Microsoft Team.

    Args:
        team_id (str): The ID of the team
        channel_name (str): The display name of the channel
        description (str): A description for the channel
        owners (list): A list of user IDs who should be owners of the private channel

    Returns:
        tuple: (response_data, error) where response_data contains the created channel details if successful,
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels"
    payload = {
        "displayName": channel_name,
        "description": description,
        "membershipType": "private",
        "owners@odata.bind": [
            f"https://graph.microsoft.com/v1.0/users('{owner}')" for owner in owners
        ],
    }

    response, error = make_request("POST", url, json_data=payload)

    if error:
        logging.error(f"Failed to create private channel: {error}")
        return None, error

    logging.info(
        f"Private channel '{channel_name}' created successfully in team '{team_id}' with ID {response.get('id')} and {len(owners)} owners"
    )
    return response, None


## ✅ 14. List all channels
def list_channels(
    ctx: "RunContext", team_id: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Lists all channels within a Microsoft Team, handling pagination.

    Propagates detailed error information, including status code and headers
    if provided by the underlying request mechanism, suitable for retry logic.

    Args:
        ctx: The run context object.
        team_id: The ID of the team to list channels from.

    Returns:
        tuple: (channels_list, error) where channels_list contains all channels if successful,
               or None and an error dictionary (potentially including 'status_code'
               and 'headers') if failed.
    """
    if not team_id:
        logging.warning("list_channels called with empty team_id.")
        return None, {
            "error": "Invalid team_id provided",
            "status_code": 400,
        }  # Bad Request

    base_url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels"
    url: Optional[str] = base_url
    all_channels: List[Dict[str, Any]] = []
    page_count = 0

    try:
        while url:
            page_count += 1
            logging.debug(
                f"Requesting channels for team {team_id}, page {page_count}, url: {url}"
            )
            response, error = make_request("GET", url)  # ASSUMPTION HERE!

            # --- Primary Error Check ---
            # Assumes make_request returns (None, error_dict) on HTTP error
            if error:
                # Log the specific error received from make_request
                log_msg = f"Failed to list channels for team {team_id} (page {page_count}). Error: {error}"
                # Check if it looks like a structured error dict
                if isinstance(error, dict) and "status_code" in error:
                    logging.error(f"{log_msg} - Status: {error.get('status_code')}")
                else:
                    logging.error(log_msg)
                # Propagate the error object directly - the caller expects this structure
                return None, error

            # --- Success Case for the current page ---
            if response is None:
                # Should not happen if error is None based on our assumption, but good safety check
                logging.error(
                    f"make_request returned None response and None error for team {team_id}, page {page_count}. Aborting."
                )
                return None, {
                    "error": "Internal error: Inconsistent state from make_request",
                    "status_code": 500,
                }

            # Process page results
            channels_on_page = response.get("value")
            if channels_on_page is None:
                logging.warning(
                    f"Response for team {team_id}, page {page_count} missing 'value' field. Response: {response}"
                )
                # Decide if this is critical. Here, we'll continue if nextLink exists, otherwise stop.
            elif isinstance(channels_on_page, list):
                all_channels.extend(channels_on_page)
            else:
                logging.warning(
                    f"Response 'value' for team {team_id}, page {page_count} is not a list. Type: {type(channels_on_page)}"
                )
                # Treat as non-critical for now, maybe log content if small

            # Get next page link
            url = response.get("@odata.nextLink")
            if url:
                logging.debug(f"Found nextLink for team {team_id}: {url}")

        # Loop finished successfully
        logging.info(
            f"Successfully retrieved {len(all_channels)} channels across {page_count} pages for team {team_id}"
        )
        return all_channels, None

    # --- Broad Exception Handling ---
    # Catches exceptions outside make_request OR if make_request *raises* exceptions instead of returning error dict
    except Exception as e:
        logging.exception(f"Unexpected error listing channels for team {team_id}: {e}")

        # Attempt to construct a consistent error dictionary
        error_details = {
            "error": "Unexpected error listing channels",
            "details": str(e),
        }

        # Try to extract HTTP details if the exception has a 'response' attribute
        # (Common pattern for libraries like 'requests')
        status = 500  # Default internal server error
        headers = {}
        if hasattr(e, "response") and e.response is not None:
            try:
                status = e.response.status_code
                headers = dict(e.response.headers)  # Convert to plain dict
            except Exception as ex:
                logging.warning(
                    f"Could not extract status/headers from exception response: {ex}"
                )

        error_details["status_code"] = status
        error_details["headers"] = headers  # Include headers, might be empty

        return None, error_details


def list_channels_no_ctx(
    team_id: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Lists all channels within a Microsoft Team, handling pagination.

    Propagates detailed error information, including status code and headers
    if provided by the underlying request mechanism, suitable for retry logic.

    Args:
        team_id: The ID of the team to list channels from.

    Returns:
        tuple: (channels_list, error) where channels_list contains all channels if successful,
               or None and an error dictionary (potentially including 'status_code'
               and 'headers') if failed.
    """
    if not team_id:
        logging.warning("list_channels called with empty team_id.")
        return None, {
            "error": "Invalid team_id provided",
            "status_code": 400,
        }  # Bad Request

    base_url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels"
    url: Optional[str] = base_url
    all_channels: List[Dict[str, Any]] = []
    page_count = 0

    try:
        while url:
            page_count += 1
            logging.debug(
                f"Requesting channels for team {team_id}, page {page_count}, url: {url}"
            )
            response, error = make_request("GET", url)  # ASSUMPTION HERE!

            # --- Primary Error Check ---
            # Assumes make_request returns (None, error_dict) on HTTP error
            if error:
                # Log the specific error received from make_request
                log_msg = f"Failed to list channels for team {team_id} (page {page_count}). Error: {error}"
                # Check if it looks like a structured error dict
                if isinstance(error, dict) and "status_code" in error:
                    logging.error(f"{log_msg} - Status: {error.get('status_code')}")
                else:
                    logging.error(log_msg)
                # Propagate the error object directly - the caller expects this structure
                return None, error

            # --- Success Case for the current page ---
            if response is None:
                # Should not happen if error is None based on our assumption, but good safety check
                logging.error(
                    f"make_request returned None response and None error for team {team_id}, page {page_count}. Aborting."
                )
                return None, {
                    "error": "Internal error: Inconsistent state from make_request",
                    "status_code": 500,
                }

            # Process page results
            channels_on_page = response.get("value")
            if channels_on_page is None:
                logging.warning(
                    f"Response for team {team_id}, page {page_count} missing 'value' field. Response: {response}"
                )
                # Decide if this is critical. Here, we'll continue if nextLink exists, otherwise stop.
            elif isinstance(channels_on_page, list):
                all_channels.extend(channels_on_page)
            else:
                logging.warning(
                    f"Response 'value' for team {team_id}, page {page_count} is not a list. Type: {type(channels_on_page)}"
                )
                # Treat as non-critical for now, maybe log content if small

            # Get next page link
            url = response.get("@odata.nextLink")
            if url:
                logging.debug(f"Found nextLink for team {team_id}: {url}")

        # Loop finished successfully
        logging.info(
            f"Successfully retrieved {len(all_channels)} channels across {page_count} pages for team {team_id}"
        )
        return all_channels, None

    # --- Broad Exception Handling ---
    # Catches exceptions outside make_request OR if make_request *raises* exceptions instead of returning error dict
    except Exception as e:
        logging.exception(f"Unexpected error listing channels for team {team_id}: {e}")

        # Attempt to construct a consistent error dictionary
        error_details = {
            "error": "Unexpected error listing channels",
            "details": str(e),
        }

        # Try to extract HTTP details if the exception has a 'response' attribute
        # (Common pattern for libraries like 'requests')
        status = 500  # Default internal server error
        headers = {}
        if hasattr(e, "response") and e.response is not None:
            try:
                status = e.response.status_code
                headers = dict(e.response.headers)  # Convert to plain dict
            except Exception as ex:
                logging.warning(
                    f"Could not extract status/headers from exception response: {ex}"
                )

        error_details["status_code"] = status
        error_details["headers"] = headers  # Include headers, might be empty

        return None, error_details


## ✅ 16. List channels from multiple teams
def list_channels_from_multiple_teams(
    ctx: "RunContext",
    team_ids: List[str],
    # search_string: str = None, # These params are not used in the current fetch logic
    # filter_field: str = "displayName" # Consider passing them to list_channels if needed
) -> Tuple[Optional[Dict[str, List[Dict[str, Any]]]], Optional[Dict[str, Any]]]:
    """
    Lists all channels from multiple Microsoft Teams concurrently using multithreading.

    Handles HTTP 429 errors by respecting the Retry-After header.
    Collects results for successful teams even if some fail after retries.

    Args:
        ctx: The run context object.
        team_ids: List of team IDs to list channels from.

    Returns:
        tuple: (teams_channels_dict, error) where teams_channels_dict contains a mapping
        of team IDs to their channels for successfully fetched teams. Returns None for
        the dictionary and an error if a critical failure occurs during setup.
        Individual team failures after retries are logged but don't stop the overall process.
    """
    teams_channels: Dict[str, List[Dict[str, Any]]] = {}
    failed_teams: Dict[str, Dict[str, Any]] = {}  # To track teams that failed

    # Limit concurrent workers to avoid overwhelming the API endpoint
    # Consider adjusting based on observed API behavior and limits
    max_workers = min(5, len(team_ids))
    if not team_ids:
        logging.info("No team IDs provided to list channels from.")
        return {}, None

    def fetch_team_channels(
        team_id: str,
    ) -> Tuple[str, Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
        """Worker function to fetch channels for a single team with retry logic."""
        channels: Optional[List[Dict[str, Any]]] = None
        error: Optional[Dict[str, Any]] = None
        retry_count = 0

        # Add a small initial delay - helps prevent initial burst of requests causing 429
        time.sleep(
            0.2 * (team_ids.index(team_id) % max_workers)
        )  # Stagger initial calls slightly

        while retry_count <= MAX_RETRIES_PER_TEAM:
            # Consider adding small delay even within retries if needed: time.sleep(0.5)
            channels, error = list_channels(ctx, team_id)  # THE ACTUAL API CALL

            if not error:
                # Success!
                return team_id, channels, None

            # --- Error Handling ---
            is_429 = False
            status_code = None
            headers = None

            # *** Adapt this check based on the actual structure of your error object ***
            if isinstance(error, dict):
                status_code = error.get("status_code")
                headers = error.get("headers")
            # Example if error is an object:
            # elif hasattr(error, 'status_code'):
            #     status_code = error.status_code
            #     headers = getattr(error, 'headers', None)

            if status_code == 429:
                is_429 = True

            if is_429 and retry_count < MAX_RETRIES_PER_TEAM:
                retry_after = DEFAULT_RETRY_SECONDS
                if headers and "Retry-After" in headers:
                    try:
                        # Header value can be seconds or an HTTP date
                        # Simple parsing for seconds:
                        retry_after = int(headers["Retry-After"])
                        # Add a small buffer (e.g., 1 second) to be safe
                        retry_after = max(1, retry_after + 1)
                        logging.info(
                            f"Team {team_id}: Parsed Retry-After: {headers['Retry-After']}, waiting {retry_after}s"
                        )
                    except (ValueError, TypeError):
                        logging.warning(
                            f"Team {team_id}: Invalid Retry-After header value: {headers.get('Retry-After')}. "
                            f"Using default wait {DEFAULT_RETRY_SECONDS}s."
                        )
                        retry_after = DEFAULT_RETRY_SECONDS
                else:
                    logging.warning(
                        f"Team {team_id}: 429 received but no Retry-After header found. "
                        f"Using default wait {DEFAULT_RETRY_SECONDS}s."
                    )

                logging.warning(
                    f"Rate limited (429) getting channels for team {team_id}. "
                    f"Retrying after {retry_after} seconds... (Attempt {retry_count + 1}/{MAX_RETRIES_PER_TEAM})"
                )
                time.sleep(retry_after)
                retry_count += 1
                # Continue to the next iteration of the while loop to retry
            else:
                # Not a 429 error, or retries exhausted
                if is_429:  # Retries exhausted for 429
                    logging.error(
                        f"Failed to list channels for team {team_id} after {MAX_RETRIES_PER_TEAM} retries due to persistent 429. Last error: {error}"
                    )
                else:  # Non-429 error
                    logging.error(
                        f"Failed to list channels for team {team_id} with non-retryable error: {error}"
                    )
                # Break the loop, error is already set from list_channels call
                break
        # End of while loop

        # Return the final state after loop (either success or last error)
        return team_id, channels, error

    # --- Main execution block ---
    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            future_to_team = {
                executor.submit(fetch_team_channels, team_id): team_id
                for team_id in team_ids
            }

            # Process completed tasks as they finish
            for future in as_completed(future_to_team):
                team_id = future_to_team[future]
                try:
                    t_id, result_channels, result_error = future.result()
                    # Sanity check, should match team_id from future_to_team
                    if t_id != team_id:
                        logging.warning(
                            f"Mismatch in team ID processing: expected {team_id}, got {t_id}"
                        )

                    if result_error:
                        # Failure for this specific team was already logged in the worker
                        failed_teams[team_id] = result_error
                    elif result_channels is not None:
                        teams_channels[team_id] = result_channels
                    else:
                        # Should not happen if error is None, but good to handle
                        logging.warning(
                            f"Worker for team {team_id} returned None for channels and error."
                        )
                        failed_teams[team_id] = {
                            "error": "Worker returned inconsistent state"
                        }

                except Exception as exc:
                    # Exception raised during task execution itself (rare)
                    logging.error(
                        f"Team {team_id} worker generated an exception: {exc}",
                        exc_info=True,
                    )
                    failed_teams[team_id] = {
                        "error": "Worker execution failed",
                        "details": str(exc),
                    }

        success_count = len(teams_channels)
        failure_count = len(failed_teams)
        logging.info(
            f"Finished fetching channels. Success: {success_count}, Failures: {failure_count} "
            f"(out of {len(team_ids)} teams) using {max_workers} workers."
        )
        if failed_teams:
            logging.warning(f"Failed Team IDs: {list(failed_teams.keys())}")

        # Return the dictionary of successfully retrieved channels
        # Error is None because the function itself completed, even if some teams failed.
        # The caller can check the length of the returned dict vs the input list if needed.
        return teams_channels, None

    except Exception as e:
        # Catch errors during ThreadPoolExecutor setup or task submission
        logging.exception(
            f"Unexpected critical error during multi-team channel fetching setup: {e}"
        )
        return None, {
            "error": "Unexpected critical error during setup",
            "details": str(e),
        }


def list_channels_from_multiple_teams_no_ctx(
    team_ids: List[str],
) -> Tuple[Optional[Dict[str, List[Dict[str, Any]]]], Optional[Dict[str, Any]]]:
    """
    Lists all channels from multiple Microsoft Teams concurrently using multithreading.

    Handles HTTP 429 errors by respecting the Retry-After header.
    Collects results for successful teams even if some fail after retries.

    Args:
        team_ids: List of team IDs to list channels from.

    Returns:
        tuple: (teams_channels_dict, error) where teams_channels_dict contains a mapping
        of team IDs to their channels for successfully fetched teams. Returns None for
        the dictionary and an error if a critical failure occurs during setup.
        Individual team failures after retries are logged but don't stop the overall process.
    """
    teams_channels: Dict[str, List[Dict[str, Any]]] = {}
    failed_teams: Dict[str, Dict[str, Any]] = {}  # To track teams that failed

    # Limit concurrent workers to avoid overwhelming the API endpoint
    # Consider adjusting based on observed API behavior and limits
    max_workers = min(5, len(team_ids))
    if not team_ids:
        logging.info("No team IDs provided to list channels from.")
        return {}, None

    def fetch_team_channels(
        team_id: str,
    ) -> Tuple[str, Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
        """Worker function to fetch channels for a single team with retry logic."""
        channels: Optional[List[Dict[str, Any]]] = None
        error: Optional[Dict[str, Any]] = None
        retry_count = 0

        # Add a small initial delay - helps prevent initial burst of requests causing 429
        time.sleep(
            0.2 * (team_ids.index(team_id) % max_workers)
        )  # Stagger initial calls slightly

        while retry_count <= MAX_RETRIES_PER_TEAM:
            # Consider adding small delay even within retries if needed: time.sleep(0.5)
            channels, error = list_channels_no_ctx(team_id)  # THE ACTUAL API CALL

            if not error:
                # Success!
                return team_id, channels, None

            # --- Error Handling ---
            is_429 = False
            status_code = None
            headers = None

            # *** Adapt this check based on the actual structure of your error object ***
            if isinstance(error, dict):
                status_code = error.get("status_code")
                headers = error.get("headers")
            # Example if error is an object:
            # elif hasattr(error, 'status_code'):
            #     status_code = error.status_code
            #     headers = getattr(error, 'headers', None)

            if status_code == 429:
                is_429 = True

            if is_429 and retry_count < MAX_RETRIES_PER_TEAM:
                retry_after = DEFAULT_RETRY_SECONDS
                if headers and "Retry-After" in headers:
                    try:
                        # Header value can be seconds or an HTTP date
                        # Simple parsing for seconds:
                        retry_after = int(headers["Retry-After"])
                        # Add a small buffer (e.g., 1 second) to be safe
                        retry_after = max(1, retry_after + 1)
                        logging.info(
                            f"Team {team_id}: Parsed Retry-After: {headers['Retry-After']}, waiting {retry_after}s"
                        )
                    except (ValueError, TypeError):
                        logging.warning(
                            f"Team {team_id}: Invalid Retry-After header value: {headers.get('Retry-After')}. "
                            f"Using default wait {DEFAULT_RETRY_SECONDS}s."
                        )
                        retry_after = DEFAULT_RETRY_SECONDS
                else:
                    logging.warning(
                        f"Team {team_id}: 429 received but no Retry-After header found. "
                        f"Using default wait {DEFAULT_RETRY_SECONDS}s."
                    )

                logging.warning(
                    f"Rate limited (429) getting channels for team {team_id}. "
                    f"Retrying after {retry_after} seconds... (Attempt {retry_count + 1}/{MAX_RETRIES_PER_TEAM})"
                )
                time.sleep(retry_after)
                retry_count += 1
                # Continue to the next iteration of the while loop to retry
            else:
                # Not a 429 error, or retries exhausted
                if is_429:  # Retries exhausted for 429
                    logging.error(
                        f"Failed to list channels for team {team_id} after {MAX_RETRIES_PER_TEAM} retries due to persistent 429. Last error: {error}"
                    )
                else:  # Non-429 error
                    logging.error(
                        f"Failed to list channels for team {team_id} with non-retryable error: {error}"
                    )
                # Break the loop, error is already set from list_channels call
                break
        # End of while loop

        # Return the final state after loop (either success or last error)
        return team_id, channels, error

    # --- Main execution block ---
    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            future_to_team = {
                executor.submit(fetch_team_channels, team_id): team_id
                for team_id in team_ids
            }

            # Process completed tasks as they finish
            for future in as_completed(future_to_team):
                team_id = future_to_team[future]
                try:
                    t_id, result_channels, result_error = future.result()
                    # Sanity check, should match team_id from future_to_team
                    if t_id != team_id:
                        logging.warning(
                            f"Mismatch in team ID processing: expected {team_id}, got {t_id}"
                        )

                    if result_error:
                        # Failure for this specific team was already logged in the worker
                        failed_teams[team_id] = result_error
                    elif result_channels is not None:
                        teams_channels[team_id] = result_channels
                    else:
                        # Should not happen if error is None, but good to handle
                        logging.warning(
                            f"Worker for team {team_id} returned None for channels and error."
                        )
                        failed_teams[team_id] = {
                            "error": "Worker returned inconsistent state"
                        }

                except Exception as exc:
                    # Exception raised during task execution itself (rare)
                    logging.error(
                        f"Team {team_id} worker generated an exception: {exc}",
                        exc_info=True,
                    )
                    failed_teams[team_id] = {
                        "error": "Worker execution failed",
                        "details": str(exc),
                    }

        success_count = len(teams_channels)
        failure_count = len(failed_teams)
        logging.info(
            f"Finished fetching channels. Success: {success_count}, Failures: {failure_count} "
            f"(out of {len(team_ids)} teams) using {max_workers} workers."
        )
        if failed_teams:
            logging.warning(f"Failed Team IDs: {list(failed_teams.keys())}")

        # Return the dictionary of successfully retrieved channels
        # Error is None because the function itself completed, even if some teams failed.
        # The caller can check the length of the returned dict vs the input list if needed.
        return teams_channels, None

    except Exception as e:
        # Catch errors during ThreadPoolExecutor setup or task submission
        logging.exception(
            f"Unexpected critical error during multi-team channel fetching setup: {e}"
        )
        return None, {
            "error": "Unexpected critical error during setup",
            "details": str(e),
        }


## ✅ 15. Delete a channel
def delete_channel(
    ctx: RunContext, team_id: str, channel_id: str
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Deletes a channel from a Microsoft Team.

    Args:
        team_id (str): The ID of the team containing the channel
        channel_id (str): The ID of the channel to delete

    Returns:
        tuple: (success_message, error) where success_message indicates successful deletion
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels/{channel_id}"
    response, error = make_request("DELETE", url)

    if error:
        logging.error(f"Failed to delete channel: {error}")
        return None, error

    logging.info(f"Channel '{channel_id}' deleted successfully from team '{team_id}'")
    return (
        f"Successfully deleted channel {channel_id} from team {team_id}",
        None,
    )  # Return success message


def delete_channel_no_ctx(
    team_id: str, channel_id: str
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Deletes a channel from a Microsoft Team.

    Args:
        team_id (str): The ID of the team containing the channel
        channel_id (str): The ID of the channel to delete

    Returns:
        tuple: (success_message, error) where success_message indicates successful deletion
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels/{channel_id}"
    response, error = make_request("DELETE", url)

    if error:
        logging.error(f"Failed to delete channel: {error}")
        return None, error

    logging.info(f"Channel '{channel_id}' deleted successfully from team '{team_id}'")
    return (
        f"Successfully deleted channel {channel_id} from team {team_id}",
        None,
    )  # Return success message


def list_deal_channels(ctx: RunContext):
    """Lists all channels with 'deals' in their name in teams matching the 'NCA SF XXX' pattern."""

    # 1. Find all searcher teams using the naming pattern.
    teams, error = search_teams_by_field(
        ctx, filter_field="displayName", search_string="NCA SF"
    )
    if error:
        print(f"Error searching for teams: {error}")
        return None, error

    searcher_team_ids = [
        team["id"]
        for team in teams
        if "displayName" in team and team["displayName"].startswith("NCA SF")
    ]

    # 2. List channels from multiple teams at once.
    if not searcher_team_ids:
        print("No searcher teams found.")
        return [], None

    all_channels, error = list_channels_from_multiple_teams(
        ctx, team_ids=searcher_team_ids
    )

    print("made it here", all_channels)

    if error:
        print(f"Error listing channels from multiple teams: {error}")
        return None, error

    # 3. Filter for channels with "deals" in their name (case-insensitive).
    deal_channels = []
    for team_id, channels in all_channels.items():
        for channel in channels:
            if "displayName" in channel and "deals" in channel["displayName"].lower():
                deal_channels.append(
                    {
                        "team_id": team_id,
                        "channel_id": channel["id"],
                        "channel_name": channel["displayName"],
                    }
                )

    return deal_channels, None


def list_deal_channels_no_ctx():
    """Lists all channels with 'deals' in their name in teams matching the 'NCA SF XXX' pattern."""

    # 1. Find all searcher teams using the naming pattern.
    teams, error = search_teams_by_field_no_ctx(
        filter_field="displayName", search_string="NCA SF"
    )
    if error:
        print(f"Error searching for teams: {error}")
        return None, error

    searcher_team_ids = [
        team["id"]
        for team in teams
        if "displayName" in team and team["displayName"].startswith("NCA SF")
    ]

    # 2. List channels from multiple teams at once.
    if not searcher_team_ids:
        print("No searcher teams found.")
        return [], None

    all_channels, error = list_channels_from_multiple_teams_no_ctx(
        team_ids=searcher_team_ids
    )

    print("made it here", all_channels)

    if error:
        print(f"Error listing channels from multiple teams: {error}")
        return None, error

    # 3. Filter for channels with "deals" in their name (case-insensitive).
    deal_channels = []
    for team_id, channels in all_channels.items():
        for channel in channels:
            if "displayName" in channel and "deals" in channel["displayName"].lower():
                deal_channels.append(
                    {
                        "team_id": team_id,
                        "channel_id": channel["id"],
                        "channel_name": channel["displayName"],
                    }
                )

    return deal_channels, None

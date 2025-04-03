import json
from pydantic_ai import RunContext
import logging
import time

# from pydantic_ai import agent_tool # Assuming you'll use agent_tool later, but not crucial for this core logic.
from typing import Tuple, Optional, Dict, Any, List
from helpers.RequestHelper import make_request
from ai.depecrated.channel_functions import list_channels, list_channels_no_ctx


## ✅ 1. Create a user
def create_user(
    ctx: RunContext, display_name: str, user_principal_name: str, password: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Creates a new user in Microsoft Azure AD.

        After running this tool, ask the current user if they want to enforce MFA for this user.

    Args:
        display_name (str): The display name for the new user
        user_principal_name (str): The user principal name (email format) for the new user
        password (str): The initial password for the new user

    Returns:
        tuple: (response_data, error) where response_data contains the created user details if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting create_user function for user {display_name}")

    url = "https://graph.microsoft.com/v1.0/users"
    payload = {
        "accountEnabled": True,
        "displayName": display_name,
        "mailNickname": user_principal_name.split("@")[0],
        "userPrincipalName": user_principal_name,
        "passwordProfile": {
            "forceChangePasswordNextSignIn": True,
            "password": password,
        },
    }
    response, error = make_request("POST", url, json_data=payload)
    if error:
        logging.error(f"Failed to create user: {error}")
        end_time = time.time()
        logging.info(
            f"create_user function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(
        f"User '{display_name}' created successfully with ID {response.get('id')}"
    )
    end_time = time.time()
    logging.info(
        f"create_user function completed in {end_time - start_time:.2f} seconds"
    )
    return response, None


def create_user_no_ctx(
    display_name: str, user_principal_name: str, password: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Creates a new user in Microsoft Azure AD.

        After running this tool, ask the current user if they want to enforce MFA for this user.

    Args:
        display_name (str): The display name for the new user
        user_principal_name (str): The user principal name (email format) for the new user
        password (str): The initial password for the new user

    Returns:
        tuple: (response_data, error) where response_data contains the created user details if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting create_user function for user {display_name}")

    url = "https://graph.microsoft.com/v1.0/users"
    payload = {
        "accountEnabled": True,
        "displayName": display_name,
        "mailNickname": user_principal_name.split("@")[0],
        "userPrincipalName": user_principal_name,
        "passwordProfile": {
            "forceChangePasswordNextSignIn": True,
            "password": password,
        },
    }
    response, error = make_request("POST", url, json_data=payload)
    if error:
        logging.error(f"Failed to create user: {error}")
        end_time = time.time()
        logging.info(
            f"create_user function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(
        f"User '{display_name}' created successfully with ID {response.get('id')}"
    )
    end_time = time.time()
    logging.info(
        f"create_user function completed in {end_time - start_time:.2f} seconds"
    )
    return response, None


## ✅ 2. List all users
def list_users(
    ctx: RunContext,
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Lists all users in Microsoft Azure AD.

    Returns:
        tuple: (users_list, error) where users_list contains all users if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info("Starting list_users function")

    url = "https://graph.microsoft.com/v1.0/users"
    all_users = []

    try:
        while url:
            response, error = make_request("GET", url)
            # print("response", response)

            if error:
                logging.error(f"Failed to list users: {error}")
                end_time = time.time()
                logging.info(
                    f"list_users function completed in {end_time - start_time:.2f} seconds"
                )
                return None, error

            users = response.get("value", [])
            all_users.extend(users)
            url = response.get("@odata.nextLink")

        logging.info(f"Successfully retrieved {len(all_users)} users")
        end_time = time.time()
        logging.info(
            f"list_users function completed in {end_time - start_time:.2f} seconds"
        )
        return all_users, None

    except Exception as e:
        logging.exception(f"Error listing users: {e}")
        end_time = time.time()
        logging.info(
            f"list_users function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error listing users", "details": str(e)}


def list_users_no_ctx() -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Lists all users in Microsoft Azure AD.

    Returns:
        tuple: (users_list, error) where users_list contains all users if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info("Starting list_users function")

    url = "https://graph.microsoft.com/v1.0/users"
    all_users = []

    try:
        while url:
            response, error = make_request("GET", url)
            # print("response", response)

            if error:
                logging.error(f"Failed to list users: {error}")
                end_time = time.time()
                logging.info(
                    f"list_users function completed in {end_time - start_time:.2f} seconds"
                )
                return None, error

            users = response.get("value", [])
            all_users.extend(users)
            url = response.get("@odata.nextLink")

        logging.info(f"Successfully retrieved {len(all_users)} users")
        end_time = time.time()
        logging.info(
            f"list_users function completed in {end_time - start_time:.2f} seconds"
        )
        return all_users, None

    except Exception as e:
        logging.exception(f"Error listing users: {e}")
        end_time = time.time()
        logging.info(
            f"list_users function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error listing users", "details": str(e)}


## ✅ 4. Add a user to a team
def add_user_to_team(
    ctx: RunContext, team_id: str, user_email: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Adds a user to an existing Microsoft Team.

    Args:
        team_id (str): The ID of the team to add the user to
        user_email (str): The email address of the user to add

    Returns:
        tuple: (response_data, error) where response_data contains the member addition details if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(
        f"Starting add_user_to_team function for user {user_email} in team {team_id}"
    )

    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/members"
    payload = {
        "@odata.type": "#microsoft.graph.aadUserConversationMember",
        "roles": [],
        "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{user_email}')",
    }

    response, error = make_request("POST", url, json_data=payload)

    if error:
        logging.error(f"Failed to add user to team: {error}")
        end_time = time.time()
        logging.info(
            f"add_user_to_team function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(
        f"User '{user_email}' added to team {team_id} with member ID {response.get('id')}"
    )
    end_time = time.time()
    logging.info(
        f"add_user_to_team function completed in {end_time - start_time:.2f} seconds"
    )
    return response, None


def add_user_to_team_no_ctx(
    team_id: str, user_email: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Adds a user to an existing Microsoft Team.

    Args:
        team_id (str): The ID of the team to add the user to
        user_email (str): The email address of the user to add

    Returns:
        tuple: (response_data, error) where response_data contains the member addition details if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(
        f"Starting add_user_to_team function for user {user_email} in team {team_id}"
    )

    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/members"
    payload = {
        "@odata.type": "#microsoft.graph.aadUserConversationMember",
        "roles": [],
        "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{user_email}')",
    }

    response, error = make_request("POST", url, json_data=payload)

    if error:
        logging.error(f"Failed to add user to team: {error}")
        end_time = time.time()
        logging.info(
            f"add_user_to_team function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(
        f"User '{user_email}' added to team {team_id} with member ID {response.get('id')}"
    )
    end_time = time.time()
    logging.info(
        f"add_user_to_team function completed in {end_time - start_time:.2f} seconds"
    )
    return response, None


## ✅ 7. Search for users
def search_users(
    ctx: RunContext, search_string: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Searches for users whose display name contains the search string.

    Args:
        search_string (str): The string to search for in user properties

    Returns:
        tuple: (users_list, error) where users_list contains matching users if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting search_users function with search string: {search_string}")

    url = f"https://graph.microsoft.com/v1.0/users?$filter=startsWith(displayName, '{search_string}')"
    all_users = []
    try:
        while url:
            response, error = make_request("GET", url)

            if error:
                logging.error(f"Failed to search users: {error}")
                end_time = time.time()
                logging.info(
                    f"search_users function completed in {end_time - start_time:.2f} seconds"
                )
                return None, error

            users = response.get("value", [])
            all_users.extend(users)
            url = response.get("@odata.nextLink")

        logging.info(
            f"Found {len(all_users)} users matching '{search_string}' in field 'displayName'"
        )
        end_time = time.time()
        logging.info(
            f"search_users function completed in {end_time - start_time:.2f} seconds"
        )
        return all_users, None
    except Exception as e:
        logging.exception(f"Error searching users: {e}")
        end_time = time.time()
        logging.info(
            f"search_users function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error searching users", "details": str(e)}


def search_users_no_ctx(
    search_string: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Searches for users whose display name contains the search string.

    Args:
        search_string (str): The string to search for in user properties

    Returns:
        tuple: (users_list, error) where users_list contains matching users if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting search_users function with search string: {search_string}")

    url = f"https://graph.microsoft.com/v1.0/users?$filter=startsWith(displayName, '{search_string}')"
    all_users = []
    try:
        while url:
            response, error = make_request("GET", url)

            if error:
                logging.error(f"Failed to search users: {error}")
                end_time = time.time()
                logging.info(
                    f"search_users function completed in {end_time - start_time:.2f} seconds"
                )
                return None, error

            users = response.get("value", [])
            all_users.extend(users)
            url = response.get("@odata.nextLink")

        logging.info(
            f"Found {len(all_users)} users matching '{search_string}' in field 'displayName'"
        )
        end_time = time.time()
        logging.info(
            f"search_users function completed in {end_time - start_time:.2f} seconds"
        )
        return all_users, None
    except Exception as e:
        logging.exception(f"Error searching users: {e}")
        end_time = time.time()
        logging.info(
            f"search_users function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error searching users", "details": str(e)}


def search_users_by_field(
    ctx: RunContext, search_string: str, filter_field: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Searches for users whose display name contains the search string.

    Args:
        search_string (str): The string to search for in user properties
        filter_field (str, optional):
            - displayName: The name displayed in the address book, default to this if not specified
            - givenName: The user's first name
            - surname: The user's last name
            - mail: The user's email address
            - userPrincipalName: The principal name used to sign in
            - jobTitle: The user's job title
            - mobilePhone: The user's mobile phone number
            - officeLocation: The user's office location

    Returns:
        tuple: (users_list, error) where users_list contains matching users if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(
        f"Starting search_users_by_field function with search string: {search_string} in field: {filter_field}"
    )

    all_users = []
    url = "https://graph.microsoft.com/v1.0/users"

    while url:
        response, error = make_request("GET", url)

        if error:
            logging.error(f"Failed to search users: {error}")
            end_time = time.time()
            logging.info(
                f"search_users_by_field function completed in {end_time - start_time:.2f} seconds"
            )
            return None, error

        if response:
            users = response.get("value", [])
            all_users.extend(users)
            url = response.get("@odata.nextLink")
        else:
            url = None

    filtered_users = [
        user
        for user in all_users
        if search_string.lower() in str(user.get(filter_field, "")).lower()
    ]
    logging.info(
        f"Found {len(filtered_users)} users matching '{search_string}' in field '{filter_field}'"
    )
    end_time = time.time()
    logging.info(
        f"search_users_by_field function completed in {end_time - start_time:.2f} seconds"
    )
    return filtered_users, None


def search_users_by_field_no_ctx(
    search_string: str, filter_field: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Searches for users whose display name contains the search string.

    Args:
        search_string (str): The string to search for in user properties
        filter_field (str, optional):
            - displayName: The name displayed in the address book, default to this if not specified
            - givenName: The user's first name
            - surname: The user's last name
            - mail: The user's email address
            - userPrincipalName: The principal name used to sign in
            - jobTitle: The user's job title
            - mobilePhone: The user's mobile phone number
            - officeLocation: The user's office location

    Returns:
        tuple: (users_list, error) where users_list contains matching users if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(
        f"Starting search_users_by_field function with search string: {search_string} in field: {filter_field}"
    )

    all_users = []
    url = "https://graph.microsoft.com/v1.0/users"

    while url:
        response, error = make_request("GET", url)

        if error:
            logging.error(f"Failed to search users: {error}")
            end_time = time.time()
            logging.info(
                f"search_users_by_field function completed in {end_time - start_time:.2f} seconds"
            )
            return None, error

        if response:
            users = response.get("value", [])
            all_users.extend(users)
            url = response.get("@odata.nextLink")
        else:
            url = None

    filtered_users = [
        user
        for user in all_users
        if search_string.lower() in str(user.get(filter_field, "")).lower()
    ]
    logging.info(
        f"Found {len(filtered_users)} users matching '{search_string}' in field '{filter_field}'"
    )
    end_time = time.time()
    logging.info(
        f"search_users_by_field function completed in {end_time - start_time:.2f} seconds"
    )
    return filtered_users, None


## ✅ 8. Get details for a specific user by their ID or userPrincipalName.
def get_user(
    ctx: RunContext, user_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Gets details for a specific user by their ID or userPrincipalName.

    Args:
        user_id (str): The user's ID or userPrincipalName

    Returns:
        tuple: (user_data, error) where user_data contains the user details if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting get_user function for user ID: {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    response, error = make_request("GET", url)

    if error:
        logging.error(f"Failed to get user: {error}")
        end_time = time.time()
        logging.info(
            f"get_user function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(
        f"Successfully retrieved details for user {response.get('displayName')} ({user_id})"
    )
    end_time = time.time()
    logging.info(f"get_user function completed in {end_time - start_time:.2f} seconds")
    return response, None


def get_user_no_ctx(
    user_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Gets details for a specific user by their ID or userPrincipalName.

    Args:
        user_id (str): The user's ID or userPrincipalName

    Returns:
        tuple: (user_data, error) where user_data contains the user details if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting get_user function for user ID: {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    response, error = make_request("GET", url)

    if error:
        logging.error(f"Failed to get user: {error}")
        end_time = time.time()
        logging.info(
            f"get_user function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(
        f"Successfully retrieved details for user {response.get('displayName')} ({user_id})"
    )
    end_time = time.time()
    logging.info(f"get_user function completed in {end_time - start_time:.2f} seconds")
    return response, None


# make tools for update user display name, job title, and email all separate tools
def update_user_display_name(
    ctx: RunContext, user_id: str, display_name: str
) -> Tuple[None, Optional[Dict[str, Any]]]:
    """Updates a user's display name.

    Args:
        user_id (str): The user's ID or userPrincipalName
        display_name (str): The new display name for the user

    Returns:
        tuple: (None, error) where error is None if successful or contains error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting update_user_display_name function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    updates = {"displayName": display_name}

    response, error = make_request("PATCH", url, json_data=updates)

    if error:
        logging.error(f"Failed to update user display name: {error}")
        end_time = time.time()
        logging.info(
            f"update_user_display_name function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(
        f"Display name for user '{user_id}' updated successfully to '{display_name}'"
    )
    end_time = time.time()
    logging.info(
        f"update_user_display_name function completed in {end_time - start_time:.2f} seconds"
    )
    return None, None


def update_user_display_name_no_ctx(
    user_id: str, display_name: str
) -> Tuple[None, Optional[Dict[str, Any]]]:
    """Updates a user's display name.

    Args:
        user_id (str): The user's ID or userPrincipalName
        display_name (str): The new display name for the user

    Returns:
        tuple: (None, error) where error is None if successful or contains error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting update_user_display_name function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    updates = {"displayName": display_name}

    response, error = make_request("PATCH", url, json_data=updates)

    if error:
        logging.error(f"Failed to update user display name: {error}")
        end_time = time.time()
        logging.info(
            f"update_user_display_name function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(
        f"Display name for user '{user_id}' updated successfully to '{display_name}'"
    )
    end_time = time.time()
    logging.info(
        f"update_user_display_name function completed in {end_time - start_time:.2f} seconds"
    )
    return None, None


def update_user_job_title(
    ctx: RunContext, user_id: str, job_title: str
) -> Tuple[None, Optional[Dict[str, Any]]]:
    """Updates a user's job title.

    Args:
        user_id (str): The user's ID or userPrincipalName
        job_title (str): The new job title for the user

    Returns:
        tuple: (None, error) where error is None if successful or contains error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting update_user_job_title function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    updates = {"jobTitle": job_title}

    response, error = make_request("PATCH", url, json_data=updates)

    if error:
        logging.error(f"Failed to update user job title: {error}")
        end_time = time.time()
        logging.info(
            f"update_user_job_title function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(
        f"Job title for user '{user_id}' updated successfully to '{job_title}'"
    )
    end_time = time.time()
    logging.info(
        f"update_user_job_title function completed in {end_time - start_time:.2f} seconds"
    )
    return None, None


def update_user_job_title_no_ctx(
    user_id: str, job_title: str
) -> Tuple[None, Optional[Dict[str, Any]]]:
    """Updates a user's job title.

    Args:
        user_id (str): The user's ID or userPrincipalName
        job_title (str): The new job title for the user

    Returns:
        tuple: (None, error) where error is None if successful or contains error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting update_user_job_title function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    updates = {"jobTitle": job_title}

    response, error = make_request("PATCH", url, json_data=updates)

    if error:
        logging.error(f"Failed to update user job title: {error}")
        end_time = time.time()
        logging.info(
            f"update_user_job_title function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(
        f"Job title for user '{user_id}' updated successfully to '{job_title}'"
    )
    end_time = time.time()
    logging.info(
        f"update_user_job_title function completed in {end_time - start_time:.2f} seconds"
    )
    return None, None


def update_user_email(
    ctx: RunContext, user_id: str, email: str
) -> Tuple[None, Optional[Dict[str, Any]]]:
    """Updates a user's email address.

    Args:
        user_id (str): The user's ID or userPrincipalName
        email (str): The new email address for the user

    Returns:
        tuple: (None, error) where error is None if successful or contains error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting update_user_email function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    updates = {"mail": email, "userPrincipalName": email}

    response, error = make_request("PATCH", url, json_data=updates)

    if error:
        logging.error(f"Failed to update user email: {error}")
        end_time = time.time()
        logging.info(
            f"update_user_email function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(f"Email for user '{user_id}' updated successfully to '{email}'")
    end_time = time.time()
    logging.info(
        f"update_user_email function completed in {end_time - start_time:.2f} seconds"
    )
    return None, None


def update_user_email_no_ctx(
    user_id: str, email: str
) -> Tuple[None, Optional[Dict[str, Any]]]:
    """Updates a user's email address.

    Args:
        user_id (str): The user's ID or userPrincipalName
        email (str): The new email address for the user

    Returns:
        tuple: (None, error) where error is None if successful or contains error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting update_user_email function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    updates = {"mail": email, "userPrincipalName": email}

    response, error = make_request("PATCH", url, json_data=updates)

    if error:
        logging.error(f"Failed to update user email: {error}")
        end_time = time.time()
        logging.info(
            f"update_user_email function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(f"Email for user '{user_id}' updated successfully to '{email}'")
    end_time = time.time()
    logging.info(
        f"update_user_email function completed in {end_time - start_time:.2f} seconds"
    )
    return None, None


## ✅ 10. Delete a user
def delete_user(
    ctx: RunContext, user_id: str
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Deletes a user from Microsoft Azure AD.

    Args:
        user_id (str): The user's ID or userPrincipalName

    Returns:
        tuple: (success_message, error) where success_message indicates successful deletion
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting delete_user function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    response, error = make_request("DELETE", url)

    if error:
        logging.error(f"Failed to delete user: {error}")
        end_time = time.time()
        logging.info(
            f"delete_user function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(f"User '{user_id}' deleted successfully")
    end_time = time.time()
    logging.info(
        f"delete_user function completed in {end_time - start_time:.2f} seconds"
    )
    return f"Successfully deleted user {user_id}", None  # Return success message


def delete_user_no_ctx(
    user_id: str
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Deletes a user from Microsoft Azure AD.

    Args:
        user_id (str): The user's ID or userPrincipalName

    Returns:
        tuple: (success_message, error) where success_message indicates successful deletion
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(f"Starting delete_user function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    response, error = make_request("DELETE", url)

    if error:
        logging.error(f"Failed to delete user: {error}")
        end_time = time.time()
        logging.info(
            f"delete_user function completed in {end_time - start_time:.2f} seconds"
        )
        return None, error

    logging.info(f"User '{user_id}' deleted successfully")
    end_time = time.time()
    logging.info(
        f"delete_user function completed in {end_time - start_time:.2f} seconds"
    )
    return f"Successfully deleted user {user_id}", None  # Return success message


def get_user_teams(
    ctx: RunContext, user_id: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Retrieves all Microsoft Teams that a user is a member of.

    Args:
        user_id (str): The user's ID or userPrincipalName.

    Returns:
        tuple: A tuple containing:
            - A list of team details if successful, None if failed
            - An error dictionary if an error occurred, or None if successful.
    """
    start_time = time.time()
    logging.info(f"Starting get_user_teams function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/joinedTeams"
    all_teams = []

    try:
        while url:
            response, error = make_request("GET", url)

            if error:
                logging.error(f"Failed to get teams for user {user_id}: {error}")
                end_time = time.time()
                logging.info(
                    f"get_user_teams function completed in {end_time - start_time:.2f} seconds"
                )
                return None, error

            teams = response.get("value", [])
            all_teams.extend(teams)
            url = response.get("@odata.nextLink")

        logging.info(f"Found user {user_id} in {len(all_teams)} teams")
        end_time = time.time()
        logging.info(
            f"get_user_teams function completed in {end_time - start_time:.2f} seconds"
        )
        return all_teams, None

    except Exception as e:
        logging.exception(f"Error getting teams for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"get_user_teams function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error getting user teams", "details": str(e)}


def get_user_teams_no_ctx(
    user_id: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Retrieves all Microsoft Teams that a user is a member of.

    Args:
        user_id (str): The user's ID or userPrincipalName.

    Returns:
        tuple: A tuple containing:
            - A list of team details if successful, None if failed
            - An error dictionary if an error occurred, or None if successful.
    """
    start_time = time.time()
    logging.info(f"Starting get_user_teams function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/joinedTeams"
    all_teams = []

    try:
        while url:
            response, error = make_request("GET", url)

            if error:
                logging.error(f"Failed to get teams for user {user_id}: {error}")
                end_time = time.time()
                logging.info(
                    f"get_user_teams function completed in {end_time - start_time:.2f} seconds"
                )
                return None, error

            teams = response.get("value", [])
            all_teams.extend(teams)
            url = response.get("@odata.nextLink")

        logging.info(f"Found user {user_id} in {len(all_teams)} teams")
        end_time = time.time()
        logging.info(
            f"get_user_teams function completed in {end_time - start_time:.2f} seconds"
        )
        return all_teams, None

    except Exception as e:
        logging.exception(f"Error getting teams for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"get_user_teams function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error getting user teams", "details": str(e)}


def get_user_channels(
    ctx: RunContext, user_id: str
) -> Tuple[Optional[Dict[str, List[Dict[str, Any]]]], Optional[Dict[str, Any]]]:
    """
    Retrieves all channels in teams that a user is a member of.
    Args:
        ctx (RunContext): The context for running the function, handling state and configuration.
        user_id (str): The user's ID or userPrincipalName.
    Returns:
        tuple: A tuple containing:
            - A dictionary mapping team_id to list of channel details if successful, None if failed
            - An error dictionary if an error occurred, or None if successful.
    """
    start_time = time.time()
    logging.info(f"Starting get_user_channels function for user {user_id}")

    user_teams, teams_error = get_user_teams(ctx, user_id)

    if teams_error:
        end_time = time.time()
        logging.info(
            f"get_user_channels function completed in {end_time - start_time:.2f} seconds"
        )
        return None, teams_error

    user_channels = {}
    errors = []

    for team in user_teams:
        team_id = team["id"]
        channels, channels_error = list_channels(ctx, team_id)
        if channels_error:
            logging.warning(
                f"Error getting channels for team {team_id}: {channels_error}"
            )
            errors.append({team_id: channels_error})
            continue  # Proceed to the next team
        user_channels[team_id] = channels

    logging.info(
        f"Retrieved channels for {len(user_channels)} teams for user {user_id}"
    )
    end_time = time.time()
    logging.info(
        f"get_user_channels function completed in {end_time - start_time:.2f} seconds"
    )
    return user_channels, None if not errors else {"errors": errors}


def get_user_channels_no_ctx(
    user_id: str
) -> Tuple[Optional[Dict[str, List[Dict[str, Any]]]], Optional[Dict[str, Any]]]:
    """
    Retrieves all channels in teams that a user is a member of.
    Args:
        user_id (str): The user's ID or userPrincipalName.
    Returns:
        tuple: A tuple containing:
            - A dictionary mapping team_id to list of channel details if successful, None if failed
            - An error dictionary if an error occurred, or None if successful.
    """
    start_time = time.time()
    logging.info(f"Starting get_user_channels function for user {user_id}")

    user_teams, teams_error = get_user_teams_no_ctx(user_id)

    if teams_error:
        end_time = time.time()
        logging.info(
            f"get_user_channels function completed in {end_time - start_time:.2f} seconds"
        )
        return None, teams_error

    user_channels = {}
    errors = []

    for team in user_teams:
        team_id = team["id"]
        channels, channels_error = list_channels_no_ctx(team_id)
        if channels_error:
            logging.warning(
                f"Error getting channels for team {team_id}: {channels_error}"
            )
            errors.append({team_id: channels_error})
            continue  # Proceed to the next team
        user_channels[team_id] = channels

    logging.info(
        f"Retrieved channels for {len(user_channels)} teams for user {user_id}"
    )
    end_time = time.time()
    logging.info(
        f"get_user_channels function completed in {end_time - start_time:.2f} seconds"
    )
    return user_channels, None if not errors else {"errors": errors}


def get_user_licenses(
    ctx: RunContext, user_id: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Retrieves all license details for a specific user from Microsoft Graph.

    Args:
    ctx (RunContext): The context containing configuration and state.
    user_id (str): The user's ID or userPrincipalName.

    Returns:
    tuple: (licenses_list, error). licenses_list is a list of license details if successful,
    or None and the error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting get_user_licenses function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/licenseDetails"
    all_licenses = []

    try:
        while url:
            response, error = make_request("GET", url)
            if error:
                logging.error(
                    f"Failed to get license details for user {user_id}: {error}"
                )
                end_time = time.time()
                logging.info(
                    f"get_user_licenses function completed in {end_time - start_time:.2f} seconds"
                )
                return response, error

            licenses = response.get("value", [])
            all_licenses.extend(licenses)
            url = response.get("@odata.nextLink")

        logging.info(
            f"Successfully retrieved {len(all_licenses)} license entries for user {user_id}"
        )
        end_time = time.time()
        logging.info(
            f"get_user_licenses function completed in {end_time - start_time:.2f} seconds"
        )
        return all_licenses, None
    except Exception as e:
        logging.exception(
            f"Unexpected error retrieving license details for user {user_id}: {e}"
        )
        end_time = time.time()
        logging.info(
            f"get_user_licenses function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {
            "error": "Unexpected error retrieving license details",
            "details": str(e),
        }


def get_user_licenses_no_ctx(
    user_id: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Retrieves all license details for a specific user from Microsoft Graph.

    Args:
    user_id (str): The user's ID or userPrincipalName.

    Returns:
    tuple: (licenses_list, error). licenses_list is a list of license details if successful,
    or None and the error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting get_user_licenses function for user {user_id}")

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/licenseDetails"
    all_licenses = []

    try:
        while url:
            response, error = make_request("GET", url)
            if error:
                logging.error(
                    f"Failed to get license details for user {user_id}: {error}"
                )
                end_time = time.time()
                logging.info(
                    f"get_user_licenses function completed in {end_time - start_time:.2f} seconds"
                )
                return response, error

            licenses = response.get("value", [])
            all_licenses.extend(licenses)
            url = response.get("@odata.nextLink")

        logging.info(
            f"Successfully retrieved {len(all_licenses)} license entries for user {user_id}"
        )
        end_time = time.time()
        logging.info(
            f"get_user_licenses function completed in {end_time - start_time:.2f} seconds"
        )
        return all_licenses, None
    except Exception as e:
        logging.exception(
            f"Unexpected error retrieving license details for user {user_id}: {e}"
        )
        end_time = time.time()
        logging.info(
            f"get_user_licenses function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {
            "error": "Unexpected error retrieving license details",
            "details": str(e),
        }


def list_available_licenses(
    ctx: RunContext,
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Retrieves all available licenses (subscribed SKUs) from Microsoft Graph.

    Args:
        ctx (RunContext): The context containing configuration and state.

    Returns:
        tuple: (licenses_list, error) where licenses_list is a list of license details
        if successful, or None and error details if failed.
    """
    start_time = time.time()
    logging.info("Starting list_available_licenses function")

    url = "https://graph.microsoft.com/v1.0/subscribedSkus"
    all_licenses = []

    try:
        while url:
            response, error = make_request("GET", url)
            if error:
                logging.error(f"Failed to list available licenses: {error}")
                end_time = time.time()
                logging.info(
                    f"list_available_licenses function completed in {end_time - start_time:.2f} seconds"
                )
                return None, error

            licenses = response.get("value", [])
            all_licenses.extend(licenses)
            url = response.get("@odata.nextLink")

        logging.info(f"Successfully retrieved {len(all_licenses)} available licenses")
        end_time = time.time()
        logging.info(
            f"list_available_licenses function completed in {end_time - start_time:.2f} seconds"
        )
        return all_licenses, None
    except Exception as e:
        logging.exception(f"Unexpected error listing available licenses: {e}")
        end_time = time.time()
        logging.info(
            f"list_available_licenses function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {
            "error": "Unexpected error listing available licenses",
            "details": str(e),
        }


def list_available_licenses_no_ctx() -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Retrieves all available licenses (subscribed SKUs) from Microsoft Graph.

    Returns:
        tuple: (licenses_list, error) where licenses_list is a list of license details
        if successful, or None and error details if failed.
    """
    start_time = time.time()
    logging.info("Starting list_available_licenses function")

    url = "https://graph.microsoft.com/v1.0/subscribedSkus"
    all_licenses = []

    try:
        while url:
            response, error = make_request("GET", url)
            if error:
                logging.error(f"Failed to list available licenses: {error}")
                end_time = time.time()
                logging.info(
                    f"list_available_licenses function completed in {end_time - start_time:.2f} seconds"
                )
                return None, error

            licenses = response.get("value", [])
            all_licenses.extend(licenses)
            url = response.get("@odata.nextLink")

        logging.info(f"Successfully retrieved {len(all_licenses)} available licenses")
        end_time = time.time()
        logging.info(
            f"list_available_licenses function completed in {end_time - start_time:.2f} seconds"
        )
        return all_licenses, None
    except Exception as e:
        logging.exception(f"Unexpected error listing available licenses: {e}")
        end_time = time.time()
        logging.info(
            f"list_available_licenses function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {
            "error": "Unexpected error listing available licenses",
            "details": str(e),
        }


def add_license_to_user(
    ctx: RunContext, user_id: str, sku_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Assigns a license to a user using Microsoft Graph.
    If unable to add license then give the user this link to link them to the right page
    https://admin.microsoft.com/#/users/:/UserDetails/{user_id}/LicensesAndApps

    Args:
        ctx (RunContext): The context containing configuration and state.
        user_id (str): The user's ID or userPrincipalName.
        sku_id (str): The SKU ID representing the license to be added.

    Returns:
        tuple: (response, error) where response is the result of the license assignment
        if successful, or None and error details if failed.
    """
    start_time = time.time()
    logging.info(
        f"Starting add_license_to_user function for user {user_id} with SKU {sku_id}"
    )

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/assignLicense"
    payload = {
        "addLicenses": [
            {
                "disabledPlans": [],
                "skuId": sku_id,
            }
        ],
        "removeLicenses": [],
    }

    try:
        response, error = make_request("POST", url, json_data=payload)
        if error:
            logging.error(
                f"Failed to assign license {sku_id} to user {user_id}: {error}"
            )
            end_time = time.time()
            logging.info(
                f"add_license_to_user function completed in {end_time - start_time:.2f} seconds"
            )
            # print("response", response, error)
            if response:
                return response, error
            return None, error

        logging.info(f"Successfully assigned license {sku_id} to user {user_id}")
        end_time = time.time()
        logging.info(
            f"add_license_to_user function completed in {end_time - start_time:.2f} seconds"
        )
        return response, None
    except Exception as e:
        logging.exception(
            f"Unexpected error assigning license {sku_id} to user {user_id}: {e}"
        )
        end_time = time.time()
        logging.info(
            f"add_license_to_user function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error assigning license", "details": str(e)}


def add_license_to_user_no_ctx(
    user_id: str, sku_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Assigns a license to a user using Microsoft Graph.
    If unable to add license then give the user this link to link them to the right page
    https://admin.microsoft.com/#/users/:/UserDetails/{user_id}/LicensesAndApps

    Args:
        user_id (str): The user's ID or userPrincipalName.
        sku_id (str): The SKU ID representing the license to be added.

    Returns:
        tuple: (response, error) where response is the result of the license assignment
        if successful, or None and error details if failed.
    """
    start_time = time.time()
    logging.info(
        f"Starting add_license_to_user function for user {user_id} with SKU {sku_id}"
    )

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/assignLicense"
    payload = {
        "addLicenses": [
            {
                "disabledPlans": [],
                "skuId": sku_id,
            }
        ],
        "removeLicenses": [],
    }

    try:
        response, error = make_request("POST", url, json_data=payload)
        if error:
            logging.error(
                f"Failed to assign license {sku_id} to user {user_id}: {error}"
            )
            end_time = time.time()
            logging.info(
                f"add_license_to_user function completed in {end_time - start_time:.2f} seconds"
            )
            # print("response", response, error)
            if response:
                return response, error
            return None, error

        logging.info(f"Successfully assigned license {sku_id} to user {user_id}")
        end_time = time.time()
        logging.info(
            f"add_license_to_user function completed in {end_time - start_time:.2f} seconds"
        )
        return response, None
    except Exception as e:
        logging.exception(
            f"Unexpected error assigning license {sku_id} to user {user_id}: {e}"
        )
        end_time = time.time()
        logging.info(
            f"add_license_to_user function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error assigning license", "details": str(e)}


def remove_license_from_user(
    ctx: RunContext, user_id: str, sku_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Removes a license from a user using Microsoft Graph.

    Args:
        ctx (RunContext): The context containing configuration and state.
        user_id (str): The user's ID or userPrincipalName.
        sku_id (str): The SKU ID representing the license to be removed.

    Returns:
        tuple: (response, error) where response is the result of the license removal

        if successful, or None and error details if failed.
    """
    start_time = time.time()
    logging.info(
        f"Starting remove_license_from_user function for user {user_id} with SKU {sku_id}"
    )

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/assignLicense"
    payload = {"addLicenses": [], "removeLicenses": [sku_id]}

    try:
        response, error = make_request("POST", url, json_data=payload)
        if error:
            logging.error(
                f"Failed to remove license {sku_id} from user {user_id}: {error}"
            )
            return None, error

        logging.info(f"Successfully removed license {sku_id} from user {user_id}")
        end_time = time.time()
        logging.info(
            f"remove_license_from_user function completed in {end_time - start_time:.2f} seconds"
        )
        # print("response", response, error)
        if response:
            return response, None
        return None, error
    except Exception as e:
        logging.exception(
            f"Unexpected error removing license {sku_id} from user {user_id}: {e}"
        )
        end_time = time.time()
        logging.info(
            f"remove_license_from_user function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error removing license", "details": str(e)}


def remove_license_from_user_no_ctx(
    user_id: str, sku_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Removes a license from a user using Microsoft Graph.

    Args:
        user_id (str): The user's ID or userPrincipalName.
        sku_id (str): The SKU ID representing the license to be removed.

    Returns:
        tuple: (response, error) where response is the result of the license removal

        if successful, or None and error details if failed.
    """
    start_time = time.time()
    logging.info(
        f"Starting remove_license_from_user function for user {user_id} with SKU {sku_id}"
    )

    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/assignLicense"
    payload = {"addLicenses": [], "removeLicenses": [sku_id]}

    try:
        response, error = make_request("POST", url, json_data=payload)
        if error:
            logging.error(
                f"Failed to remove license {sku_id} from user {user_id}: {error}"
            )
            return None, error

        logging.info(f"Successfully removed license {sku_id} from user {user_id}")
        end_time = time.time()
        logging.info(
            f"remove_license_from_user function completed in {end_time - start_time:.2f} seconds"
        )
        # print("response", response, error)
        if response:
            return response, None
        return None, error
    except Exception as e:
        logging.exception(
            f"Unexpected error removing license {sku_id} from user {user_id}: {e}"
        )
        end_time = time.time()
        logging.info(
            f"remove_license_from_user function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error removing license", "details": str(e)}


def set_user_usage_location(
    ctx: RunContext, user_id: str, usage_location: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Sets the usage location for a user in Azure AD.

    Args:
        ctx (RunContext): The context containing configuration and state.
        user_id (str): The user's ID or userPrincipalName.
        usage_location (str): The ISO 3166-1 alpha-2 country code representing the usage location.

    Returns:
        tuple: (response, error) where response is the result of the update if successful,
        or None and error details if failed.
    """
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    payload = {"usageLocation": usage_location}

    try:
        # Assuming make_request is a helper function that sends PATCH requests
        response, error = make_request("PATCH", url, json_data=payload)
        if error:
            logging.error(f"Failed to set usage location for user {user_id}: {error}")
            if response:
                return response, error
            return None, error

        logging.info(
            f"Successfully set usage location for user {user_id} to {usage_location}"
        )
        return response, None
    except Exception as e:
        logging.exception(
            f"Unexpected error setting usage location for user {user_id}: {e}"
        )
        return None, {
            "error": "Unexpected error setting usage location",
            "details": str(e),
        }


def set_user_usage_location_no_ctx(
    user_id: str, usage_location: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Sets the usage location for a user in Azure AD.

    Args:
        user_id (str): The user's ID or userPrincipalName.
        usage_location (str): The ISO 3166-1 alpha-2 country code representing the usage location.

    Returns:
        tuple: (response, error) where response is the result of the update if successful,
        or None and error details if failed.
    """
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    payload = {"usageLocation": usage_location}

    try:
        # Assuming make_request is a helper function that sends PATCH requests
        response, error = make_request("PATCH", url, json_data=payload)
        if error:
            logging.error(f"Failed to set usage location for user {user_id}: {error}")
            if response:
                return response, error
            return None, error

        logging.info(
            f"Successfully set usage location for user {user_id} to {usage_location}"
        )
        return response, None
    except Exception as e:
        logging.exception(
            f"Unexpected error setting usage location for user {user_id}: {e}"
        )
        return None, {
            "error": "Unexpected error setting usage location",
            "details": str(e),
        }


def enforce_mfa_for_user(
    ctx: RunContext, user_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Enforces Multi-Factor Authentication (MFA) for a user in Azure AD.
    
    Args:
        ctx (RunContext): The context containing configuration and state.
        user_id (str): The user's ID or userPrincipalName.
        
    Returns:
        tuple: (response, error) where response is the result of the operation if successful,
        or None and error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting enable_and_enforce_mfa function for user {user_id}")
    
    try:
        # Enable MFA for the user using the beta endpoint
        mfa_url = f"https://graph.microsoft.com/beta/users/{user_id}/authentication/requirements"
        mfa_payload = {
            "perUserMfaState": "enforced"
        }
        
        mfa_response, mfa_error = make_request("PATCH", mfa_url, json_data=mfa_payload)
        

        if mfa_error:
            logging.error(f"Failed to enable MFA for user {user_id}: {mfa_error}")
            end_time = time.time()
            logging.info(
                f"enable_and_enforce_mfa function completed in {end_time - start_time:.2f} seconds"
            )
            return None, mfa_error
        
        logging.info(f"Successfully enabled MFA for user {user_id}")
        end_time = time.time()
        logging.info(
            f"enable_and_enforce_mfa function completed in {end_time - start_time:.2f} seconds"
        )
        
        return mfa_response, None
    except Exception as e:
        logging.exception(f"Unexpected error enabling MFA for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"enable_and_enforce_mfa function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error enabling MFA", "details": str(e)}


def enforce_mfa_for_user_no_ctx(
    user_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Enforces Multi-Factor Authentication (MFA) for a user in Azure AD.
    
    Args:
        user_id (str): The user's ID or userPrincipalName.
        
    Returns:
        tuple: (response, error) where response is the result of the operation if successful,
        or None and error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting enable_and_enforce_mfa function for user {user_id}")
    
    try:
        # Enable MFA for the user using the beta endpoint
        mfa_url = f"https://graph.microsoft.com/beta/users/{user_id}/authentication/requirements"
        mfa_payload = {
            "perUserMfaState": "enforced"
        }
        
        mfa_response, mfa_error = make_request("PATCH", mfa_url, json_data=mfa_payload)
        

        if mfa_error:
            logging.error(f"Failed to enable MFA for user {user_id}: {mfa_error}")
            end_time = time.time()
            logging.info(
                f"enable_and_enforce_mfa function completed in {end_time - start_time:.2f} seconds"
            )
            return None, mfa_error
        
        logging.info(f"Successfully enabled MFA for user {user_id}")
        end_time = time.time()
        logging.info(
            f"enable_and_enforce_mfa function completed in {end_time - start_time:.2f} seconds"
        )
        
        return mfa_response, None
    except Exception as e:
        logging.exception(f"Unexpected error enabling MFA for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"enable_and_enforce_mfa function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error enabling MFA", "details": str(e)}


def reset_user_password(
    ctx: RunContext, user_id: str, new_password: str, force_change_password_next_sign_in: bool = True
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Resets a user's password using Microsoft Graph API.
    
    Args:
        ctx (RunContext): The context containing configuration and state.
        user_id (str): The user's ID or userPrincipalName.
        new_password (str): The new password to set.
        force_change_password_next_sign_in (bool): Whether to force password change on next sign in.
        
    Returns:
        tuple: (response, error) where response is the result of the password reset if successful,
        or None and error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting reset_user_password function for user {user_id}")
    
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    payload = {
        "passwordProfile": {
            "password": new_password,
            "forceChangePasswordNextSignIn": force_change_password_next_sign_in
        }
    }
    
    try:
        response, error = make_request("PATCH", url, json_data=payload)

        ##print response in full nice json format
        print("response", json.dumps(response, indent=2))
        
        if error:
            logging.error(f"Failed to reset password for user {user_id}: {error}")
            end_time = time.time()
            logging.info(
                f"reset_user_password function completed in {end_time - start_time:.2f} seconds"
            )
            return None, error
        
        logging.info(f"Successfully reset password for user {user_id}")
        end_time = time.time()
        logging.info(
            f"reset_user_password function completed in {end_time - start_time:.2f} seconds"
        )
        
        return response, None
    except Exception as e:
        logging.exception(f"Unexpected error resetting password for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"reset_user_password function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error resetting password", "details": str(e)}


def reset_user_password_no_ctx(
    user_id: str, new_password: str, force_change_password_next_sign_in: bool = True
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Resets a user's password using Microsoft Graph API.
    
    Args:
        user_id (str): The user's ID or userPrincipalName.
        new_password (str): The new password to set.
        force_change_password_next_sign_in (bool): Whether to force password change on next sign in.
        
    Returns:
        tuple: (response, error) where response is the result of the password reset if successful,
        or None and error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting reset_user_password function for user {user_id}")
    
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    payload = {
        "passwordProfile": {
            "password": new_password,
            "forceChangePasswordNextSignIn": force_change_password_next_sign_in
        }
    }
    
    try:
        response, error = make_request("PATCH", url, json_data=payload)

        ##print response in full nice json format
        print("response", json.dumps(response, indent=2))
        
        if error:
            logging.error(f"Failed to reset password for user {user_id}: {error}")
            end_time = time.time()
            logging.info(
                f"reset_user_password function completed in {end_time - start_time:.2f} seconds"
            )
            return None, error
        
        logging.info(f"Successfully reset password for user {user_id}")
        end_time = time.time()
        logging.info(
            f"reset_user_password function completed in {end_time - start_time:.2f} seconds"
        )
        
        return response, None
    except Exception as e:
        logging.exception(f"Unexpected error resetting password for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"reset_user_password function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error resetting password", "details": str(e)}


def get_user_password_methods(
    ctx: RunContext, user_id: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Retrieves all password methods for a user from Microsoft Graph API.
    
    Args:
        ctx (RunContext): The context containing configuration and state.
        user_id (str): The user's ID or userPrincipalName.
        
    Returns:
        tuple: (password_methods, error) where password_methods is a list of password method details
        if successful, or None and error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting get_user_password_methods function for user {user_id}")
    
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/authentication/passwordMethods"
    all_methods = []
    
    try:
        while url:
            response, error = make_request("GET", url)
            
            if error:
                logging.error(f"Failed to get password methods for user {user_id}: {error}")
                end_time = time.time()
                logging.info(
                    f"get_user_password_methods function completed in {end_time - start_time:.2f} seconds"
                )
                return None, error
            
            methods = response.get("value", [])
            all_methods.extend(methods)
            url = response.get("@odata.nextLink")
        
        logging.info(f"Successfully retrieved {len(all_methods)} password methods for user {user_id}")
        end_time = time.time()
        logging.info(
            f"get_user_password_methods function completed in {end_time - start_time:.2f} seconds"
        )
        
        return all_methods, None
    except Exception as e:
        logging.exception(f"Unexpected error getting password methods for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"get_user_password_methods function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error getting password methods", "details": str(e)}


def get_user_password_methods_no_ctx(
    user_id: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Retrieves all password methods for a user from Microsoft Graph API.
    
    Args:
        user_id (str): The user's ID or userPrincipalName.
        
    Returns:
        tuple: (password_methods, error) where password_methods is a list of password method details
        if successful, or None and error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting get_user_password_methods function for user {user_id}")
    
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/authentication/passwordMethods"
    all_methods = []
    
    try:
        while url:
            response, error = make_request("GET", url)
            
            if error:
                logging.error(f"Failed to get password methods for user {user_id}: {error}")
                end_time = time.time()
                logging.info(
                    f"get_user_password_methods function completed in {end_time - start_time:.2f} seconds"
                )
                return None, error
            
            methods = response.get("value", [])
            all_methods.extend(methods)
            url = response.get("@odata.nextLink")
        
        logging.info(f"Successfully retrieved {len(all_methods)} password methods for user {user_id}")
        end_time = time.time()
        logging.info(
            f"get_user_password_methods function completed in {end_time - start_time:.2f} seconds"
        )
        
        return all_methods, None
    except Exception as e:
        logging.exception(f"Unexpected error getting password methods for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"get_user_password_methods function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error getting password methods", "details": str(e)}


def block_sign_in(
    ctx: RunContext, user_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Disables a user's account in Azure AD using Microsoft Graph API.
    
    Args:
        ctx (RunContext): The context containing configuration and state.
        user_id (str): The user's ID or userPrincipalName.
        
    Returns:
        tuple: (response, error) where response is the result of the operation if successful,
        or None and error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting block_sign_in function for user {user_id}")
    
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    payload = {
        "accountEnabled": False
    }
    
    try:
        response, error = make_request("PATCH", url, json_data=payload)
        
        if error:
            logging.error(f"Failed to block sign in for user {user_id}: {error}")
            end_time = time.time()
            logging.info(
                f"block_sign_in function completed in {end_time - start_time:.2f} seconds"
            )
            return None, error
        
        logging.info(f"Successfully blocked sign in for user {user_id}")
        end_time = time.time()
        logging.info(
            f"block_sign_in function completed in {end_time - start_time:.2f} seconds"
        )
        
        return response, None
    except Exception as e:
        logging.exception(f"Unexpected error blocking sign in for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"block_sign_in function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error blocking sign in", "details": str(e)}


def block_sign_in_no_ctx(
    user_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Disables a user's account in Azure AD using Microsoft Graph API.
    
    Args:
        user_id (str): The user's ID or userPrincipalName.
        
    Returns:
        tuple: (response, error) where response is the result of the operation if successful,
        or None and error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting block_sign_in function for user {user_id}")
    
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    payload = {
        "accountEnabled": False
    }
    
    try:
        response, error = make_request("PATCH", url, json_data=payload)
        
        if error:
            logging.error(f"Failed to block sign in for user {user_id}: {error}")
            end_time = time.time()
            logging.info(
                f"block_sign_in function completed in {end_time - start_time:.2f} seconds"
            )
            return None, error
        
        logging.info(f"Successfully blocked sign in for user {user_id}")
        end_time = time.time()
        logging.info(
            f"block_sign_in function completed in {end_time - start_time:.2f} seconds"
        )
        
        return response, None
    except Exception as e:
        logging.exception(f"Unexpected error blocking sign in for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"block_sign_in function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error blocking sign in", "details": str(e)}


def unblock_sign_in(
    ctx: RunContext, user_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Enables a user's account in Azure AD using Microsoft Graph API.
    
    Args:
        ctx (RunContext): The context containing configuration and state.
        user_id (str): The user's ID or userPrincipalName.
        
    Returns:
        tuple: (response, error) where response is the result of the operation if successful,
        or None and error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting unblock_sign_in function for user {user_id}")
    
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    payload = {
        "accountEnabled": True
    }
    
    try:
        response, error = make_request("PATCH", url, json_data=payload)
        
        if error:
            logging.error(f"Failed to unblock sign in for user {user_id}: {error}")
            end_time = time.time()
            logging.info(
                f"unblock_sign_in function completed in {end_time - start_time:.2f} seconds"
            )
            return None, error
        
        logging.info(f"Successfully unblocked sign in for user {user_id}")
        end_time = time.time()
        logging.info(
            f"unblock_sign_in function completed in {end_time - start_time:.2f} seconds"
        )
        
        return response, None
    except Exception as e:
        logging.exception(f"Unexpected error unblocking sign in for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"unblock_sign_in function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error unblocking sign in", "details": str(e)}


def unblock_sign_in_no_ctx(
    user_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Enables a user's account in Azure AD using Microsoft Graph API.
    
    Args:
        user_id (str): The user's ID or userPrincipalName.
        
    Returns:
        tuple: (response, error) where response is the result of the operation if successful,
        or None and error details if failed.
    """
    start_time = time.time()
    logging.info(f"Starting unblock_sign_in function for user {user_id}")
    
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
    payload = {
        "accountEnabled": True
    }
    
    try:
        response, error = make_request("PATCH", url, json_data=payload)
        
        if error:
            logging.error(f"Failed to unblock sign in for user {user_id}: {error}")
            end_time = time.time()
            logging.info(
                f"unblock_sign_in function completed in {end_time - start_time:.2f} seconds"
            )
            return None, error
        
        logging.info(f"Successfully unblocked sign in for user {user_id}")
        end_time = time.time()
        logging.info(
            f"unblock_sign_in function completed in {end_time - start_time:.2f} seconds"
        )
        
        return response, None
    except Exception as e:
        logging.exception(f"Unexpected error unblocking sign in for user {user_id}: {e}")
        end_time = time.time()
        logging.info(
            f"unblock_sign_in function completed in {end_time - start_time:.2f} seconds"
        )
        return None, {"error": "Unexpected error unblocking sign in", "details": str(e)}


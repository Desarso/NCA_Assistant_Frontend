from pydantic_ai import RunContext
import logging
# from pydantic_ai import agent_tool # Assuming you'll use agent_tool later, but not crucial for this core logic.
from typing import Tuple, Optional, Dict, Any, List
from helpers.RequestHelper import make_request
import time


## ✅ 3. Create a team
def create_team(ctx: RunContext, team_name:str, description:str, owner_email:str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Creates a new team in Microsoft Teams.

    Args:
        team_name (str): The display name for the new team
        description (str): The description for the new team
        owner_email (str): The email address of the user who will be the team owner

    Returns:
        tuple: (response_data, error) where response_data contains the created team details if successful,
        or None and error details if failed
    """
    url = "https://graph.microsoft.com/v1.0/teams"
    payload = {
        "template@odata.bind": "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
        "displayName": team_name,
        "description": description,
        "members": [
            {
                "@odata.type": "#microsoft.graph.aadUserConversationMember",
                "roles": ["owner"],
                "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{owner_email}')"
            }
        ]
    }

    response, error = make_request("POST", url, json_data=payload)
    if error:
        logging.error(f"Failed to create team: {error}")
        return None, error

    logging.info(f"Team '{team_name}' created successfully with ID {response.get('id')}")
    return response, None


def create_team_no_ctx(team_name:str, description:str, owner_email:str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Creates a new team in Microsoft Teams.

    Args:
        team_name (str): The display name for the new team
        description (str): The description for the new team
        owner_email (str): The email address of the user who will be the team owner

    Returns:
        tuple: (response_data, error) where response_data contains the created team details if successful,
        or None and error details if failed
    """
    url = "https://graph.microsoft.com/v1.0/teams"
    payload = {
        "template@odata.bind": "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
        "displayName": team_name,
        "description": description,
        "members": [
            {
                "@odata.type": "#microsoft.graph.aadUserConversationMember",
                "roles": ["owner"],
                "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{owner_email}')"
            }
        ]
    }

    response, error = make_request("POST", url, json_data=payload)
    if error:
        logging.error(f"Failed to create team: {error}")
        return None, error

    logging.info(f"Team '{team_name}' created successfully with ID {response.get('id')}")
    return response, None


## ✅ 5. List all teams
def list_teams(ctx: RunContext) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Lists all teams in Microsoft Teams.

    Returns:
        tuple: (teams_list, error) where teams_list contains all teams if successful,
        or None and error details if failed
    """
    url = "https://graph.microsoft.com/v1.0/teams"
    all_teams = []
    try:
        while url:
            response, error = make_request("GET", url)

            if error:
                logging.error(f"Failed to list teams: {error}")
                return None, error

            teams = response.get('value', [])
            all_teams.extend(teams)
            url = response.get('@odata.nextLink')

        logging.info(f"Successfully retrieved {len(all_teams)} teams")
        return all_teams, None
    except Exception as e:
        logging.exception(f"Error listing teams: {e}")
        return None, {"error": "Unexpected error listing teams", "details": str(e)}


def list_teams_no_ctx() -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Lists all teams in Microsoft Teams.

    Returns:
        tuple: (teams_list, error) where teams_list contains all teams if successful,
        or None and error details if failed
    """
    url = "https://graph.microsoft.com/v1.0/teams"
    all_teams = []
    try:
        while url:
            response, error = make_request("GET", url)

            if error:
                logging.error(f"Failed to list teams: {error}")
                return None, error

            teams = response.get('value', [])
            all_teams.extend(teams)
            url = response.get('@odata.nextLink')

        logging.info(f"Successfully retrieved {len(all_teams)} teams")
        return all_teams, None
    except Exception as e:
        logging.exception(f"Error listing teams: {e}")
        return None, {"error": "Unexpected error listing teams", "details": str(e)}


## ✅ 6. List all members of a specific Microsoft Team
def list_team_members(ctx: RunContext, team_id:str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Lists all members of a specific Microsoft Team.

    Args:
        team_id (str): The ID of the team to list members from

    Returns:
        tuple: (members_list, error) where members_list contains all team members if successful,
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/members"
    all_members = []
    try:
        while url:
            response, error = make_request("GET", url)

            if error:
                logging.error(f"Failed to list team members: {error}")
                return None, error

            members = response.get('value', [])
            all_members.extend(members)
            url = response.get('@odata.nextLink')

        logging.info(f"Successfully retrieved {len(all_members)} members from team {team_id}")
        return all_members, None
    except Exception as e:
        logging.exception(f"Error listing team members: {e}")
        return None, {"error": "Unexpected error listing team members", "details": str(e)}


def list_team_members_no_ctx(team_id:str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Lists all members of a specific Microsoft Team.

    Args:
        team_id (str): The ID of the team to list members from

    Returns:
        tuple: (members_list, error) where members_list contains all team members if successful,
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/members"
    all_members = []
    try:
        while url:
            response, error = make_request("GET", url)

            if error:
                logging.error(f"Failed to list team members: {error}")
                return None, error

            members = response.get('value', [])
            all_members.extend(members)
            url = response.get('@odata.nextLink')

        logging.info(f"Successfully retrieved {len(all_members)} members from team {team_id}")
        return all_members, None
    except Exception as e:
        logging.exception(f"Error listing team members: {e}")
        return None, {"error": "Unexpected error listing team members", "details": str(e)}


##list users joined to a team
def list_users_joined_team(ctx: RunContext, team_id:str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Lists all users joined to a specific Microsoft Team.

    Args:
        team_id (str): The ID of the team to list users from

    Returns:
        tuple: (users_list, error) where users_list contains all users joined to the team if successful,
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/members"
    all_users = []
    try:
        while url:
            response, error = make_request("GET", url)

            if error:
                logging.error(f"Failed to list users joined to team: {error}")
                return None, error

            users = response.get('value', [])
            all_users.extend(users)
            url = response.get('@odata.nextLink')

        logging.info(f"Successfully retrieved {len(all_users)} users joined to team {team_id}")
        return all_users, None
    except Exception as e:
        logging.exception(f"Error listing users joined to team: {e}")
        return None, {"error": "Unexpected error listing users joined to team", "details": str(e)}


def list_users_joined_team_no_ctx(team_id:str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Lists all users joined to a specific Microsoft Team.

    Args:
        team_id (str): The ID of the team to list users from

    Returns:
        tuple: (users_list, error) where users_list contains all users joined to the team if successful,
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/members"
    all_users = []
    try:
        while url:
            response, error = make_request("GET", url)

            if error:
                logging.error(f"Failed to list users joined to team: {error}")
                return None, error

            users = response.get('value', [])
            all_users.extend(users)
            url = response.get('@odata.nextLink')

        logging.info(f"Successfully retrieved {len(all_users)} users joined to team {team_id}")
        return all_users, None
    except Exception as e:
        logging.exception(f"Error listing users joined to team: {e}")
        return None, {"error": "Unexpected error listing users joined to team", "details": str(e)}


## ✅ 11. Delete a Microsoft Team
def delete_team(ctx: RunContext, team_id:str) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Deletes a Microsoft Team.

    Args:
        team_id (str): The ID of the team to delete

    Returns:
        tuple: (success_message, error) where success_message indicates successful deletion
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}"
    response, error = make_request("DELETE", url)

    if error:
        logging.error(f"Failed to delete team: {error}")
        return None, error

    logging.info(f"Team '{team_id}' deleted successfully")
    return f"Successfully deleted team {team_id}", None  # Return success message


def delete_team_no_ctx(team_id:str) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Deletes a Microsoft Team.

    Args:
        team_id (str): The ID of the team to delete

    Returns:
        tuple: (success_message, error) where success_message indicates successful deletion
        or None and error details if failed
    """
    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}"
    response, error = make_request("DELETE", url)

    if error:
        logging.error(f"Failed to delete team: {error}")
        return None, error

    logging.info(f"Team '{team_id}' deleted successfully")
    return f"Successfully deleted team {team_id}", None  # Return success message


def search_teams_by_field(
    ctx: RunContext, search_string: str, filter_field: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Searches for teams based on a specified field.

    Args:
        search_string (str): The string to search for in team properties
        filter_field (str, optional):
            - displayName: The name displayed for the team, default to this if not specified
            - description: The team's description
            - visibility: The team's visibility (public or private)
            - createdDateTime: When the team was created
            - memberCount: Number of members in the team
            - owner: The team owner's information

    Returns:
        tuple: (teams_list, error) where teams_list contains matching teams if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(
        f"Starting search_teams_by_field function with search string: {search_string} in field: {filter_field}"
    )

    all_teams = []
    url = "https://graph.microsoft.com/v1.0/teams"

    while url:
        response, error = make_request("GET", url)

        if error:
            logging.error(f"Failed to search teams: {error}")
            end_time = time.time()
            logging.info(
                f"search_teams_by_field function completed in {end_time - start_time:.2f} seconds"
            )
            return None, error

        if response:
            teams = response.get("value", [])
            all_teams.extend(teams)
            url = response.get("@odata.nextLink")
        else:
            url = None

    filtered_teams = [
        team
        for team in all_teams
        if search_string.lower() in str(team.get(filter_field, "")).lower()
    ]
    logging.info(
        f"Found {len(filtered_teams)} teams matching '{search_string}' in field '{filter_field}'"
    )
    end_time = time.time()
    logging.info(
        f"search_teams_by_field function completed in {end_time - start_time:.2f} seconds"
    )
    return filtered_teams, None


def search_teams_by_field_no_ctx(search_string: str, filter_field: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Searches for teams based on a specified field.

    Args:
        search_string (str): The string to search for in team properties
        filter_field (str, optional):
            - displayName: The name displayed for the team, default to this if not specified
            - description: The team's description
            - visibility: The team's visibility (public or private)
            - createdDateTime: When the team was created
            - memberCount: Number of members in the team
            - owner: The team owner's information

    Returns:
        tuple: (teams_list, error) where teams_list contains matching teams if successful,
        or None and error details if failed
    """
    start_time = time.time()
    logging.info(
        f"Starting search_teams_by_field function with search string: {search_string} in field: {filter_field}"
    )

    all_teams = []
    url = "https://graph.microsoft.com/v1.0/teams"

    while url:
        response, error = make_request("GET", url)

        if error:
            logging.error(f"Failed to search teams: {error}")
            end_time = time.time()
            logging.info(
                f"search_teams_by_field function completed in {end_time - start_time:.2f} seconds"
            )
            return None, error

        if response:
            teams = response.get("value", [])
            all_teams.extend(teams)
            url = response.get("@odata.nextLink")
        else:
            url = None

    filtered_teams = [
        team
        for team in all_teams
        if search_string.lower() in str(team.get(filter_field, "")).lower()
    ]
    logging.info(
        f"Found {len(filtered_teams)} teams matching '{search_string}' in field '{filter_field}'"
    )
    end_time = time.time()
    logging.info(
        f"search_teams_by_field function completed in {end_time - start_time:.2f} seconds"
    )
    return filtered_teams, None

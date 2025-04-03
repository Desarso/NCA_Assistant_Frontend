import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from pydantic_ai import RunContext
from helpers.RequestHelper import make_request

def _list_sharepoint_sites(ctx: RunContext) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Lists all SharePoint sites accessible by the Entra application.

    Args:
        ctx (RunContext): The context object containing authentication details.

    Returns:
        tuple: (sites_list, error) where sites_list contains all sites if successful,
        or None and error details if failed.
    """
    start_time = time.time()
    logging.info("Starting list_sharepoint_sites function")

    url = "https://graph.microsoft.com/v1.0/sites"
    all_sites = []

    try:
        while url:
            response, error = make_request("GET", url)
            if error:
                logging.error(f"Failed to list sites: {error}")
                return None, error

            data = response
            sites = data.get("value", [])
            all_sites.extend(sites)
            url = data.get("@odata.nextLink")
            print(url)

        logging.info(f"Successfully retrieved {len(all_sites)} sites")

        return all_sites, None

    except Exception as e:
        logging.exception(f"Error listing sites: {e}")
        error = {"error": "Unexpected error listing sites", "details": str(e)}
        return None, error
    finally:
        end_time = time.time()
        logging.info(f"list_sharepoint_sites function completed in {end_time - start_time:.2f} seconds")




def search_sharepoint_sites(ctx: RunContext, search_term: str) -> List[Dict[str, Any]]:
    """
    Searches a list of SharePoint sites for sites whose name or display name contains the search term.
    When the user asks you to find a sharepoint start with full name it it fails, try each individual word in the search term the user gave you.
    Start it from what is likely to be the most unique. 

    Args:
        sites: A list of SharePoint site dictionaries.
        search_term: The string to search for (case-insensitive).

    Returns:
        A list of SharePoint site dictionaries that match the search term.  Returns an empty list if no matches are found.
    """
    sites, error = _list_sharepoint_sites(ctx)
    if error:
        return error
     
    search_term_lower = search_term.lower()
    matching_sites = []
    for site in sites:
        # print(site)
        name = site.get("name", "").lower()
        display_name = site.get("displayName", "").lower()

        if search_term_lower in name or search_term_lower in display_name:
            matching_sites.append(site)


    return matching_sites

    



def list_sharepoint_directory_by_item_id(ctx: RunContext, sharepoint_site_id: str, item_id: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Lists files and folders in a SharePoint directory using Microsoft Graph API,
    identifying the directory by its item ID.

    Args:
        ctx (RunContext): Context object with authentication details (e.g., auth_token).
        sharepoint_site_id (str): The ID of the SharePoint site.
        item_id (str): The ID of the folder (driveItem) to list.  Use "root" drive.items to reference from root.

    Returns:
        tuple: (directory_structure, error), where directory_structure is a list
               of dictionaries representing files and folders, or None if failed.
               error contains error details if the method failed.
    """
    start_time = time.time()
    logging.info(f"Starting to list SharePoint directory by item ID for site: {sharepoint_site_id}, item ID: {item_id}")

    url = f"https://graph.microsoft.com/v1.0/sites/{sharepoint_site_id}/drive/items/{item_id}/children"

    all_items = []

    try:
        while url:
            response, error = make_request("GET", url) # Assuming make_request handles authentication
            if error:
                logging.error(f"Failed to list directory: {error}")
                return None, error

            data = response

            items = data.get("value", []) # Correctly access the 'value' key


            all_items.extend(items)

            # Check if there's a nextLink for pagination
            url = data.get("@odata.nextLink")


        logging.info(f"Successfully retrieved {len(all_items)} items from directory")

        structured_items = []
        for item in all_items:

            item_type = "file" if "file" in item else "folder"
            structured_items.append({
                "type": item_type,
                "name": item.get("name"),
                "id": item.get("id"),
                "webUrl": item.get("webUrl"),
                "size": item.get("size") if item_type == "file" else None,
                "lastModifiedDateTime": item.get("lastModifiedDateTime")
            })

        return structured_items, None

    except Exception as e:
        logging.exception(f"Error listing directory: {e}")
        error = {"error": "Unexpected error listing directory", "details": str(e)}
        return None, error

    finally:
        end_time = time.time()
        logging.info(f"list_sharepoint_directory_by_item_id function completed in {end_time - start_time:.2f} seconds")


def traverse_sharepoint_directory_by_item_id(ctx: RunContext, sharepoint_site_id: str, root_item_id: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Traverses the entire directory structure of a SharePoint site starting from a
    specified root item ID, using Microsoft Graph API.

    Args:
        ctx (RunContext): The context object containing authentication details (e.g., auth_token).
        sharepoint_site_id (str): The ID of the SharePoint site.
        root_item_id (str): The item ID of the root folder to start traversing from (e.g., "root" for the site's root).

    Returns:
        tuple: (directory_structure, error), where directory_structure is a
               list of dictionaries representing all files and folders in the hierarchy.
               Returns None and an error dict if there was a problem listing the directories.
    """

    full_structure: List[Dict[str, Any]] = []

    def recursive_list(current_item_id: str):
        items, error = list_sharepoint_directory_by_item_id(ctx, sharepoint_site_id, current_item_id)

        if error:
            logging.error(f"Error getting directory with item ID {current_item_id}: {error}")
            return  # Stop recursion on error

        if items:
            full_structure.extend(items)

            # Recursively call for subfolders
            for item in items:
                if item["type"] == "folder":
                    recursive_list(item["id"])  # Recursive call uses the item ID

    recursive_list(root_item_id)

    return full_structure, None



def search_sharepoint_graph(ctx: RunContext, search_term: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Searches SharePoint using the Microsoft Graph Search API, using /me/drive/root/search.

    Args:
        search_term: The string to search for.

    Returns:
        A list of dictionaries representing the search results, or None if an error occurred.
    """
    graph_url = f"https://graph.microsoft.com/v1.0/me/drive/root/search(q='{search_term}')"

    try:
        response, error = make_request("GET", graph_url) #  make_request to append the token
        if error:
           logging.error(f"Failed to list sites: {error}")
           return None, {"error": "Unexpected error listing sites", "details": str(error)}

        # Process the response (handle errors, extract results)
        try:
            search_results = response.get("value", []) # The search API returns the result inside a "value" array


            # Extract relevant information from the search results
            extracted_results = []
            for result in search_results:
                extracted_results.append({ #Use get since name might exist due to edge edge cases in Sharepoint
                    "id": result.get("id"),
                    "name": result.get("name"),
                    "webUrl": result.get("webUrl"),
                })

            logging.info(f"Search Term API {str(extracted_results)}")
            return extracted_results, None
        except Exception as e:
              logging.exception(f"Error processing results API: {e}")
              error = {"error": "Error search response", "details": str(response)}
              return None, error
    except Exception as e:
        logging.exception(f"Error searching SharePoint: {e}")
        error = {"error": "Error searching SharePoint", "details": str(e)}
        return None, error
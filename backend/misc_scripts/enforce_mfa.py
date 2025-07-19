import json
import os
from ai.assistant_functions.graph import graph_api_request

def enforce_mfa_for_users(users_json_file):
    """
    Enforces MFA for a list of users.

    Args:
        users_json_file (str): Path to a JSON file containing a list of users.
                              Each user should have a 'userPrincipalName' key.
    """
    # Get the absolute path to the JSON file
    current_dir = os.path.dirname(os.path.abspath(__file__))
    json_file_path = os.path.join(current_dir, users_json_file)
    
    # Read the JSON file
    with open(json_file_path, 'r') as file:
        users = json.load(file)

    for user in users:
        user_principal_name = user.get('userPrincipalName')
        if user_principal_name:
            # Construct the PATCH request body to enforce MFA
            body = {
                "perUserMfaState": "enforced"
            }
            body_json = json.dumps(body)

            # Construct the Graph API endpoint path
            path = f'/users/{user_principal_name}/authentication/requirements'

            try:
                # Construct and execute the graph_api_request call
                graph_api_response = graph_api_request(
                    endpoint_version='beta',  # or 'v1.0' if available
                    method='PATCH',
                    path=path,
                    body_json=body_json
                )
                print(f"MFA enforcement request sent for {user_principal_name}. Response: {graph_api_response}")

            except Exception as e:
                print(f"Error enforcing MFA for {user_principal_name}: {e}")
        else:
            print("Skipping user, no userPrincipalName found")


# Call the function with the non_enabled.json file
enforce_mfa_for_users("test.json")

import json
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs, unquote
import sys

from ai.assistant_functions.graph import graph_api_request_no_ctx # Import sys for flushing output

# --- Configuration ---
user_id = "76f28ead-6f1d-4a17-9c23-331a79d6f546" # cm@novastone-ca.com
# Today: 2025-04-08
three_months_ago_date = "2025-01-08T00:00:00Z" # Specific date for 3 months ago

# Initial API request details
endpoint_version = "v1.0"
method = "GET"
current_path = f"/users/{user_id}/messages" # Start with the path
current_query_params = { # Start with query params as dict
    "$filter": f"sentDateTime ge {three_months_ago_date}",
    "$select": "toRecipients",
    "$top": 999 # Maximized batch size
}

# Set to store unique email addresses
unique_recipient_emails = set()

# --- Pagination Loop ---
page_count = 0
max_pages = 15 # Max pages adjusted for larger page size

print(f"Starting script (v5, top=999) for unique recipients: {user_id} since {three_months_ago_date}...")

while page_count < max_pages:
    page_count += 1
    print(f"Fetching page {page_count}...")
    sys.stdout.flush() # Ensure print statements appear promptly

    try:
        # Convert query params dict to JSON string for the API call
        query_params_str = json.dumps(current_query_params) if current_query_params else None

        # Make the API call using the available function
        response_data = graph_api_request_no_ctx(
            endpoint_version=endpoint_version,
            method=method,
            path=current_path,
            query_params_json=query_params_str
        )

        # --- Process the response ---
        response_json = None
        # Handle potential nested structure
        if isinstance(response_data, dict) and 'graph_api_request_response' in response_data:
             graph_response_content = response_data['graph_api_request_response']
             if isinstance(graph_response_content, str):
                 try:
                     response_json = json.loads(graph_response_content)
                 except json.JSONDecodeError:
                     print(f"Error: Failed to decode JSON on page {page_count}: {graph_response_content}")
                     sys.stdout.flush()
                     break
             elif isinstance(graph_response_content, dict):
                 response_json = graph_response_content
             else:
                 print(f"Error: Unexpected inner response type on page {page_count}: {type(graph_response_content)}")
                 sys.stdout.flush()
                 break
        # Handle direct dictionary response
        elif isinstance(response_data, dict) and ('value' in response_data or 'error' in response_data):
             response_json = response_data
        else:
            print(f"Error: Unexpected response structure on page {page_count}: {response_data}")
            sys.stdout.flush()
            break

        # Check for Graph API errors
        if 'error' in response_json:
            print(f"Error: Graph API error on page {page_count}: {response_json['error']}")
            if response_json['error'].get('code') == 'MailboxNotEnabledForRESTAPI':
                print("Error Detail: The mailbox is not enabled for REST API access.")
            elif response_json['error'].get('code') == 'ErrorAccessDenied':
                print("Error Detail: Access denied. Check permissions.")
            sys.stdout.flush()
            break

        messages = response_json.get('value', [])
        print(f"Fetched {len(messages)} messages on page {page_count}.")
        sys.stdout.flush()

        # Extract recipients
        current_count = len(unique_recipient_emails) # Count before adding from this page
        for message in messages:
            recipients = message.get('toRecipients', [])
            for recipient in recipients:
                email_address_info = recipient.get('emailAddress', {})
                address = email_address_info.get('address')
                if address:
                    unique_recipient_emails.add(address.lower())
        print(f"Found {len(unique_recipient_emails) - current_count} new unique addresses on this page. Total unique: {len(unique_recipient_emails)}")
        sys.stdout.flush()

        # --- Handle Pagination ---
        next_link = response_json.get('@odata.nextLink')
        if next_link:
            print(f"Next link found, preparing for page {page_count + 1}.")
            sys.stdout.flush()
            parsed_url = urlparse(next_link)
            path_start_index = parsed_url.path.find(f"/{endpoint_version}")
            if path_start_index != -1:
                 version_prefix_len = len("/" + endpoint_version)
                 current_path = parsed_url.path[path_start_index + version_prefix_len:]
            else:
                 current_path = parsed_url.path # Fallback

            query_params_dict = parse_qs(parsed_url.query)
            current_query_params = {unquote(k): unquote(v[0]) for k, v in query_params_dict.items()}
            if '$select' not in current_query_params:
                 current_query_params['$select'] = 'toRecipients' # Ensure select is preserved

        else:
            print("No more pages found.")
            sys.stdout.flush()
            break

    except Exception as e:
        print(f"An unexpected error occurred during script execution on page {page_count}: {e}")
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        break

# --- Final Output ---
if page_count == max_pages and next_link:
    print(f"\nWarning: Reached maximum page limit ({max_pages}) with $top=999. Results might be incomplete.")

print(f"\n--- Script Finished ---")
print(f"Found {len(unique_recipient_emails)} unique recipient email addresses.")
final_list = sorted(list(unique_recipient_emails))
print(final_list)

# --- Save to JSON file ---
output_filename = "unique_recipients.json"
try:
    with open(output_filename, 'w') as f:
        json.dump(final_list, f, indent=4)
    print(f"Successfully saved unique recipients to {output_filename}")
except IOError as e:
    print(f"Error: Failed to save unique recipients to {output_filename}: {e}")
# --- End Save to JSON file ---

sys.stdout.flush()
import json
import os
import time
import sys

from ai.assistant_functions.graph import graph_api_request_no_ctx

# --- Configuration ---
RECIPIENT_JSON_FILE = 'unique_recipients.json'  # Expects a JSON file with a list of email strings: ["email1@example.com", "email2@example.com", ...]
PROGRESS_FILE = 'send_progress.txt'   # File to store the index of the last successfully sent email
SENDER_USER_ID = 'bc72db82-5ecd-49cc-b9df-06b15edebbf5' # Your User ID (Gabriel Malek)
EMAIL_SUBJECT = 'URGENT: Phishing Alert - Fake Email Impersonating Christian Malek'
# How many emails to send AT MOST in this single run of the script.
# Set to a large number (e.g., 10000) to try sending all remaining emails.
MAX_EMAILS_TO_SEND_THIS_RUN = 800
DELAY_BETWEEN_SENDS_SECONDS = 4  # Pause between API calls (adjust if needed)

# --- Email HTML Body (Full Width, Signed by Novastone IT Team) ---
HTML_BODY = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URGENT: Phishing Alert - Fake Email Impersonating Christian Malek</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4; /* Background for outside the email body */
            color: #333;
        }
        .email-container {
            /* max-width: 600px; */ /* Removed this line */
            margin: 0 auto; /* Center if width becomes constrained by viewport later */
            background-color: #ffffff; /* White background for the email content */
            border-left: 1px solid #ddd; /* Add borders for structure if needed */
            border-right: 1px solid #ddd;
            /* overflow: hidden; */ /* Can sometimes interfere with full width */
        }
        .email-header {
            background-color: #d9534f; /* Red for warning */
            color: #ffffff;
            padding: 15px 20px;
            text-align: center;
        }
        .email-header h1 {
            margin: 0;
            font-size: 24px;
        }
        .email-body {
            padding: 25px 30px; /* Padding inside the white content area */
            line-height: 1.6;
        }
        .email-body p {
            margin-bottom: 15px;
        }
        .emphasis {
            font-weight: bold;
            color: #d9534f; /* Red text for emphasis */
        }
        .code { /* Style for email addresses/subjects */
            font-family: monospace;
            background-color: #f0f0f0;
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 0.95em;
        }
        .action-list {
            list-style: none;
            padding: 0;
            margin-top: 20px;
            margin-bottom: 20px;
        }
        .action-list li {
            margin-bottom: 10px;
            padding-left: 25px;
            position: relative;
        }
        .action-list li::before {
            content: '\\2757'; /* Exclamation mark */
            color: #f0ad4e; /* Orange for alert */
            font-weight: bold;
            position: absolute;
            left: 0;
            top: 1px;
        }
        .action-list li.danger::before {
            content: '\\2716'; /* Cross mark */
            color: #d9534f; /* Red for DO NOT */
        }
        .email-footer {
            background-color: #f8f8f8;
            padding: 15px 20px;
            font-size: 12px;
            color: #777;
            text-align: center;
            border-top: 1px solid #eee;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>Phishing Alert</h1>
        </div>
        <div class="email-body">
            <p><strong>Subject: URGENT: Phishing Alert - Fake Email Impersonating Christian Malek</strong></p>

            <p>Dear Colleagues,</p>

            <p>We are writing to alert you about a phishing attempt currently targeting Christian Malek's contacts. Someone is impersonating Christian by sending emails with a fake <strong>DocSend</strong> link.</p>

            <p><strong>Details of the fraudulent email:</strong></p>
            <ul>
                <li>Claims to be from Christian Malek sharing a <span class="code">"Novastone Proposal & Investment Opportunity"</span>.</li>
                <li>Uses a misspelled reply-to address: <span class="code emphasis">cm@novestone-ca.com</span> (notice the missing "a" in "nov<span class="emphasis">E</span>stone"). Christian's correct email is <span class="code">cm@novastone-ca.com</span>.</li>
                <li>Includes a "View Content" button or link that likely leads to malicious content or a credential harvesting site.</li>
            </ul>

            <p><strong class="emphasis">If you received an email matching this description:</strong></p>
            <ul class="action-list">
                <li class="danger"><span class="emphasis">DO NOT</span> click on any links or buttons ("View Content") in the message.</li>
                <li class="danger"><span class="emphasis">DO NOT</span> download any attachments.</li>
                <li>Delete the email immediately from your inbox and deleted items.</li>
                <li>Alert the IT Department (<span class="code">it@novastone-ca.com</span>) immediately, especially if you have already clicked on any links or entered any credentials.</li>
            </ul>

            <p>We strongly recommend reviewing any recent communications supposedly from Christian Malek to verify their authenticity, paying close attention to the sender's address and reply-to address.</p>

            <p>Please share this alert with colleagues who might also be targets or may have received similar messages.</p>

            <p>Thank you for your vigilance in helping maintain our security.</p>

            <p>Sincerely,</p>

            <p><strong>Novastone IT Team</strong></p>
        </div>
        <div class="email-footer">
            This is an official security notification. Report suspicious emails to it@novastone-ca.com.
        </div>
    </div>
</body>
</html>
"""

# --- Helper Functions ---

def load_recipients(filename):
    """Loads recipient list from JSON file."""
    try:
        with open(filename, 'r') as f:
            recipients = json.load(f)
            if isinstance(recipients, list) and all(isinstance(item, str) for item in recipients):
                print(f"Successfully loaded {len(recipients)} recipients from {filename}")
                return recipients
            else:
                print(f"Error: JSON file '{filename}' does not contain a list of strings.")
                return None
    except FileNotFoundError:
        print(f"Error: Recipient file '{filename}' not found.")
        return None
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from '{filename}'. Make sure it's valid JSON.")
        return None
    except Exception as e:
        print(f"An unexpected error occurred loading recipients: {e}")
        return None

def load_last_sent_index(filename):
    """Loads the index of the last successfully sent email."""
    if not os.path.exists(filename):
        return -1 # Start from the beginning if file doesn't exist
    try:
        with open(filename, 'r') as f:
            index_str = f.read().strip()
            return int(index_str)
    except ValueError:
        print(f"Warning: Could not read integer index from '{filename}'. Starting from beginning.")
        return -1
    except Exception as e:
        print(f"Error reading progress file '{filename}': {e}. Starting from beginning.")
        return -1

def save_last_sent_index(filename, index):
    """Saves the index of the last successfully sent email."""
    try:
        with open(filename, 'w') as f:
            f.write(str(index))
    except Exception as e:
        print(f"Error writing progress file '{filename}': {e}")

def send_email(recipient_email, subject, html_body, sender_user_id):
    """Sends a single email using the Graph API tool."""
    print(f"Preparing to send email to: {recipient_email}")
    payload = {
        "message": {
            "subject": subject,
            "body": {
                "contentType": "HTML",
                "content": html_body
            },
            "toRecipients": [
                {
                    "emailAddress": {
                        "address": recipient_email
                    }
                }
            ]
        },
        "saveToSentItems": "true"
    }

    try:
        # IMPORTANT: This uses the available default_api.graph_api_request function.
        # If running locally, you'd replace this with your authenticated requests call.
        response_data = graph_api_request_no_ctx(
            endpoint_version="v1.0",
            method="POST",
            path=f"/users/{sender_user_id}/sendMail",
            body_json=json.dumps(payload) # Ensure payload is JSON string
        )

        # Check response - adapt based on actual tool response structure
        # Assuming success is indicated by status_code 202 or similar
        # Handle potential nested structure like {'graph_api_request_response': {'return_value': ...}}
        status_code = None
        if isinstance(response_data, dict):
             inner_response = response_data.get('graph_api_request_response', response_data)
             if isinstance(inner_response, dict):
                 status_code = inner_response.get('status_code')
                 if status_code == 202:
                    print(f"Successfully sent email to {recipient_email} (Status: {status_code})")
                    return True
                 else:
                    print(f"Error sending email to {recipient_email}. Status: {status_code}, Response: {inner_response}")
                    return False
             # Sometimes the direct response might be the {'status_code': 202, ...} dict
             elif isinstance(response_data, dict) and response_data.get('status_code') == 202:
                 print(f"Successfully sent email to {recipient_email} (Status: 202)")
                 return True
             else:
                  print(f"Error sending email to {recipient_email}. Unexpected inner response format: {inner_response}")
                  return False

        else:
             print(f"Error sending email to {recipient_email}. Unexpected response type: {type(response_data)}")
             return False


    except Exception as e:
        print(f"An error occurred calling graph_api_request for {recipient_email}: {e}")
        # Optionally print traceback for detailed debugging
        # import traceback
        # traceback.print_exc()
        return False

# --- Main Script Logic ---
if __name__ == "__main__":
    print("--- Starting Bulk Email Sender Script ---")

    recipients = load_recipients(RECIPIENT_JSON_FILE)
    if recipients is None:
        print("Exiting due to error loading recipients.")
        sys.exit(1)

    if not recipients:
        print("Recipient list is empty. Nothing to send.")
        sys.exit(0)

    total_recipients = len(recipients)
    last_sent_index = load_last_sent_index(PROGRESS_FILE)
    start_index = last_sent_index + 1
    sent_this_run_count = 0

    print(f"Total recipients loaded: {total_recipients}")
    print(f"Last successfully sent index: {last_sent_index}")
    print(f"Starting from index: {start_index}")
    print(f"Maximum emails to send in this run: {MAX_EMAILS_TO_SEND_THIS_RUN}")

    if start_index >= total_recipients:
        print("All emails have already been sent according to the progress file.")
        sys.exit(0)

    for i in range(start_index, total_recipients):
        if sent_this_run_count >= MAX_EMAILS_TO_SEND_THIS_RUN:
            print(f"Reached send limit for this run ({MAX_EMAILS_TO_SEND_THIS_RUN}). Stopping.")
            break

        current_recipient = recipients[i]
        print(f"\n[{i+1}/{total_recipients}] Attempting email {sent_this_run_count + 1} of this run...")

        success = send_email(current_recipient, EMAIL_SUBJECT, HTML_BODY, SENDER_USER_ID)

        if success:
            sent_this_run_count += 1
            save_last_sent_index(PROGRESS_FILE, i) # Save index 'i' as successfully sent
            print(f"Waiting {DELAY_BETWEEN_SENDS_SECONDS} second(s)...")
            time.sleep(DELAY_BETWEEN_SENDS_SECONDS)
        else:
            print(f"Failed to send email to {current_recipient}. Stopping script.")
            print(f"Last successfully sent index remains: {load_last_sent_index(PROGRESS_FILE)}") # Re-read for confirmation
            sys.exit(1) # Exit on failure

    print("\n--- Script Finished ---")
    if start_index + sent_this_run_count == total_recipients:
        print("All emails have been sent successfully!")
    else:
        print(f"Sent {sent_this_run_count} emails in this run.")
        print(f"Last successfully sent index: {load_last_sent_index(PROGRESS_FILE)}")
        print("Run the script again to continue sending.")

import json
from ai.assistant_functions.graph import graph_api_request_no_ctx as graph_api_request

def get_all_users():
    users = []
    query_params = {"$select": "id,displayName,mail,userPrincipalName"}
    resp = graph_api_request("beta", "/users", "GET", json.dumps(query_params), None, None)
    users += resp.get("value", [])
    while "@odata.nextLink" in resp:
        next_url = resp["@odata.nextLink"]
        path = next_url.split("graph.microsoft.com/beta")[1]
        resp = graph_api_request("beta", path, "GET")
        users += resp.get("value", [])
    return users

def get_mfa_status(user_id):
    try:
        resp = graph_api_request("beta", f"/users/{user_id}/authentication/requirements", "GET")
        return resp.get("perUserMfaState", "unknown")
    except Exception:
        return "unknown"


def send_email(email_body, to_email, subject):
    email_body["message"]["subject"] = subject
    email_body["message"]["toRecipients"] = [{"emailAddress": {"address": to_email}}]
    from_user = "nca_assistant@novastone-ca.com"
    graph_api_request("v1.0", f"/users/{from_user}/sendMail", "POST", json.dumps(email_body), None, json.dumps({"Content-Type": "application/json"}))

def main():
    users = get_all_users()
    not_enforced = []
    for u in users:
        user_id = u["id"]
        display_name = u.get("displayName")
        email = u.get("mail") or u.get("userPrincipalName")
        
        # Only check MFA for Novastone organizational email addresses
        if not email:
            continue
        email_lower = email.lower()
        organizational_domains = ["@novastone-ca.com", "@novastonepartners.com", "@novastonecapital.com"]
        if not any(domain in email_lower for domain in organizational_domains):
            continue
            
        status = get_mfa_status(user_id)
        if status != "enforced":
            not_enforced.append({
                "displayName": display_name,
                "email": email,
                "mfaStatus": status
            })
    html = '<html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f9f9f9;padding:24px;"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:32px;"><h2 style="color:#336699;">🚨 Action Required: Users Without Enforced MFA – Security Review</h2><p style="color:#222;font-size:16px;line-height:1.5;">Dear IT Team,<br><br>I hope this message finds you well!</p><p style="color:#222;font-size:16px;line-height:1.5;">As part of our ongoing security efforts, we have identified the following users whose Multi-Factor Authentication (MFA) status is <b>not set to \"Enforced\"</b>. Please review and take appropriate action to enhance account security.</p>'
    html += '<table style="border-collapse:collapse;width:100%;margin-top:16px;font-size:15px;"><tr><th style="background:#e6f2ff;padding:10px 8px;border:1px solid #b3d4fc;text-align:left;">Display Name</th><th style="background:#e6f2ff;padding:10px 8px;border:1px solid #b3d4fc;text-align:left;">Email</th><th style="background:#e6f2ff;padding:10px 8px;border:1px solid #b3d4fc;text-align:left;">MFA Status</th></tr>'
    for row in not_enforced:
        html += f'<tr><td style="padding:8px;border:1px solid #b3d4fc;">{row["displayName"]}</td><td style="padding:8px;border:1px solid #b3d4fc;">{row["email"]}</td><td style="padding:8px;border:1px solid #b3d4fc;">{row["mfaStatus"]}</td></tr>'
    html += '</table>'
    html += '<p style="color:#222;font-size:16px;line-height:1.5;margin-top:18px;"><b>Recommendation:</b><br>To reduce risk, we recommend that MFA is enforced for these accounts as soon as possible. If you require further details, please let us know.</p><p style="color:#222;font-size:16px;line-height:1.5;">Thank you for your attention to this matter!</p><p style="color:#336699;margin-top:22px;font-size:17px;">Best regards,<br>NCA Assistant 🤖</p></div></body></html>'
    email_body = {
        "message": {
            "subject": "Users Without MFA Enforced – Security Review",
            "body": {"contentType": "html", "content": html},
            "toRecipients": [
                {"emailAddress": {"address": "it@novastone-ca.com"}}
            ]
        },
        "saveToSentItems": True
    }
    send_email(email_body, "it@novastone-ca.com", "Users Without MFA Enforced – Security Review")



main()



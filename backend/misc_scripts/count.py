import json

with open('sharepoint_sites.json', 'r') as f:
    sites = json.load(f)
    count = len(sites)
    print(f"Number of SharePoint sites: {count}")

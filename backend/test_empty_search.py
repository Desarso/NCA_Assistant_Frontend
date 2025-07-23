#!/usr/bin/env python3

import firebase_admin
from firebase_admin import credentials, auth
from firebase.firebase_credentials import get_firebase_credentials
import os

def test_empty_search():
    """Test that empty search returns all users"""
    
    # Initialize Firebase if not already initialized
    if not firebase_admin._apps:
        cred = credentials.Certificate(get_firebase_credentials())
        firebase_admin.initialize_app(cred, {
            'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET')
        })
    
    try:
        # Get all users
        users = auth.list_users().users
        print(f"Total users in Firebase: {len(users)}")
        
        # Test empty search (simulating the backend logic)
        query = ""
        print(f"\nTesting empty search query: '{query}'")
        
        if not query.strip():
            print("Empty query detected - returning all users")
            all_users = [
                {
                    'id': user.uid,
                    'email': user.email,
                    'displayName': user.display_name
                }
                for user in users
            ]
            # Sort alphabetically by email and limit to 10
            sorted_users = sorted(all_users, key=lambda u: u['email'].lower())[:10]
            
            print(f"Users returned: {len(sorted_users)}")
            for user in sorted_users:
                print(f"  - {user['email']} ({user['displayName'] or 'No display name'})")
        else:
            print("Non-empty query - this shouldn't happen with empty string")
    
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_empty_search() 
#!/usr/bin/env python3

import firebase_admin
from firebase_admin import credentials, auth
from firebase.firebase_credentials import get_firebase_credentials
import os

def test_search_logic():
    """Test the exact search logic used in the backend"""
    
    # Initialize Firebase if not already initialized
    if not firebase_admin._apps:
        cred = credentials.Certificate(get_firebase_credentials())
        firebase_admin.initialize_app(cred, {
            'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET')
        })
    
    try:
        # Get all users (same as backend)
        users = auth.list_users().users
        print(f"Total users in Firebase: {len(users)}")
        
        # Test various search queries that might be used
        test_queries = [
            "",  # Empty query
            " ",  # Space only
            "a",  # Single letter
            "ab",  # Two letters
            "user",  # Should match user@whagons.com
            "gabriel",  # Should match gabriel.malek@novastone-ca.com
            "matthias",  # Should match mm@novastonecapital.com
            "novastone",  # Should match multiple users
            "whagons",  # Should match user@whagons.com
            "example",  # Should match fake@example.com
            "@",  # Should match all users
            "com",  # Should match all users
            "test",  # Should match none
            "xyz",  # Should match none
        ]
        
        for query in test_queries:
            print(f"\n{'='*50}")
            print(f"Testing query: '{query}'")
            print(f"Query length: {len(query)}")
            print(f"Query trimmed: '{query.strip()}'")
            print(f"Query lower: '{query.lower()}'")
            
            # Apply the exact same logic as the backend
            query_lower = query.lower()
            filtered_users = [
                {
                    'id': user.uid,
                    'email': user.email,
                    'displayName': user.display_name
                }
                for user in users
                if query_lower in user.email.lower() or 
                   (user.display_name and query_lower in user.display_name.lower())
            ]
            
            print(f"Users found: {len(filtered_users)}")
            
            if filtered_users:
                print("Matching users:")
                for user in filtered_users:
                    email_match = query_lower in user['email'].lower()
                    name_match = user['displayName'] and query_lower in user['displayName'].lower()
                    print(f"  - {user['email']} ({user['displayName'] or 'No display name'})")
                    print(f"    Email match: {email_match}, Name match: {name_match}")
            else:
                print("No users found")
                
                # Debug: show why no matches
                print("Debug - checking each user:")
                for user in users:
                    email_match = query_lower in user.email.lower()
                    name_match = user.display_name and query_lower in user.display_name.lower()
                    print(f"  {user.email}: email_match={email_match}, name_match={name_match}")
    
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_search_logic() 
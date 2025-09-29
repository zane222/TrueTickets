"""
Lambda that handles both RepairShopr API proxy and user management operations.
Authentication is handled by API Gateway with Cognito Authorizer.
"""

import os
import urllib.request
import urllib.parse
import json
import boto3
import secrets
import string

API_KEY = os.environ["API_KEY"]
TARGET_URL = "https://Cacell.repairshopr.com/api/v1"
USER_POOL_ID = os.environ.get("USER_POOL_ID")

def lambda_handler(event, context): # main()
    try:
        method = event["httpMethod"]
        path = event.get("path", "")
        
        # Handle user management requests
        if method == "OPTIONS":
            response = { "statusCode": 200, "body": "" }
        if path == "/invite-user" and method == "POST":
            response = handle_user_invitation(event, context)
        elif path == "/users" and method == "GET":
            response = handle_list_users(event, context)
        elif path == "/update-user-group" and method == "POST":
            response = handle_update_user_group(event, context)
        elif path == "/remove-user" and method == "POST":
            response = handle_remove_user(event, context)
        elif path == "/send-otp" and method == "POST":
            response = handle_send_otp(event, context)
        elif path == "/verify-otp" and method == "POST":
            response = handle_verify_otp(event, context)
        elif path.startswith("/api"):
            event["path"] = path[4:] # Remove '/api' prefix and pass the rest to RepairShopr
            response = handle_repairshopr_proxy(event, context)
        else:
            return {
                "statusCode": 405,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
                    "Access-Control-Max-Age": "86400",
                    "Content-Type": "application/json"
                },
                "body": json.dumps({
                    "error": "Method not allowed",
                    "details": "This path or method is not allowed.",
                    "suggestion": "You're sending a request that doesn't exist."
                })
            }

        response["headers"] |= {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Max-Age": "86400"
        }
        return response
        
    except Exception as e:
        print(f"ERROR: Internal server error (rt): {str(e)}")
        print(f"Event: {json.dumps(event, default=str)}")
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
                "Access-Control-Max-Age": "86400",
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "error": str(e),
                "details": "An unexpected error occurred in the Lambda function.",
                "suggestion": "Check the Lambda logs for more details."
            })
        }

def handle_repairshopr_proxy(event, context):
    method = event["httpMethod"]
    headers = event.get("headers", {})
    body = event.get("body")
    query_string = event.get("queryStringParameters")
    path = event.get("path", "")

    # Build the full URL
    url = f"{TARGET_URL}{path}"
    if query_string:
        url += "?" + urllib.parse.urlencode(query_string)
    
    # Prepare headers
    request_headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    # Prepare request data
    data = None
    if body:
        if isinstance(body, str):
            data = body.encode('utf-8')
        else:
            data = body
    
    try:
        # Make the request
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=request_headers, method=method), timeout=30) as response:
            response_data = response.read()
            response_headers = dict(response.headers)
            
            response_body = response_data.decode('utf-8')
            
            return {
                "statusCode": response.status,
                "headers": response_headers,
                "body": response_body
            }
    except urllib.error.HTTPError as e: # Handle HTTP errors (4xx, 5xx)
        try:
            error_body = e.read().decode('utf-8') if e.fp else ""
        except:
            error_body = "Unable to decode error response"
        
        return {
            "statusCode": 502,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "error": "Bad Gateway",
                "details": error_body,
                "suggestion": f"A {e.code} error was returned from RepairShopr when making the request. Tried to send {method} request to {url} with body {body}"
            })
        }


def handle_user_invitation(event, context):
    body = json.loads(event.get("body", "{}"))
    email = body.get("email")
    
    if not email:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Email is required"})
        }
    
    user_groups = get_user_groups_from_event(event)
    if not can_invite_users(user_groups):
        return {
            "statusCode": 403,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Insufficient permissions to invite users"})
        }
    
    try:
        cognito = boto3.client('cognito-idp') # Create Cognito client
        
        temp_password = generate_temp_password() # Generate secure temporary password
        
        response = cognito.admin_create_user( # Create user
            UserPoolId=USER_POOL_ID,
            Username=email,
            UserAttributes=[
                {'Name': 'email', 'Value': email},
                {'Name': 'email_verified', 'Value': 'true'}
            ],
            TemporaryPassword=temp_password,
            MessageAction='SEND',
            DesiredDeliveryMediums=['EMAIL']
        )
        
        cognito.admin_add_user_to_group( # send request to cognito to add the newly created user "TrueTickets-Cacell-Employee"
            UserPoolId=USER_POOL_ID,
            Username=email,
            GroupName="TrueTickets-Cacell-Employee"
        )

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "message": f"Invitation sent successfully to {email}",
                "user": response.get('User', {})
            })
        }

    except Exception as group_error:
        return {
            "statusCode": 409,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({f"Could not invite user: {group_error}"})
        }

def get_user_groups_from_event(event):
    try:
        # Get user groups from the Cognito authorizer context
        request_context = event.get("requestContext", {})
        authorizer = request_context.get("authorizer", {})
        claims = authorizer.get("claims", {})
        
        # Extract groups from Cognito claims
        groups = claims.get("cognito:groups", [])
        if isinstance(groups, str):
            groups = groups.split(",")
        elif isinstance(groups, set):
            groups = list(groups)
        
        return groups
    except Exception as e:
        print(f"Error extracting user groups: {e}")
        return []

def can_invite_users(user_groups):
    # Only ApplicationAdmin, Owner, and Manager can invite users
    allowed_groups = [
        'TrueTickets-Cacell-ApplicationAdmin',
        'TrueTickets-Cacell-Owner', 
        'TrueTickets-Cacell-Manager'
    ]
    return any(group in allowed_groups for group in user_groups)

def handle_list_users(event, context):
    try:
        # Check user permissions
        user_groups = get_user_groups_from_event(event)
        if not can_manage_users(user_groups):
            return {
                "statusCode": 403,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Insufficient permissions to view users"})
            }
        
        # Create Cognito client
        cognito = boto3.client('cognito-idp')
        
        # List all users
        response = cognito.list_users(
            UserPoolId=USER_POOL_ID,
            Limit=60  # Maximum allowed by AWS
        )
        
        users = []
        for user in response.get('Users', []):
            # Get user groups
            try:
                groups_response = cognito.admin_list_groups_for_user(
                    UserPoolId=USER_POOL_ID,
                    Username=user['Username']
                )
                user_groups_list = [group['GroupName'] for group in groups_response.get('Groups', [])]
            except:
                user_groups_list = []
            
            # Extract email from attributes
            email = None
            for attr in user.get('Attributes', []):
                if attr['Name'] == 'email':
                    email = attr['Value']
                    break
            
            users.append({
                'username': user['Username'],
                'email': email,
                'enabled': user['Enabled'],
                'groups': user_groups_list,
                'created': user['UserCreateDate'].isoformat() if 'UserCreateDate' in user else None
            })
        
        try:
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"users": users})
            }
        except Exception as json_error:
            print(f"JSON serialization error: {json_error}")
            print(f"Users data: {users}")
            return {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": f"JSON serialization failed: {str(json_error)}"})
            }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to list users: {str(e)}"})
        }

def handle_update_user_group(event, context):
    try:
        # Check user permissions
        user_groups = get_user_groups_from_event(event)
        if not can_manage_users(user_groups):
            return {
                "statusCode": 403,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Insufficient permissions to manage users"})
            }
        
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        username = body.get("username")
        new_group = body.get("group")
        
        if not username or not new_group:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Username and group are required"})
            }
        
        # Create Cognito client
        cognito = boto3.client('cognito-idp')
        
        # Get current user groups
        current_groups_response = cognito.admin_list_groups_for_user(
            UserPoolId=USER_POOL_ID,
            Username=username
        )
        current_groups = [group['GroupName'] for group in current_groups_response.get('Groups', [])]
        
        # Remove user from all current groups
        for group in current_groups:
            try:
                cognito.admin_remove_user_from_group(
                    UserPoolId=USER_POOL_ID,
                    Username=username,
                    GroupName=group
                )
            except Exception as e:
                print(f"Warning: Could not remove user from group {group}: {e}")
        
        # Add user to new group
        cognito.admin_add_user_to_group(
            UserPoolId=USER_POOL_ID,
            Username=username,
            GroupName=new_group
        )
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"message": f"User {username} moved to group {new_group}"})
        }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to update user group: {str(e)}"})
        }

def handle_remove_user(event, context):
    try:
        # Check user permissions
        user_groups = get_user_groups_from_event(event)
        if not can_manage_users(user_groups):
            return {
                "statusCode": 403,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Insufficient permissions to remove users"})
            }
        
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        username = body.get("username")
        
        if not username:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Username is required"})
            }
        
        # Create Cognito client
        cognito = boto3.client('cognito-idp')
        
        # Remove user from all groups first
        try:
            groups_response = cognito.admin_list_groups_for_user(
                UserPoolId=USER_POOL_ID,
                Username=username
            )
            for group in groups_response.get('Groups', []):
                cognito.admin_remove_user_from_group(
                    UserPoolId=USER_POOL_ID,
                    Username=username,
                    GroupName=group['GroupName']
                )
        except Exception as e:
            print(f"Warning: Could not remove user from groups: {e}")
        
        # Delete the user
        cognito.admin_delete_user(
            UserPoolId=USER_POOL_ID,
            Username=username
        )
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"message": f"User {username} removed successfully"})
        }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to remove user: {str(e)}"})
        }

def can_manage_users(user_groups):
    # Only ApplicationAdmin and Owner can manage users
    allowed_groups = [
        'TrueTickets-Cacell-ApplicationAdmin',
        'TrueTickets-Cacell-Owner'
    ]
    return any(group in allowed_groups for group in user_groups)

def generate_temp_password():
    """Generate a secure temporary password that meets Cognito requirements"""
    # Generate 8 random characters
    password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
    # Add required special characters and ensure complexity
    return password + 'A1!'
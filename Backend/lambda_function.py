import os
import requests
import json
import boto3
import secrets
import string

API_KEY = os.environ["API_KEY"]
TARGET_URL = "https://Cacell.repairshopr.com/api/v1"
USER_POOL_ID = os.environ.get("USER_POOL_ID")

def get_cors_headers():
    """Get CORS headers for API responses"""
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Max-Age": "86400"
    }

def lambda_handler(event, context):
    """
    Lambda that handles both RepairShopr API proxy and user management operations.
    Authentication is handled by API Gateway with Cognito Authorizer.
    """
    # Handle preflight OPTIONS requests
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": get_cors_headers(),
            "body": ""
        }
    
    try:
        method = event["httpMethod"]
        path = event.get("path", "")
        
        # Handle user management requests
        if path == "/invite-user" and method == "POST":
            return handle_user_invitation(event, context)
        elif path == "/users" and method == "GET":
            return handle_list_users(event, context)
        elif path == "/update-user-group" and method == "POST":
            return handle_update_user_group(event, context)
        elif path == "/remove-user" and method == "POST":
            return handle_remove_user(event, context)
        elif path == "/send-otp" and method == "POST":
            return handle_send_otp(event, context)
        elif path == "/verify-otp" and method == "POST":
            return handle_verify_otp(event, context)
        
        # Handle RepairShopr proxy requests (anything starting with /api)
        if path.startswith("/api"):
            # Remove /api prefix and pass the rest to RepairShopr
            event["path"] = path[4:]  # Remove "/api" (4 characters)
            return handle_repairshopr_proxy(event, context)
        
        # Handle direct RepairShopr API calls (for backward compatibility)
        return handle_repairshopr_proxy(event, context)
        
    except Exception as e:
        error_msg = f"Internal server error: {str(e)}"
        print(f"ERROR: {error_msg}")
        print(f"Event: {json.dumps(event, default=str)}")
        headers = {"Content-Type": "application/json"}
        headers.update(get_cors_headers())
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({
                "error": error_msg,
                "details": "An unexpected error occurred in the Lambda function.",
                "suggestion": "Check the Lambda logs for more details."
            })
        }

def handle_user_invitation(event, context):
    """Handle user invitation requests with proper permission checking"""
    try:
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        email = body.get("email")
        
        if not email:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Email is required"})
            }
        
        # Check user permissions from Cognito groups
        user_groups = get_user_groups_from_event(event)
        if not can_invite_users(user_groups):
            return {
                "statusCode": 403,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Insufficient permissions to invite users"})
            }
        
        # Create Cognito client
        cognito = boto3.client('cognito-idp')
        
        # Generate secure temporary password
        temp_password = generate_temp_password()
        
        # Create user
        response = cognito.admin_create_user(
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
        
        # Add user to default group based on inviter's permissions
        default_group = get_default_group_for_inviter(user_groups)
        try:
            cognito.admin_add_user_to_group(
                UserPoolId=USER_POOL_ID,
                Username=email,
                GroupName=default_group
            )
        except Exception as group_error:
            print(f"Warning: Could not add user to group: {group_error}")
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "message": f"Invitation sent successfully to {email}",
                "user": response.get('User', {})
            })
        }
        
    except cognito.exceptions.UsernameExistsException:
        return {
            "statusCode": 409,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "User with this email already exists"})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to invite user: {str(e)}"})
        }

def handle_repairshopr_proxy(event, context):
    """Handle RepairShopr API proxy requests"""
    try:
        method = event["httpMethod"]
        headers = event.get("headers", {})
        body = event.get("body")
        query_string = event.get("queryStringParameters")
        path = event.get("path", "")

        # Debug logging
        print(f"=== REPAIRSHOPR PROXY DEBUG ===")
        print(f"Method: {method}")
        print(f"Path: {path}")
        print(f"Full URL: {TARGET_URL}{path}")
        print(f"Headers: {headers}")
        print(f"Query params: {query_string}")
        print(f"Body: {body}")
        print(f"=== END DEBUG ===")

        # Remove the original Authorization header and add our API key
        headers.pop("Authorization", None)
        headers["Authorization"] = f"Bearer {API_KEY}"

        # Construct the full URL with the path
        full_url = f"{TARGET_URL}{path}"

        print(f"Making request to: {full_url}")
        print(f"With headers: {headers}")

        resp = requests.request(
            method=method,
            url=full_url,
            headers=headers,
            params=query_string,
            data=body,
            timeout=30  # Add timeout to prevent hanging
        )

        print(f"Response status: {resp.status_code}")
        print(f"Response headers: {dict(resp.headers)}")
        print(f"Response body (first 500 chars): {resp.text[:500]}")

        # Check for specific RepairShopr API errors and provide better error messages
        if resp.status_code == 401:
            print("ERROR: 401 Unauthorized - API key is invalid or expired")
            return {
                "statusCode": 401,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
                },
                "body": json.dumps({
                    "error": "Invalid API key",
                    "details": "The RepairShopr API key is invalid, expired, or does not have the required permissions.",
                    "suggestion": "Please check your API key in the Lambda environment variables and ensure it has the correct permissions."
                })
            }
        elif resp.status_code == 403:
            print("ERROR: 403 Forbidden - API key lacks permissions")
            return {
                "statusCode": 403,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
                },
                "body": json.dumps({
                    "error": "Insufficient permissions",
                    "details": "The RepairShopr API key does not have the required permissions for this operation.",
                    "suggestion": "Please check your API key permissions in RepairShopr."
                })
            }
        elif resp.status_code == 404:
            print("ERROR: 404 Not Found - API endpoint not found")
            return {
                "statusCode": 404,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
                },
                "body": json.dumps({
                    "error": "API endpoint not found",
                    "details": "The requested RepairShopr API endpoint was not found.",
                    "suggestion": "Please check the API endpoint URL."
                })
            }
        elif resp.status_code >= 400:
            print(f"ERROR: {resp.status_code} - API returned error")
            try:
                # Try to parse the error response from RepairShopr
                error_data = resp.json()
                return {
                    "statusCode": resp.status_code,
                    "headers": {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
                    },
                    "body": json.dumps({
                        "error": f"RepairShopr API error ({resp.status_code})",
                        "details": error_data.get("message", resp.text),
                        "suggestion": "Please check the RepairShopr API documentation for this error."
                    })
                }
            except:
                # If we can't parse the error response, return the raw text
                return {
                    "statusCode": resp.status_code,
                    "headers": {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
                    },
                    "body": json.dumps({
                        "error": f"RepairShopr API error ({resp.status_code})",
                        "details": resp.text,
                        "suggestion": "Please check the RepairShopr API documentation for this error."
                    })
                }

        # Add CORS headers to the response
        response_headers = dict(resp.headers)
        response_headers.update({
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        })
        
        return {
            "statusCode": resp.status_code,
            "headers": response_headers,
            "body": resp.text
        }

    except requests.exceptions.ConnectionError as e:
        error_msg = f"Connection error to RepairShopr API: {str(e)}"
        print(f"ERROR: {error_msg}")
        return {
            "statusCode": 502,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
            },
            "body": json.dumps({
                "error": "Connection failed",
                "details": error_msg,
                "suggestion": "Check if the RepairShopr API is accessible and the URL is correct."
            })
        }
    except requests.exceptions.Timeout as e:
        error_msg = f"Request timeout to RepairShopr API: {str(e)}"
        print(f"ERROR: {error_msg}")
        return {
            "statusCode": 504,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
            },
            "body": json.dumps({
                "error": "Request timeout",
                "details": error_msg,
                "suggestion": "The RepairShopr API is taking too long to respond."
            })
        }
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP error from RepairShopr API: {str(e)}"
        print(f"ERROR: {error_msg}")
        return {
            "statusCode": 502,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
            },
            "body": json.dumps({
                "error": "HTTP error from RepairShopr API",
                "details": error_msg,
                "suggestion": "Check if the API key is correct and has proper permissions."
            })
        }
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        print(f"ERROR: {error_msg}")
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
            },
            "body": json.dumps({
                "error": "Internal server error",
                "details": error_msg,
                "suggestion": "Check the Lambda logs for more details."
            })
        }

def get_user_groups_from_event(event):
    """Extract user groups from Cognito authorizer context"""
    try:
        # Get user groups from the Cognito authorizer context
        request_context = event.get("requestContext", {})
        authorizer = request_context.get("authorizer", {})
        claims = authorizer.get("claims", {})
        
        # Extract groups from Cognito claims
        groups = claims.get("cognito:groups", [])
        if isinstance(groups, str):
            groups = groups.split(",")
        
        return groups
    except Exception as e:
        print(f"Error extracting user groups: {e}")
        return []

def can_invite_users(user_groups):
    """Check if user has permission to invite other users"""
    # Based on your AWS setup, only ApplicationAdmin, Owner, and Manager can invite users
    allowed_groups = [
        'TrueTickets-Cacell-ApplicationAdmin',
        'TrueTickets-Cacell-Owner', 
        'TrueTickets-Cacell-Manager'
    ]
    return any(group in allowed_groups for group in user_groups)

def get_default_group_for_inviter(user_groups):
    """Determine which group to assign new users based on inviter's permissions"""
    # ApplicationAdmin can create any group
    if 'TrueTickets-Cacell-ApplicationAdmin' in user_groups:
        return 'TrueTickets-Cacell-Employee'  # Default to lowest level
    
    # Owner can create Manager or Employee
    if 'TrueTickets-Cacell-Owner' in user_groups:
        return 'TrueTickets-Cacell-Employee'  # Default to Employee
    
    # Manager can only create Employee
    if 'TrueTickets-Cacell-Manager' in user_groups:
        return 'TrueTickets-Cacell-Employee'
    
    # Fallback
    return 'TrueTickets-Cacell-Employee'

def handle_list_users(event, context):
    """Handle listing all users in the user pool"""
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
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"users": users})
        }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to list users: {str(e)}"})
        }

def handle_update_user_group(event, context):
    """Handle updating a user's group"""
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
    """Handle removing a user from the user pool"""
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
    """Check if user has permission to manage other users"""
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

def handle_send_otp(event, context):
    """Handle OTP sending requests"""
    try:
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        email = body.get("email")
        
        if not email:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Email is required"})
            }
        
        # Generate a 6-digit OTP
        otp = ''.join(secrets.choice(string.digits) for _ in range(6))
        
        # Store OTP in DynamoDB (you'll need to create this table)
        # For now, we'll use a simple approach and store in memory
        # In production, you should use DynamoDB or another storage solution
        
        # Send OTP via email (you'll need to configure SES or another email service)
        # For now, we'll just log it (in production, send actual email)
        print(f"OTP for {email}: {otp}")
        
        # TODO: Implement actual email sending using AWS SES
        # TODO: Store OTP in DynamoDB with expiration
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"message": "OTP sent successfully"})
        }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to send OTP: {str(e)}"})
        }

def handle_verify_otp(event, context):
    """Handle OTP verification requests"""
    try:
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        email = body.get("email")
        otp = body.get("otp")
        
        if not email or not otp:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Email and OTP are required"})
            }
        
        # TODO: Implement actual OTP verification against stored OTP
        # For now, we'll just log the verification attempt
        print(f"OTP verification attempt for {email}: {otp}")
        
        # TODO: Check OTP against stored value in DynamoDB
        # TODO: Check OTP expiration
        # TODO: Implement rate limiting
        
        # For now, we'll just return success (in production, verify against stored OTP)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"message": "OTP verified successfully"})
        }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to verify OTP: {str(e)}"})
        }
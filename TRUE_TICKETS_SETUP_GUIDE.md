# True Tickets - Complete AWS Setup Guide

This comprehensive guide will help you set up the complete True Tickets application with AWS Cognito authentication, user management, and RepairShopr API integration.

## 🏗️ Architecture Overview

True Tickets is a full-stack React application with the following architecture:

- **Frontend**: React with Material Design components and dark theme
- **Authentication**: AWS Cognito User Pool with group-based permissions
- **Backend**: AWS Lambda function with dual functionality:
  - RepairShopr API proxy (via `/api/*` endpoints)
  - User management system (invite, list, edit, remove users)
- **API Gateway**: REST API with Cognito authorization
- **Security**: JWT token authentication with role-based access control

## 📋 Prerequisites

- AWS Account with appropriate permissions
- Your RepairShopr API key
- Domain name (optional, for production)
- Node.js and npm installed locally

## 🔐 Step 1: Create AWS Cognito User Pool

### 1.1 Create User Pool

1. Go to AWS Cognito in the AWS Console
2. Click "Create user pool"
3. Choose "Cognito user pool" (not hosted UI)
4. Configure sign-in experience:
   - ✅ **Email** (enabled)
   - ❌ **Username** (disabled)
   - ❌ **Phone number** (disabled)
   - Click "Next"
5. Configure security requirements:
   - Password policy: Choose your preferred settings
   - MFA: **Optional** (for OTP authentication)
   - Click "Next"
6. Configure sign-up experience:
   - Disable if you want to create users manually
   - Click "Next"
7. Configure message delivery:
   - Choose "Send email with Cognito" (for password resets)
   - Click "Next"
8. Integrate your app:
   - User pool name: `TrueTicketsPool`
   - App client name: `true-tickets-web-client`
   - **Important**: Uncheck "Generate client secret" (we need a public client for web apps)
   - Click "Next"
9. Review and create the user pool

### 1.2 Configure User Groups

1. Go to your User Pool → "Groups" tab
2. Click "Create group" and create the following groups:

#### ApplicationAdmin Group
- **Group name**: `TrueTickets-Cacell-ApplicationAdmin`
- **Description**: `For the administrator of the ticketing system application`
- **Precedence**: `1`
- **Permissions**: Full user management, can invite users, can manage all groups

#### Owner Group
- **Group name**: `TrueTickets-Cacell-Owner`
- **Description**: `For the owner of Cacell`
- **Precedence**: `2`
- **Permissions**: Full user management, can invite users, can manage all groups

#### Manager Group
- **Group name**: `TrueTickets-Cacell-Manager`
- **Description**: `For managers of Cacell (can invite users as employees)`
- **Precedence**: `3`
- **Permissions**: Can invite users as employees only

#### Employee Group
- **Group name**: `TrueTickets-Cacell-Employee`
- **Description**: `For employees of Cacell`
- **Precedence**: `4`
- **Permissions**: Standard access, no user management

### 1.3 Configure MFA (Optional)

For OTP authentication, configure MFA:

1. Go to User Pool → "Multi-factor authentication"
2. Enable MFA and select:
   - **Software token MFA** (recommended for authenticator apps)
   - **SMS MFA** (alternative for phone numbers)

### 1.4 Get User Pool Details

After creation, note down:
- **User Pool ID**: `us-east-1_XXXXXXXXX` (from the User pool overview)
- **App Client ID**: `XXXXXXXXXXXXXXXXXXXXXXXXXX` (from App integration tab)

## 🔧 Step 2: Create IAM Policy and Role

### 2.1 Create IAM Policy

1. Go to IAM Console → Policies → Create Policy
2. Use JSON editor with this policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cognito-idp:AdminCreateUser",
                "cognito-idp:AdminAddUserToGroup",
                "cognito-idp:AdminRemoveUserFromGroup",
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminListGroupsForUser",
                "cognito-idp:AdminDeleteUser",
                "cognito-idp:ListUsers",
                "cognito-idp:ListGroups",
                "cognito-idp:AdminDisableUser",
                "cognito-idp:AdminEnableUser"
            ],
            "Resource": "arn:aws:cognito-idp:YOUR_REGION:YOUR_ACCOUNT_ID:userpool/YOUR_USER_POOL_ID"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        }
    ]
}
```

3. Name it: `TrueTicketsCognitoUserManagementPolicy`

### 2.2 Create IAM Role

1. Go to IAM Console → Roles → Create Role
2. Select "AWS Service" → "Lambda"
3. Attach the policy you created above
4. Name it: `TrueTicketsLambdaExecutionRole`

**Trust Policy:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

## ⚡ Step 3: Create Lambda Function

### 3.1 Create the Function

1. Go to AWS Lambda in the AWS Console
2. Click "Create function"
3. Choose "Author from scratch"
4. Function name: `true-tickets-proxy`
5. Runtime: `Python 3.9` or higher
6. Architecture: `x86_64`
7. **Execution role**: Select `TrueTicketsLambdaExecutionRole`
8. Click "Create function"

### 3.2 Upload Code

1. In the Lambda function, go to the "Code" tab
2. Replace the default code with the contents of `Backend/lambda_function.py`
3. Click "Deploy"

### 3.3 Install Dependencies

1. Create a zip file with the Lambda function and dependencies:
   ```bash
   cd Backend
   pip install -r requirements.txt -t .
   zip -r lambda-deployment.zip .
   ```
2. Upload the zip file to Lambda

### 3.4 Configure Environment Variables

1. Go to the "Configuration" tab → "Environment variables"
2. Add the following variables:
   - `API_KEY`: Your RepairShopr API key
   - `USER_POOL_ID`: Your Cognito User Pool ID

## 🌐 Step 4: Create API Gateway

### 4.1 Create REST API

1. Go to AWS API Gateway in the AWS Console
2. Click "Create API"
3. Choose "REST API" → "Build"
4. API name: `true-tickets-api`
5. Description: `API Gateway for True Tickets application`
6. Click "Create API"

### 4.2 Create Cognito Authorizer

1. In your API, click "Authorizers" in the left sidebar
2. Click "Create New Authorizer"
3. Authorizer name: `cognito-authorizer`
4. Type: `Cognito`
5. Cognito User Pool: Select your user pool from Step 1
6. Token Source: `Authorization` (this is the default)
7. Click "Create"

### 4.3 Create API Resources

Create the following resources with methods:

#### RepairShopr API Proxy
- **Resource**: `/api`
- **Method**: `ANY`
- **Integration**: Lambda Function
- **Authorization**: Cognito

#### User Management Resources
- **Resource**: `/invite-user` (POST)
- **Resource**: `/users` (GET)
- **Resource**: `/update-user-group` (POST)
- **Resource**: `/remove-user` (POST)
- **All with**: Lambda Function integration + Cognito authorization

### 4.4 Deploy API

1. Click "Actions" → "Deploy API"
2. Deployment stage: `prod`
3. Deployment description: `Production deployment with user management`
4. Click "Deploy"
5. **Important**: Note down the "Invoke URL" - this is your API Gateway URL

## 🎨 Step 5: Configure React Application

### 5.1 Create Environment Variables File

1. Run the setup script to create your `.env` file:
   ```bash
   npm run setup-env
   ```

2. Edit `.env` with your actual values:
   ```bash
   # AWS Configuration
   VITE_AWS_REGION=us-east-2
   VITE_USER_POOL_ID=us-east-2_XXXXXXXXX
   VITE_USER_POOL_WEB_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
   VITE_API_GATEWAY_URL=https://your-api-gateway-url.amazonaws.com/prod
   VITE_COOKIE_DOMAIN=.yourdomain.com
   VITE_COOKIE_SECURE=false
   ```

3. **Important**: 
   - Never commit `.env` to version control - it's already in `.gitignore`
   - `.env` is also protected by `.cursorignore` for Cursor IDE
   - Use different values for development/production

### 5.2 Install Dependencies

```bash
npm install
```

### 5.3 Start Development Server

```bash
npm run dev
```

## 👥 Step 6: Create Test Users

### 6.1 Create Admin User

1. Go to your Cognito User Pool
2. Click "Users" tab
3. Click "Create user"
4. Fill in:
   - Username: `admin@yourcompany.com`
   - Email: `admin@yourcompany.com`
   - Temporary password: `TempPass123!`
   - Uncheck "Mark email as verified" if you want to test email verification
5. Click "Create user"

### 6.2 Assign User to Admin Group

1. In the Users tab, click on the user you just created
2. Click "Groups" tab
3. Click "Add user to group"
4. Select `TrueTickets-Cacell-ApplicationAdmin` group
5. Click "Add to group"

### 6.3 Set Permanent Password

1. In the Users tab, click on the user you just created
2. Click "Actions" → "Set permanent password"
3. Set a new password
4. Click "Save"

### 6.4 Create Additional Users

Create users for each group:
- **Manager**: `manager@yourcompany.com` → `TrueTickets-Cacell-Manager`
- **Employee**: `employee@yourcompany.com` → `TrueTickets-Cacell-Employee`

## 🧪 Step 7: Test the Setup

### 7.1 Test React Application

1. Start your React app: `npm run dev`
2. Navigate to the application
3. You should see a login form
4. Log in with the user you created in Step 6
5. The app should now work with authenticated API calls

### 7.2 Test User Management

1. Log in as an ApplicationAdmin or Owner
2. Click the user menu (gear icon)
3. You should see "Manage Users" option
4. Test inviting a new user
5. Test editing user groups
6. Test removing users

### 7.3 Test Permission Levels

- **ApplicationAdmin/Owner**: Should see "Manage Users" option
- **Manager**: Should see "Invite User" option only
- **Employee**: Should see neither option

## 🔐 Security Features

### Authentication & Authorization
- **JWT token authentication** via AWS Cognito
- **Group-based permission checking** (server-side validation)
- **Secure API key storage** in Lambda environment variables
- **CORS protection** and proper error handling

### User Management Permissions

| Group | Can Invite | Can Manage Users | Can View Users | Can Remove Users |
|-------|------------|------------------|-----------------|------------------|
| **ApplicationAdmin** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Owner** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Manager** | ✅ Yes (Employee only) | ❌ No | ❌ No | ❌ No |
| **Employee** | ❌ No | ❌ No | ❌ No | ❌ No |

### API Endpoints

| Endpoint | Method | Purpose | Authorization |
|----------|--------|---------|--------------|
| `/api/*` | ANY | RepairShopr API proxy | Cognito |
| `/invite-user` | POST | User invitation | Manager+ |
| `/users` | GET | List all users | Admin/Owner only |
| `/update-user-group` | POST | Change user groups | Admin/Owner only |
| `/remove-user` | POST | Delete users | Admin/Owner only |

## 🚀 Production Considerations

### Domain Configuration
- Update CORS settings in API Gateway to use your actual domain
- Configure custom domain in API Gateway
- Update React app to use the custom domain

### SSL Certificate
- Create certificate in AWS Certificate Manager
- Configure custom domain in API Gateway
- Update React app to use HTTPS

### Environment Variables
- Use AWS Systems Manager Parameter Store for sensitive configuration
- Use AWS Secrets Manager for API keys

## 🛠️ Troubleshooting

### Common Issues

1. **CORS Errors**: Make sure CORS is properly configured in API Gateway
2. **Authentication Errors**: Verify your Cognito configuration matches your environment variables
3. **API Gateway 502 Errors**: Check Lambda function logs in CloudWatch
4. **Token Expiration**: The Lambda function handles token refresh automatically
5. **Environment Variables Not Loading**: Check that `.env` file exists and has correct variable names
6. **Wrong API Gateway URL**: 
   - ❌ **Wrong**: `https://us-east-xxxxxxxx.auth.us-east-2.amazoncognito.com` (This is Cognito domain)
   - ✅ **Correct**: `https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com/prod` (This is API Gateway URL)

### Debugging

1. Check CloudWatch logs for Lambda function errors
2. Use browser developer tools to inspect network requests
3. Verify JWT tokens in [jwt.io](https://jwt.io)
4. Check that environment variables are loaded: `console.log(import.meta.env)`

## 🔒 Security Best Practices

### Never Commit Sensitive Data

**❌ NEVER commit these to GitHub:**
- User Pool ID (e.g., `us-east-1_XXXXXXXXX`)
- App Client ID (e.g., `XXXXXXXXXXXXXXXXXXXXXXXXXX`)
- API Keys
- Secrets
- Private URLs

**✅ SAFE to commit:**
- User Pool Name (e.g., `TrueTicketsPool`)
- App Client Name (e.g., `true-tickets-web-client`)
- AWS Region (e.g., `us-east-1`)

### Additional Security Measures

1. **Enable MFA** in Cognito User Pool
2. **Set strong password policies**
3. **Use HTTPS** in production
4. **Regular security audits**
5. **Monitor CloudWatch logs** for suspicious activity

## 💰 Cost Optimization

- Lambda function only runs when requests are made
- API Gateway charges per request
- Cognito charges per user per month
- Consider using CloudFront for caching if you have high traffic

## 📚 Additional Resources

- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [AWS API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [React Documentation](https://react.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

This setup provides a secure, scalable solution for your True Tickets application with proper authentication, user management, and API key protection.

# True Tickets - React Application with AWS Cognito

A full-stack ticket management system built with React, TypeScript, and AWS services, designed to interface with the RepairShopr API.

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS (Material Design)
- **Authentication**: AWS Cognito User Pool with group-based permissions
- **Backend**: AWS Lambda (Python) acting as API proxy
- **API Gateway**: REST API with Cognito authorization
- **Security**: JWT tokens with role-based access control

## 📋 Prerequisites

- AWS Account with appropriate permissions
- RepairShopr API key
- Node.js 18+ and npm installed
- Domain name (for production deployment)

---

## 🚀 Quick Start (Development)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Run the setup script to create your `.env` file:

```bash
npm run setup-env
```

Edit `.env` with your AWS configuration:

```env
VITE_AWS_REGION=us-east-2
VITE_USER_POOL_ID=us-east-2_XXXXXXXXX
VITE_USER_POOL_WEB_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_API_GATEWAY_URL=https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com/prod
VITE_COOKIE_DOMAIN=localhost
VITE_COOKIE_SECURE=false
```

### 3. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

---

## 🔐 AWS Setup Guide

### Step 1: Create Cognito User Pool

1. Navigate to AWS Cognito → **Create user pool**
2. Configure sign-in:
   - ✅ Email only (no username or phone)
3. Configure security:
   - Set password policy (recommended: 8+ chars, uppercase, lowercase, numbers)
   - MFA: **Optional** (recommended for production)
4. Configure message delivery:
   - Use Cognito email service (or SES for production)
5. Integrate app:
   - User pool name: `TrueTicketsPool`
   - App client name: `true-tickets-web-client`
   - **❌ UNCHECK "Generate client secret"** (required for web apps)

#### Create User Groups

Create these groups with the specified precedence:

| Group Name | Precedence | Permissions |
|------------|------------|-------------|
| `TrueTickets-Cacell-ApplicationAdmin` | 1 | Full user management |
| `TrueTickets-Cacell-Owner` | 2 | Full user management |
| `TrueTickets-Cacell-Manager` | 3 | Can invite employees |
| `TrueTickets-Cacell-Employee` | 4 | Standard access |

**Note:** After creation, save your:
- User Pool ID: `us-east-2_XXXXXXXXX`
- App Client ID: `XXXXXXXXXXXXXXXXXXXXXXXXXX`

### Step 2: Create IAM Role for Lambda

1. Go to IAM → **Policies** → **Create Policy**
2. Use this JSON policy:

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
            "Resource": "arn:aws:cognito-idp:REGION:ACCOUNT_ID:userpool/USER_POOL_ID"
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
4. Go to IAM → **Roles** → **Create Role**
5. Select **Lambda** as the service
6. Attach your policy
7. Name it: `TrueTicketsLambdaExecutionRole`

### Step 3: Deploy Lambda Function

1. Go to AWS Lambda → **Create function**
2. Configuration:
   - Name: `true-tickets-proxy`
   - Runtime: **Python 3.9+**
   - Execution role: Select `TrueTicketsLambdaExecutionRole`
3. Upload code from `Backend/lambda_function.py`
4. Install dependencies:

```bash
cd Backend
pip install -r requirements.txt -t .
zip -r lambda-deployment.zip .
```

5. Upload the zip file to Lambda
6. Add environment variables:
   - `API_KEY`: Your RepairShopr API key
   - `USER_POOL_ID`: Your Cognito User Pool ID

### Step 4: Create API Gateway

1. Go to API Gateway → **Create API** → **REST API**
2. Name: `true-tickets-api`
3. Create **Cognito Authorizer**:
   - Name: `cognito-authorizer`
   - Type: Cognito
   - Token Source: `Authorization`
4. Create resources with Lambda integration:

| Resource | Method | Authorization |
|----------|--------|---------------|
| `/api` (proxy) | ANY | Cognito |
| `/invite-user` | POST | Cognito |
| `/users` | GET | Cognito |
| `/update-user-group` | POST | Cognito |
| `/remove-user` | POST | Cognito |

5. Deploy API:
   - Stage: `prod`
   - Save the **Invoke URL** (e.g., `https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com/prod`)

### Step 5: Create First User

1. Go to Cognito User Pool → **Users** → **Create user**
2. Set email and temporary password
3. Add user to `TrueTickets-Cacell-ApplicationAdmin` group
4. Log in to the app and change password

---

## 🎯 Production Deployment

### Build for Production

```bash
npm run build
```

The build output will be in the `dist/` folder.

### Deploy to Hosting

#### Option 1: AWS Amplify (Recommended)

1. Connect your GitHub repository to AWS Amplify
2. Configure build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
3. Add environment variables in Amplify Console
4. Deploy

#### Option 2: AWS S3 + CloudFront

1. Create S3 bucket for static hosting
2. Upload `dist/` contents to bucket
3. Create CloudFront distribution pointing to bucket
4. Configure CloudFront for SPA routing

#### Option 3: Traditional Web Server

1. Upload `dist/` contents to your web server
2. Configure server for SPA routing (redirect all routes to `index.html`)

### Production Recommendations

#### 1. Environment Variables

**In production, set:**
```env
VITE_COOKIE_DOMAIN=.yourdomain.com
VITE_COOKIE_SECURE=true
```

**Security Note:** Never commit `.env` to version control. Use:
- AWS Systems Manager Parameter Store for configuration
- AWS Secrets Manager for sensitive values
- Environment variables in your hosting platform

#### 2. Custom Domain

1. Register domain in Route 53 (or your DNS provider)
2. Create SSL certificate in AWS Certificate Manager
3. Configure custom domain in API Gateway
4. Update API Gateway URL in your environment variables
5. Configure CORS in API Gateway for your domain

#### 3. Enable MFA

For production, enable MFA in Cognito:
- Go to User Pool → **MFA and verifications**
- Enable **Software token MFA** (authenticator apps)
- Optionally enable **SMS MFA**

#### 4. CORS Configuration

Update API Gateway CORS settings:

```json
{
  "Access-Control-Allow-Origin": "https://yourdomain.com",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Max-Age": "3600"
}
```

#### 5. Monitoring & Logging

- Enable CloudWatch Logs for Lambda
- Set up CloudWatch Alarms for error rates
- Monitor API Gateway metrics
- Review Cognito authentication metrics regularly

#### 6. Security Best Practices

- ✅ Enable AWS WAF on API Gateway
- ✅ Set up CloudTrail for audit logging
- ✅ Use AWS Secrets Manager for API keys
- ✅ Regular security audits of IAM policies
- ✅ Enable CloudWatch anomaly detection
- ✅ Implement rate limiting in API Gateway
- ✅ Regular password policy reviews

#### 7. Cost Optimization

- Use CloudFront caching to reduce API calls
- Set up Lambda reserved concurrency if needed
- Monitor and optimize Lambda execution time
- Use Cognito free tier (first 50,000 MAUs free)
- Consider AWS Budgets alerts

#### 8. Backup & Recovery

- Enable S3 versioning for frontend assets
- Regular Lambda function backups
- Export Cognito users periodically
- Document recovery procedures

---

## 🔑 User Management

### Permission Levels

| Role | Invite Users | Manage Users | View Users | Remove Users |
|------|--------------|--------------|------------|--------------|
| **ApplicationAdmin** | ✅ All roles | ✅ Yes | ✅ Yes | ✅ Yes |
| **Owner** | ✅ All roles | ✅ Yes | ✅ Yes | ✅ Yes |
| **Manager** | ✅ Employees only | ❌ No | ❌ No | ❌ No |
| **Employee** | ❌ No | ❌ No | ❌ No | ❌ No |

### Adding New Users

1. Log in as ApplicationAdmin or Owner
2. Click user menu (gear icon) → **Manage Users**
3. Click **Invite User**
4. Enter email and select role
5. User receives email with temporary password

---

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run setup-env` - Create `.env` file from template
- `npm run lint` - Run ESLint

### Project Structure

```
src/
├── api/              # API client configuration
├── components/       # React components
│   └── ui/          # Reusable UI components
├── constants/        # App constants (statuses, devices, etc.)
├── hooks/           # Custom React hooks
├── types/           # TypeScript type definitions
└── utils/           # Utility functions

Backend/
└── lambda_function.py  # AWS Lambda function code
```

### TypeScript Types

All API types are defined in `src/types/api.ts` based on the RepairShopr API structure. Import them as needed:

```typescript
import { LargeTicket, Customer, PostTicket } from './types/api';

const ticket: LargeTicket = await api.get(`/tickets/${id}`);
```

---

## 🐛 Troubleshooting

### Common Issues

**CORS Errors**
- Verify CORS configuration in API Gateway
- Check that API Gateway URL is correct in `.env`

**Authentication Errors**
- Verify User Pool ID and App Client ID
- Ensure user is in correct group
- Check JWT token expiration

**API Gateway 502 Errors**
- Check Lambda function logs in CloudWatch
- Verify Lambda has correct IAM permissions
- Check Lambda timeout settings (increase if needed)

**Environment Variables Not Loading**
- Verify `.env` file exists
- Variables must start with `VITE_`
- Restart development server after changes

**Wrong API Gateway URL**
- ❌ Wrong: `https://xxx.auth.us-east-2.amazoncognito.com` (Cognito domain)
- ✅ Correct: `https://xxx.execute-api.us-east-2.amazonaws.com/prod` (API Gateway)

### Debug Mode

Enable verbose logging:

```typescript
console.log('Environment:', import.meta.env);
console.log('API Gateway URL:', import.meta.env.VITE_API_GATEWAY_URL);
```

Check CloudWatch Logs:
1. Go to CloudWatch → Log Groups
2. Find `/aws/lambda/true-tickets-proxy`
3. View recent log streams

---

## 📊 API Endpoints

### RepairShopr Proxy
- `GET /api/tickets` - List tickets
- `GET /api/tickets/:id` - Get ticket
- `POST /api/tickets` - Create ticket
- `PUT /api/tickets/:id` - Update ticket
- `GET /api/customers` - List customers
- `GET /api/customers/:id` - Get customer
- `POST /api/customers` - Create customer

### User Management
- `POST /invite-user` - Invite new user (Manager+)
- `GET /users` - List users (Admin/Owner only)
- `POST /update-user-group` - Change user groups (Admin/Owner only)
- `POST /remove-user` - Delete user (Admin/Owner only)

---

## 📝 License

Proprietary - All rights reserved

---

## 🆘 Support

For issues or questions:
1. Check CloudWatch logs for Lambda function errors
2. Review API Gateway execution logs
3. Verify Cognito configuration
4. Check browser console for frontend errors

---

## 🔒 Security Notes

**Never commit these to version control:**
- User Pool IDs
- App Client IDs  
- API Keys
- `.env` file

**Safe to commit:**
- User Pool Name
- App Client Name
- AWS Region
- Group names

The `.env` file is protected by both `.gitignore` and `.cursorignore`.
# Cognito Password Reset Troubleshooting Guide

## Error: "Cannot reset password for the user as there is no registered/verified email or phone_number"

This error occurs when Cognito cannot find a verified email or phone number for the user. Here's how to fix it:

## 🔍 **Step 1: Check User Pool Configuration**

### **1.1 User Pool Settings**
1. Go to AWS Console → Cognito → User Pools
2. Select your user pool
3. Go to **Sign-in experience** tab
4. Under **User name requirements**, ensure:
   - ✅ **Email** is selected as a sign-in option
   - ✅ **Allow users to sign in with email** is checked

### **1.2 App Client Settings**
1. Go to **App integration** tab
2. Click on your app client
3. Under **Authentication flows**, ensure:
   - ✅ **ALLOW_USER_SRP_AUTH** is enabled
   - ✅ **ALLOW_REFRESH_TOKEN_AUTH** is enabled
4. Under **Auth flows**, ensure:
   - ✅ **SRP_AUTH** is enabled

## 🔍 **Step 2: Check User Attributes**

### **2.1 Verify User Email Status**
1. Go to **Users** tab in your User Pool
2. Find the user by email
3. Check the **email_verified** attribute:
   - Should be `true`
   - If `false`, the user needs to verify their email first

### **2.2 Check Required Attributes**
1. Go to **Sign-up experience** tab
2. Under **Required attributes**, ensure:
   - ✅ **email** is listed as required
   - ✅ **email** is marked as verified

## 🔍 **Step 3: Check User Pool Policies**

### **3.1 Password Policy**
1. Go to **Sign-up experience** tab
2. Under **Password policy**, ensure:
   - ✅ **Temporary passwords** are allowed
   - ✅ **Password reset** is enabled

### **3.2 MFA Settings**
1. Go to **Sign-in experience** tab
2. Under **Multi-factor authentication**:
   - If MFA is required, ensure the user has a verified phone number
   - Or disable MFA for testing

## 🔍 **Step 4: Test with AWS CLI**

Run this command to check the user's attributes:

```bash
aws cognito-idp admin-get-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username USER_EMAIL \
  --region us-east-2
```

Look for:
- `"email_verified": true`
- `"email": "user@example.com"`

## 🔍 **Step 5: Common Fixes**

### **Fix 1: Verify User Email**
If the user's email is not verified:
1. Go to **Users** tab
2. Find the user
3. Click **Actions** → **Send verification message**
4. User should receive verification email
5. User clicks verification link

### **Fix 2: Update User Attributes**
If attributes are missing:
1. Go to **Users** tab
2. Find the user
3. Click **Actions** → **Edit user attributes**
4. Ensure `email` is present and verified

### **Fix 3: Check App Client Permissions**
1. Go to **App integration** tab
2. Click on your app client
3. Under **Authentication flows**, ensure:
   - ✅ **ALLOW_USER_SRP_AUTH** is enabled
   - ✅ **ALLOW_REFRESH_TOKEN_AUTH** is enabled

## 🔍 **Step 6: Debug with Console Logs**

The updated code now includes detailed logging. Check the browser console for:
- User pool ID
- App client ID
- Email being used for reset
- Any additional error details

## 🔍 **Step 7: Alternative Approach**

If the issue persists, try using the username instead of email:

```javascript
// Instead of using email as username
await resetPassword({ username: email });

// Try using the actual Cognito username
await resetPassword({ username: cognitoUsername });
```

## 🔍 **Step 8: Check IAM Permissions**

Ensure your app client has the right permissions:
1. Go to **App integration** tab
2. Click on your app client
3. Under **Authentication flows**, ensure all required flows are enabled

## 🚨 **Most Common Issues:**

1. **Email not verified** - User needs to verify email first
2. **Wrong username format** - Using email when username is different
3. **App client not configured** - Missing authentication flows
4. **User pool policies** - Password reset not enabled
5. **MFA requirements** - User needs verified phone number

## 📞 **Next Steps:**

1. Check the console logs for detailed error information
2. Verify the user's email is actually verified in Cognito
3. Ensure your User Pool is configured correctly
4. Test with a fresh user account if needed

Let me know what you find in the console logs and I can help you debug further!

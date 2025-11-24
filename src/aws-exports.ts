// AWS Amplify Configuration
// Uses environment variables for security

const awsconfig = {
    Auth: {
        Cognito: {
            // REQUIRED - Amazon Cognito Region
            region: import.meta.env.VITE_AWS_REGION || 'us-east-2',

            // REQUIRED - Amazon Cognito User Pool ID
            userPoolId: import.meta.env.VITE_USER_POOL_ID,

            // REQUIRED - Amazon Cognito Web Client ID
            userPoolClientId: import.meta.env.VITE_USER_POOL_WEB_CLIENT_ID,

            // OPTIONAL - Login with email
            loginWith: {
                email: true
            }
        }
    },

    // API configuration removed - using custom LambdaClient instead
    // This prevents unnecessary Cognito calls from Amplify's built-in API client
};

export default awsconfig;

// AWS Amplify Configuration
// Uses environment variables

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
};

export default awsconfig;

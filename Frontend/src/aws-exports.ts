import { ResourcesConfig } from 'aws-amplify';

const awsconfig: ResourcesConfig = {
    Auth: {
        Cognito: {
            userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
            userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
            loginWith: {
                email: true,
            },
        },
    },
};

export default awsconfig;

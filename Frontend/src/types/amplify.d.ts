/**
 * src/types/amplify.d.ts
 *
 * Types related to AWS Amplify Auth and application environment variables.
 */

import { AuthUser, SignInOutput, SignInResult, AuthSignInOutput } from 'aws-amplify/auth';

/* -------------------------------------------------------------------------- */
/* Amplify Auth Types                                                         */
/* -------------------------------------------------------------------------- */

export type AmplifyAuthUser = AuthUser;

export type AmplifySignInResult =
  | SignInOutput
  | SignInResult
  | AuthSignInOutput
  | unknown;

export interface AuthUserMinimal {
  username?: string | null;
  signInDetails?: { loginId?: string | null } | null;
  [key: string]: unknown;
}

export type IdTokenPayload = Record<string, unknown>;
export type CognitoGroups = string[];

/* -------------------------------------------------------------------------- */
/* Environment Variables                                                      */
/* -------------------------------------------------------------------------- */

export interface AppImportMetaEnv {
  readonly VITE_AWS_REGION: string;
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_API_GATEWAY_URL: string;
  readonly VITE_COOKIE_DOMAIN?: string;
}

declare global {
  interface ImportMetaEnv extends AppImportMetaEnv { }
}

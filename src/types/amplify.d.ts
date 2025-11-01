/**
 * src/types/amplify.d.ts
 *
 * Types related to AWS Amplify Auth and application environment variables.
 *
 * This file attempts to re-export common Amplify auth types (so you can
 * use the real types where available). It also provides a small, stable
 * "minimal" AuthUser shape used across the app when we only rely on a
 * subset of Amplify's user fields.
 *
 * NOTE: this file does not add runtime code — only TypeScript declarations.
 */

/* -------------------------------------------------------------------------- */
/* Re-export (or alias) common Amplify auth types                               */
/* -------------------------------------------------------------------------- */

/**
 * Primary Amplify auth user type.
 *
 * We try to use the exported `AuthUser` type from the installed Amplify
 * package. If your installed Amplify version exposes a different name,
 * you can import the proper type directly from the Amplify package.
 *
 * Usage:
 *   import { AmplifyAuthUser } from '@/types/amplify';
 */
export type AmplifyAuthUser = import("aws-amplify/auth").AuthUser;

/**
 * Common sign-in / sign-result types from Amplify.
 * Different Amplify versions may export slightly different names.
 * We attempt to include the common options so you can annotate return types
 * from `signIn()` etc.
 */
export type AmplifySignInResult =
  | import("aws-amplify/auth").SignInOutput
  | import("aws-amplify/auth").SignInResult
  | import("aws-amplify/auth").AuthSignInOutput
  | unknown;

/* -------------------------------------------------------------------------- */
/* Minimal, stable user shape used in the UI                                   */
/* -------------------------------------------------------------------------- */

/**
 * A minimal user interface used by the UI code in this repo. We keep this
 * intentionally small so we aren't tightly coupled to Amplify's full types
 * everywhere in the app. When you need Amplify-specific features, prefer
 * `AmplifyAuthUser`.
 */
export interface AuthUserMinimal {
  username?: string | null;
  /**
   * Some Amplify versions include a `signInDetails` object containing
   * `loginId` when using some sign-in wrappers. This is optional.
   */
  signInDetails?: { loginId?: string | null } | null;
  // allow additional fields (attributes, tokens, etc.) without breaking
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Helpers for token payloads and groups (typing helpers)                      */
/* -------------------------------------------------------------------------- */

/**
 * Generic token payload type (claims map). Real payload shapes will vary
 * depending on your Cognito setup. Use `unknown` for claim values you do
 * not explicitly type.
 */
export type IdTokenPayload = Record<string, unknown>;

/**
 * A safe string-array type for Cognito groups payloads.
 */
export type CognitoGroups = string[];

/* -------------------------------------------------------------------------- */
/* Environment / Vite import.meta.env types                                    */
/* -------------------------------------------------------------------------- */

/**
 * The README describes the expected environment variables used by this app.
 * Define them here so TypeScript understands `import.meta.env.VITE_*`.
 *
 * Note: Vite exposes env values as strings. For convenience some callers in
 * the app may parse or coerce boolean-like strings; for strict typing we keep
 * values as strings here.
 */
export interface AppImportMetaEnv {
  readonly VITE_AWS_REGION: string;
  readonly VITE_USER_POOL_ID: string;
  readonly VITE_USER_POOL_WEB_CLIENT_ID: string;
  readonly VITE_API_GATEWAY_URL: string;

  /**
   * Optional cookie settings:
   * - `VITE_COOKIE_DOMAIN` usually `.yourdomain.com` or `localhost`
   * - `VITE_COOKIE_SECURE` is provided as string ("true"/"false") by Vite envs.
   */
  readonly VITE_COOKIE_DOMAIN?: string;
  readonly VITE_COOKIE_SECURE?: "true" | "false" | string;

  // Allow additional VITE_* entries without TypeScript errors
  readonly [key: `VITE_${string}`]: string | undefined;
}

/**
 * Extend Vite's global `ImportMeta` so `import.meta.env` is strongly typed.
 * This helps catch typos and documents expected environment variables.
 */
declare global {
  type ImportMetaEnv = AppImportMetaEnv;
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

/* -------------------------------------------------------------------------- */
/* Convenience exports / compatibility helpers                                 */
/* -------------------------------------------------------------------------- */

/**
 * Convert Amplify types into the minimal UI shape where needed:
 *   const user: AuthUserMinimal = toMinimalUser(amplifyUser);
 *
 * We only provide the type here — you may implement small runtime helpers
 * where necessary in your codebase (e.g. `src/utils/authHelpers.ts`).
 */
export type ToMinimalAuthUser<T = AmplifyAuthUser | unknown> = {
  username?: string | null;
  signInDetails?: { loginId?: string | null } | null;
} & Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Usage examples (for your reference)                                         */
/* -------------------------------------------------------------------------- */
/*
  import type { AmplifyAuthUser, AuthUserMinimal } from '@/types/amplify';

  // annotate handler that consumes Amplify's signIn result
  async function handleSignIn(): Promise<void> {
    const result = await signIn({ username, password }) as AmplifyAuthUser;
    // convert to minimal shape before storing in UI state if you like:
    const minimal: AuthUserMinimal = {
      username: result.username ?? null,
      signInDetails: (result as any)?.signInDetails ?? null
    };
  }
*/
export {};

// The app's entry: what Hermes lacks goes in before expo-router loads a single route.
import "#app/platform/polyfills.ts";
// Before any schema parses: zod must not probe for eval under the CSP.
import "#app/platform/content-policy.ts";
import "expo-router/entry";

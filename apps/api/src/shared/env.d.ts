import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

declare global {
  namespace Cloudflare {
    // Secrets (`wrangler secret put`) and optional vars are not in wrangler.jsonc, so
    // `wrangler types` does not know them. Parsed by shared/config.ts.
    interface Env {
      /** Bot token from @BotFather: verifies Login Widget payloads and sends bot replies. */
      TELEGRAM_BOT_TOKEN?: string;
      /** Shared secret Telegram echoes in `X-Telegram-Bot-Api-Secret-Token` on every webhook call. */
      TELEGRAM_WEBHOOK_SECRET?: string;
      /**
      Comma-separated IPv4 CIDRs the webhook accepts calls from, matched against the
      `CF-Connecting-IP` Cloudflare sets. Set in wrangler.jsonc to Telegram's subnets;
      unset or empty disables the check (local tunnels that are not Cloudflare's).
      */
      TELEGRAM_WEBHOOK_ALLOWED_CIDRS?: string;
      /** JSON of `getMe`, stored at deploy time so the bot never calls Telegram on cold start. */
      BOT_INFO?: string;
      /** Groq and Gemini keys for the LLM parse; without either the parse reports unavailable. */
      GROQ_API_KEY?: string;
      GEMINI_API_KEY?: string;
      /** `fake` keeps the LLM inside the Worker (tests, e2e). */
      LLM_PROVIDER?: string;
      /** Override of the Telegram API origin (tests point it at a mocked host). */
      TELEGRAM_API_ROOT?: string;
      /**
      The OAuth helpers the provider in worker.ts attaches to the env of every request it
      hands to the Hono app (consent, grants). Absent when the app runs without the provider.
      */
      OAUTH_PROVIDER?: OAuthHelpers;
    }
  }
}

export {};

-- Stage 8 starts every account over: the global tables are emptied here (children first),
-- the per-user Durable Object stores by their epoch (src/user-store/store-identity.ts).
DELETE FROM `login_nonces`;--> statement-breakpoint
DELETE FROM `sessions`;--> statement-breakpoint
DELETE FROM `users`;

CREATE TABLE "example_likes" (
	"user_id" text NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "example_likes_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "example_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "example_posts_body_length" CHECK (char_length("example_posts"."body") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "example_likes" ADD CONSTRAINT "example_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "example_likes" ADD CONSTRAINT "example_likes_post_id_example_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."example_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "example_posts" ADD CONSTRAINT "example_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "example_likes_post_idx" ON "example_likes" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "example_posts_feed_idx" ON "example_posts" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "example_posts_author_idx" ON "example_posts" USING btree ("author_id");
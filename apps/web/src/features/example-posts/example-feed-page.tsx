import { authClient } from "#web/shared/auth/auth-client.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { Skeleton } from "#web/shared/ui/skeleton.tsx";

import { ExamplePostCard } from "./example-post-card.tsx";
import { ExamplePostComposer } from "./example-post-composer.tsx";
import { useExampleFeed } from "./example-posts-queries.ts";

const FeedSkeleton = () => (
  <div aria-busy aria-label="Loading posts" className="grid gap-4">
    <Skeleton className="h-28" />
    <Skeleton className="h-28" />
  </div>
);

export const ExampleFeedPage = () => {
  const session = authClient.useSession();
  const feed = useExampleFeed();
  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Feed</h1>
      <ExamplePostComposer />
      {feed.isPending && <FeedSkeleton />}
      {feed.isError && (
        <p className="text-destructive" role="alert">
          Could not load posts: {feed.error.message}
        </p>
      )}
      {feed.isSuccess && posts.length === 0 && (
        <p className="text-center text-muted-foreground">No posts yet. Be the first!</p>
      )}
      <section aria-label="Posts" className="grid gap-4">
        {posts.map((post) => (
          <ExamplePostCard currentUserId={session.data?.user.id ?? ""} key={post.id} post={post} />
        ))}
      </section>
      {feed.hasNextPage && (
        <Button
          disabled={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}
          variant="outline"
        >
          {feed.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
};

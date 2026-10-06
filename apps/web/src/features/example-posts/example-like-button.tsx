import { Heart } from "lucide-react";

import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";

import { type ExampleFeedItem, useToggleExampleLike } from "./example-posts-queries.ts";

export const ExampleLikeButton = ({ post }: { readonly post: ExampleFeedItem }) => {
  const likeToggle = useToggleExampleLike();
  return (
    <Button
      aria-label={post.likedByMe ? "Unlike" : "Like"}
      aria-pressed={post.likedByMe}
      // One request at a time: overlapping optimistic updates could roll back to a stale state.
      disabled={likeToggle.isPending}
      onClick={() => {
        likeToggle.mutate({ id: post.id, liked: !post.likedByMe });
      }}
      size="sm"
      variant="ghost"
    >
      <Heart aria-hidden className={cn(post.likedByMe && "fill-red-500 text-red-500")} />
      <span data-testid="like-count">{post.likeCount}</span>
    </Button>
  );
};

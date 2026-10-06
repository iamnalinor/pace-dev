import { Trash2 } from "lucide-react";

import { Button } from "#web/shared/ui/button.tsx";
import { Card, CardContent, CardFooter, CardHeader } from "#web/shared/ui/card.tsx";

import { ExampleLikeButton } from "./example-like-button.tsx";
import { type ExampleFeedItem, useDeleteExamplePost } from "./example-posts-queries.ts";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const ExamplePostCard = ({
  currentUserId,
  post,
}: {
  readonly currentUserId: string;
  readonly post: ExampleFeedItem;
}) => {
  const postDeletion = useDeleteExamplePost();
  return (
    <Card aria-label={`Post by ${post.author.name}`} className="gap-3 py-4" role="article">
      <CardHeader className="flex items-baseline justify-between px-4">
        <span className="font-medium">{post.author.name}</span>
        <time className="text-sm text-muted-foreground" dateTime={post.createdAt}>
          {dateFormat.format(new Date(post.createdAt))}
        </time>
      </CardHeader>
      <CardContent className="px-4 wrap-break-word whitespace-pre-wrap">{post.body}</CardContent>
      <CardFooter className="justify-between px-4">
        <ExampleLikeButton post={post} />
        {post.author.id === currentUserId && (
          <Button
            aria-label="Delete post"
            disabled={postDeletion.isPending}
            onClick={() => {
              if (globalThis.confirm("Delete this post?")) {
                postDeletion.mutate(post.id);
              }
            }}
            size="sm"
            variant="ghost"
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

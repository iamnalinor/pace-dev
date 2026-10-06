import { type SubmitEvent, useId, useState } from "react";

import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { Textarea } from "#web/shared/ui/textarea.tsx";

import { countCodePoints, EXAMPLE_POST_MAX_LENGTH } from "./example-post-limits.ts";
import { useCreateExamplePost } from "./example-posts-queries.ts";

export const ExamplePostComposer = () => {
  const [body, setBody] = useState("");
  const postCreation = useCreateExamplePost();
  const counterId = useId();
  const length = countCodePoints(body);
  const isTooLong = length > EXAMPLE_POST_MAX_LENGTH;
  const canSubmit = length > 0 && !isTooLong && !postCreation.isPending;

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Trimmed like the server does, so trailing whitespace never trips the transport limit.
    postCreation.mutate(body.trim(), {
      onSuccess: () => {
        setBody("");
      },
    });
  };

  return (
    <form aria-label="New post" className="grid gap-2" onSubmit={onSubmit}>
      <Textarea
        aria-describedby={counterId}
        aria-invalid={isTooLong}
        aria-label="What's happening?"
        onChange={(event) => {
          setBody(event.target.value);
        }}
        placeholder="What's happening?"
        value={body}
      />
      <div className="flex items-center justify-between">
        <span
          className={cn("text-sm text-muted-foreground", isTooLong && "text-destructive")}
          id={counterId}
        >
          {length}/{EXAMPLE_POST_MAX_LENGTH}
        </span>
        <Button disabled={!canSubmit} type="submit">
          Post
        </Button>
      </div>
      {postCreation.error !== null && (
        <p className="text-sm text-destructive" role="alert">
          {postCreation.error.message}
        </p>
      )}
    </form>
  );
};

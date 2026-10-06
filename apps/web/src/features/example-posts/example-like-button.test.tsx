import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";

import { ExampleLikeButton } from "./example-like-button.tsx";
import { type ExampleFeedItem, feedKey, useExampleFeed } from "./example-posts-queries.ts";

const { put, toastError } = vi.hoisted(() => ({ put: vi.fn(), toastError: vi.fn() }));
vi.mock("#web/shared/api/api-client.ts", () => ({
  api: { "example-posts": () => ({ like: { delete: vi.fn(), put } }) },
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const post: ExampleFeedItem = {
  author: { id: "author", name: "Author" },
  body: "Hello",
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000001",
  likeCount: 0,
  likedByMe: false,
};

/** Renders the button from the feed cache, the way the real page does. */
const LikeButtonFromCache = () => {
  const feed = useExampleFeed();
  const item = feed.data?.pages[0]?.items[0];
  return item === undefined ? null : <ExampleLikeButton post={item} />;
};

const renderLikeButton = () => {
  const view = renderWithProviders(<LikeButtonFromCache />);
  view.queryClient.setQueryData(feedKey, {
    pageParams: [undefined],
    pages: [{ items: [post], nextCursor: null }],
  });
  return view;
};

describe("ExampleLikeButton", () => {
  it("updates optimistically, then settles on the server's numbers", async () => {
    const response = Promise.withResolvers<{
      data: { likeCount: number; likedByMe: boolean };
      error: null;
    }>();
    put.mockReturnValue(response.promise);
    const { user } = renderLikeButton();

    await user.click(await screen.findByRole("button", { name: "Like" }));

    // Before the server answers:
    expect(screen.getByRole("button", { name: "Unlike" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("like-count")).toHaveTextContent("1");

    // Someone else liked too: the server's count wins.
    response.resolve({ data: { likeCount: 2, likedByMe: true }, error: null });
    await waitFor(() => {
      expect(screen.getByTestId("like-count")).toHaveTextContent("2");
    });
  });

  it("rolls back and reports the error when the request fails", async () => {
    put.mockResolvedValue({
      data: null,
      error: { status: 404, value: { code: "example-post/not-found", message: "Post not found" } },
    });
    const { user } = renderLikeButton();

    await user.click(await screen.findByRole("button", { name: "Like" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "false");
    });
    expect(screen.getByTestId("like-count")).toHaveTextContent("0");
    expect(toastError).toHaveBeenCalledWith("Post not found");
  });
});

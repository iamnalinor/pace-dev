import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";

import { ExamplePostComposer } from "./example-post-composer.tsx";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("#web/shared/api/api-client.ts", () => ({ api: { "example-posts": { post } } }));

describe("ExamplePostComposer", () => {
  beforeEach(() => {
    post.mockResolvedValue({ data: {}, error: null });
  });

  it("counts characters like the server (an emoji is one) and blocks over-long posts", async () => {
    const { user } = renderWithProviders(<ExamplePostComposer />);
    const input = screen.getByRole("textbox", { name: "What's happening?" });
    const submit = screen.getByRole("button", { name: "Post" });

    await user.type(input, "😀");
    expect(screen.getByText("1/500")).toBeInTheDocument();
    expect(submit).toBeEnabled();

    await user.clear(input);
    await user.click(input);
    await user.paste("a".repeat(501));
    expect(screen.getByText("501/500")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();
  });

  it("does not allow submitting whitespace", async () => {
    const { user } = renderWithProviders(<ExamplePostComposer />);

    await user.type(screen.getByRole("textbox"), " ".repeat(3));

    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  });

  it("clears the input after a successful post", async () => {
    const { user } = renderWithProviders(<ExamplePostComposer />);

    await user.type(screen.getByRole("textbox"), "Hello");
    await user.click(screen.getByRole("button", { name: "Post" }));

    expect(post).toHaveBeenCalledWith({ body: "Hello" });
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("keeps the text and shows the server's message when the post is rejected", async () => {
    post.mockResolvedValue({
      data: null,
      error: { status: 422, value: { code: "example-post/too-long", message: "Post is too long" } },
    });
    const { user } = renderWithProviders(<ExamplePostComposer />);

    await user.type(screen.getByRole("textbox"), "Hello");
    await user.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Post is too long");
    expect(screen.getByRole("textbox")).toHaveValue("Hello");
  });
});

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "#web/shared/api/api-client.ts";
import { unwrap } from "#web/shared/api/unwrap.ts";

export const feedKey = ["example-posts", "feed"] as const;

const fetchFeedPage = async (cursor: string | undefined) =>
  await unwrap(api["example-posts"].get({ query: cursor === undefined ? {} : { cursor } }));

export type ExampleFeedPage = Awaited<ReturnType<typeof fetchFeedPage>>;
export type ExampleFeedItem = ExampleFeedPage["items"][number];

export const useExampleFeed = () =>
  useInfiniteQuery({
    getNextPageParam: (lastPage: ExampleFeedPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => await fetchFeedPage(pageParam),
    queryKey: feedKey,
  });

export const useCreateExamplePost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => await unwrap(api["example-posts"].post({ body })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: feedKey });
    },
  });
};

export const useDeleteExamplePost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await unwrap(api["example-posts"]({ id }).delete());
    },
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: feedKey });
    },
  });
};

type Feed = InfiniteData<ExampleFeedPage, string | undefined>;

const patchPost = (
  feed: Feed | undefined,
  id: string,
  patch: (item: ExampleFeedItem) => ExampleFeedItem,
): Feed | undefined =>
  feed === undefined
    ? undefined
    : {
        ...feed,
        pages: feed.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => (item.id === id ? patch(item) : item)),
        })),
      };

/**
 * Optimistic like/unlike: the UI updates instantly, rolls back if the request fails,
 * and ends with the server's numbers (other users may have liked meanwhile).
 */
export const useToggleExampleLike = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, liked }: { id: string; liked: boolean }) => {
      const like = api["example-posts"]({ id }).like;
      return await unwrap(liked ? like.put() : like.delete());
    },
    // Order matters: `onMutate` must precede `onError` for TanStack to infer `context`.
    onMutate: async ({ id, liked }) => {
      await queryClient.cancelQueries({ queryKey: feedKey });
      const previous = queryClient.getQueryData<Feed>(feedKey);
      queryClient.setQueryData<Feed>(feedKey, (feed) =>
        patchPost(feed, id, (item) => ({
          ...item,
          likeCount: item.likeCount + (liked ? 1 : -1),
          likedByMe: liked,
        })),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(feedKey, context?.previous);
      toast.error(error.message);
    },
    onSuccess: (state, { id }) => {
      queryClient.setQueryData<Feed>(feedKey, (feed) =>
        patchPost(feed, id, (item) => ({ ...item, ...state })),
      );
    },
  });
};

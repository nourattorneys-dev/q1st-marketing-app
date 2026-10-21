import type { BulkResult } from "@/lib/engine/schemas";

/** Spec v1.1 §6: posts a bulk action couldn't handle are listed by name. */
export function bulkFailureLines(result: BulkResult, posts: { id: string; title: string }[]) {
  const titles = new Map(posts.map((post) => [post.id, post.title]));
  return result.failed.map((failure) => ({ id: failure.id, title: titles.get(failure.id) ?? failure.id, message: failure.message }));
}

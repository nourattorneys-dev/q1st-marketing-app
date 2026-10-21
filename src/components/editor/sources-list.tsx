"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Post } from "@/lib/engine/schemas";

export function SourcesList({ post }: { post: Post }) {
  const t = useTranslations("Editor");
  return (
    <Card data-testid="sources">
      <CardHeader>
        <CardTitle>{t("sources")}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {post.sources.length === 0 ? (
          <p className="text-muted-foreground">{t("noSources")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {post.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

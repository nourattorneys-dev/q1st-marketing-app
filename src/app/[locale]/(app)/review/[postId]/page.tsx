import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { PostEditor } from "@/components/editor/post-editor";
import { Link } from "@/i18n/navigation";
import { asAppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine, type EngineFailure } from "@/lib/engine/result";

// `postId` isn't known at build time, so params is read inside the Suspense boundary (Cache Components).
export default function EditorPage({ params }: PageProps<"/[locale]/review/[postId]">) {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <EditorLoader params={params} />
    </Suspense>
  );
}

async function EditorLoader({ params }: { params: Promise<{ locale: string; postId: string }> }) {
  const { locale: rawLocale, postId } = await params;
  const locale = asAppLocale(rawLocale);
  setRequestLocale(locale);
  const session = await requirePermission(locale, "content.work");
  const t = await getTranslations("Editor");
  const engine = await getEngine();

  const [post, meta, categories] = await Promise.all([
    tryEngine(() => engine.post(postId)),
    tryEngine(() => engine.meta()),
    tryEngine(() => engine.categories()),
  ]);
  const missing = (error: EngineFailure) => (
    <div className="flex flex-col gap-4">
      <EngineNotice error={error} />
      <Link href="/review" className="text-sm text-primary underline">
        {t("back")}
      </Link>
    </div>
  );
  if (!post.ok) return missing(post.error);
  if (!meta.ok) return missing(meta.error);

  const twinId = post.data.twin?.id;
  const twin = twinId ? await tryEngine(() => engine.post(twinId)) : null;

  return (
    <PostEditor
      locale={locale}
      post={post.data}
      twin={twin?.ok ? twin.data : null}
      limits={{ metaTitle: meta.data.limits.metaTitle, metaDescription: meta.data.limits.metaDescription }}
      photoLimits={{ photoTypes: meta.data.limits.photoTypes, photoMaxBytes: meta.data.limits.photoMaxBytes }}
      categories={categories.ok ? categories.data : []}
      lockMinutes={meta.data.limits.lockMinutes}
      pollSeconds={meta.data.pollSeconds}
      canManageSettings={can(session.role, "settings.manage")}
    />
  );
}

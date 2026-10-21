"use client";

/**
 * Errors in the root layout itself: no translations or styles are loaded at this level, so the page is self-contained,
 * with the message in both languages.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.5, maxWidth: "36rem", margin: "0 auto", padding: "2rem" }}>
        <div role="alert" data-testid="global-error">
          <h1>Something went wrong</h1>
          <p>{"This page couldn't be shown. Try again; if it keeps happening, contact your admin."}</p>
          <h1 dir="rtl" lang="ar">
            حدث خطأ
          </h1>
          <p dir="rtl" lang="ar">
            تعذّر عرض هذه الصفحة. حاول مرة أخرى، وإذا تكرر ذلك فتواصل مع المسؤول.
          </p>
          <button type="button" onClick={() => retry()}>
            Try again · حاول مرة أخرى
          </button>
        </div>
      </body>
    </html>
  );
}

**Subject:** Marketing Portal: spec v1.1 for sign-off, plus 3 questions

Hi Quantum1st team,

Thanks for the Marketing Portal Build Spec. We've reviewed it and will build the portal on our side. Attached is **spec v1.1** (`Marketing Portal Build Spec v1.1.html`), with all changes listed in its section 0. We'd like to agree it as the contract between the portal and your engine before either side builds further.

**Why the changes:**
- **Our sites run on WordPress as well as Strapi**, and a site may switch between them. v1.1 replaces the Strapi-only settings with a generic "website connection" (WordPress or Strapi), described through `/meta`. Section 11 sets out what the two adapters need on your side, including a small WordPress helper plugin for Yoast fields and TranslatePress (Arabic at `/ar/`).
- **We run one portal deployment per site**, so the site switcher is removed.
- **Safety:** an `Idempotency-Key` on every change (so a retried click can't publish twice) and a defined editing lock.
- **Four optional extras**, switched on through `/meta.features` (section 12):
  - import our own articles (Word/HTML)
  - article → social posts
  - Search Console performance and refresh suggestions
  - legal-accuracy checks and internal links
- **A few corrections to v1**, e.g. `createdAt`, `updatedAt` and `version` were inside a comment, and the 429 error used `error.details`, which the envelope didn't define.

**Questions:**
1. Is the engine live? Please send the real base URL, a sandbox key, and an estimated timeline.
2. Please send the article-checks rulebook that findings cite (e.g. `ref: "§4.6.1"`).
3. Can you confirm the 24-hour idempotency window and the lock duration?

**How we'll proceed:** once you confirm v1.1 (or send changes), we'll build the portal against a mock of exactly these shapes while you build the engine side. Then we'll switch to your sandbox and run automated checks to find any differences.

Is there anything in v1.1 you'd like to change, or anything you can't support?

Best regards,
[Your name]

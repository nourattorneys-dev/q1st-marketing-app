# P1b — Many clients in one app (design)

One deployment (app.q1st.io) serves many clients. Until now the app served one site: one engine key in its settings
file, and users with no client.

## Model

| Table | What it holds |
|---|---|
| `clients` | One client company: `id`, `name`, `created_at`. |
| `sites` | One website of a client: `id` = the engine's site id, `client_id`, `name`, `key_cipher` (the engine key for that site, AES-256-GCM with `APP_ENCRYPTION_KEY`), `created_at`. |
| `users` | gains `client_id`. A person belongs to one client (an email is unique across the app). |
| `user_sites` | `user_id`, `site_id`: the sites a Reviewer may open. An Admin opens every site of the client. |
| `invitations` | gains `client_id` and `site_ids` (jsonb, null = every site). |
| `sessions` | gains `site_id`: the site this browser is working on. |
| `webhook_configs` | replaces `webhook_config` (one row): one row per site, keyed by `site_id`. |
| `webhook_events`, `notifications` | gain `site_id`. |

## Rules

- **The current site** comes from the session. It must be a site of the person's client that they may open; if not
  (removed, access taken away), the first site they may open is used and saved. No site at all: the No access page.
- **Every engine call** uses the current site's key. The key is decrypted only on the server, per request; it never
  reaches the browser, a log or an error message.
- **Every list** of users, invitations and webhook settings is the current client's or site's. Ids that belong to
  another client are answered as not found (never "forbidden", which would confirm they exist).
- **Webhooks:** the engine sends `siteId` in every delivery. The signature is checked with THAT site's secret; an
  unknown site or a wrong signature is refused the same way. Events and notifications are stored with the site.
- **Notifications** for a site go to that client's people who may open the site (Reviewers with access, Admins).
- **The cron run** handles every site in turn, one run at a time (the existing lock).
- **Settings file migration:** with no client yet and `ENGINE_API_KEY` set, the app creates the first client and site
  from it (asking the engine for the site's id and name), and every existing user joins that client. `ADMIN_EMAIL`
  is that first client's first Admin. After P1c, new clients come only from the staff portal.
- **Test logins** (`AUTH_MODE=mock`) keep one built-in client and site.

## Site switcher

In the header, for anyone who may open more than one site: the client's sites by name; choosing one saves it on the
session and reloads the current page for that site. With one site, the header shows its name only.

## Users page (Admin)

Invitations and accounts are the client's. A Reviewer's sites are chosen with checkboxes when the client has more
than one site (default: every site). Admins always have every site.

## Out of scope (later phases)

- Creating clients and sites: the staff portal (P1c), through a server-to-server API with its own secret.
- The look: P2.

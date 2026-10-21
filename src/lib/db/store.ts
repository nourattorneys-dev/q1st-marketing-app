export type Audience = "reviewers" | "admins";

/** One email-worthy event (design §10), from the delivery that caused it; sent once, with others for the same audience. */
export type StoredNotification = { eventId: string; kind: string; audience: Audience; data: Record<string, unknown>; createdAt: Date };

/** This portal's webhook registration: the address the engine calls and its signing secret, encrypted (design §11). */
export type WebhookConfig = { url: string; secretCipher: string; updatedAt: Date };

/** What the dashboard keeps (design §4 "Small database"): in memory locally, in Neon Postgres on Vercel. */
export interface AppStore {
  /** Whether this X-Event-Id was handled already. */
  hasEvent(id: string): Promise<boolean>;
  /** Records a handled delivery and the notification it causes, together; each is a no-op if it's already there. */
  recordEvent(event: { id: string; event: string; receivedAt: Date }, notification: StoredNotification | null): Promise<void>;
  lastEventAt(): Promise<Date | null>;
  webhook(): Promise<WebhookConfig | null>;
  saveWebhook(config: WebhookConfig): Promise<void>;
  /** Notifications not emailed yet, oldest first. */
  pendingNotifications(): Promise<StoredNotification[]>;
  markSent(eventIds: string[], recipients: string[], at: Date): Promise<void>;
  /** Forgets deliveries received, and notifications sent, before `cutoff` (design §4: event ids are kept 30 days). */
  forgetBefore(cutoff: Date): Promise<void>;
  /** The people (by user id) who turned their notification emails off. */
  emailOffUsers(): Promise<Set<string>>;
  setEmailOff(userId: string, off: boolean, at: Date): Promise<void>;
}

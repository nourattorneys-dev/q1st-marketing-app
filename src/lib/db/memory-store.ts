import type { AppStore, StoredNotification, WebhookConfig } from "./store";

type Logged = StoredNotification & { siteId: string; sentAt: Date | null; recipients: string[] | null };

/** Everything the in-memory store keeps, for every site of this process. */
export type MemoryState = {
  events: Map<string, { siteId: string; event: string; receivedAt: Date }>;
  notifications: Map<string, Logged>;
  emailOff: Set<string>;
  deliveries: Map<string, Map<string, Date>>;
  webhooks: Map<string, WebhookConfig>;
  running: Set<string>;
};

export function createMemoryState(): MemoryState {
  return { events: new Map(), notifications: new Map(), emailOff: new Set(), deliveries: new Map(), webhooks: new Map(), running: new Set() };
}

const copyOf = (item: StoredNotification): StoredNotification => ({
  eventId: item.eventId,
  kind: item.kind,
  audience: item.audience,
  data: structuredClone(item.data),
  createdAt: new Date(item.createdAt),
});

/** DB_MODE=memory: one site's view of this server process's memory (local development and the e2e suite; refused in production). */
export function createMemoryStore(siteId: string, state: MemoryState = createMemoryState()): AppStore {
  const { events, notifications, emailOff, deliveries, webhooks, running } = state;

  return {
    siteId,

    async adoptUnassigned() {},

    async hasEvent(id) {
      return events.has(id);
    },

    async recordEvent(event, notification) {
      if (notification && !notifications.has(notification.eventId)) {
        notifications.set(notification.eventId, { ...copyOf(notification), siteId, sentAt: null, recipients: null });
      }
      if (!events.has(event.id)) events.set(event.id, { siteId, event: event.event, receivedAt: new Date(event.receivedAt) });
    },

    async lastEventAt() {
      let last: Date | null = null;
      for (const event of events.values()) if (event.siteId === siteId && (!last || event.receivedAt > last)) last = event.receivedAt;
      return last ? new Date(last) : null;
    },

    async webhook() {
      const webhook = webhooks.get(siteId);
      return webhook ? { ...webhook, updatedAt: new Date(webhook.updatedAt) } : null;
    },

    async saveWebhook(config) {
      webhooks.set(siteId, { ...config, updatedAt: new Date(config.updatedAt) });
    },
    async removeWebhook() {
      webhooks.delete(siteId);
    },

    async pendingNotifications() {
      return [...notifications.values()]
        .filter((item) => item.siteId === siteId && item.sentAt === null)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(copyOf);
    },

    async markSent(eventIds, recipients, at) {
      for (const id of eventIds) {
        const item = notifications.get(id);
        if (item && item.sentAt === null) {
          item.sentAt = new Date(at);
          item.recipients = [...recipients];
        }
      }
    },

    async deliveries(eventIds) {
      const found = new Map<string, Set<string>>();
      for (const id of eventIds) {
        const people = deliveries.get(id);
        if (people && people.size > 0) found.set(id, new Set(people.keys()));
      }
      return found;
    },

    async recordDelivery(eventIds, email, at) {
      for (const id of eventIds) {
        const people = deliveries.get(id) ?? new Map<string, Date>();
        if (!people.has(email)) people.set(email, new Date(at));
        deliveries.set(id, people);
      }
    },

    async forgetBefore(cutoff) {
      for (const [id, event] of events) if (event.receivedAt < cutoff) events.delete(id);
      for (const [id, item] of notifications) if (item.sentAt && item.sentAt < cutoff) notifications.delete(id);
      for (const [id, people] of deliveries) {
        for (const [email, sentAt] of people) if (sentAt < cutoff) people.delete(email);
        if (people.size === 0) deliveries.delete(id);
      }
    },

    async emailOffUsers() {
      return new Set(emailOff);
    },

    async setEmailOff(userId, off) {
      if (off) emailOff.add(userId);
      else emailOff.delete(userId);
    },

    async exclusive<T>(name: string, run: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
      if (running.has(name)) return { ran: false };
      running.add(name);
      try {
        return { ran: true, value: await run() };
      } finally {
        running.delete(name);
      }
    },
  };
}

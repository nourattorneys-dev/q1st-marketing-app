import type { AppStore, StoredNotification, WebhookConfig } from "./store";

type Logged = StoredNotification & { sentAt: Date | null; recipients: string[] | null };

const copyOf = (item: StoredNotification): StoredNotification => ({
  eventId: item.eventId,
  kind: item.kind,
  audience: item.audience,
  data: structuredClone(item.data),
  createdAt: new Date(item.createdAt),
});

/** DB_MODE=memory: the store in this server process's memory (local development and the e2e suite; refused on Vercel). */
export function createMemoryStore(): AppStore {
  const events = new Map<string, { event: string; receivedAt: Date }>();
  const notifications = new Map<string, Logged>();
  const emailOff = new Set<string>();
  const deliveries = new Map<string, Map<string, Date>>();
  let webhook: WebhookConfig | null = null;

  return {
    async hasEvent(id) {
      return events.has(id);
    },

    async recordEvent(event, notification) {
      if (notification && !notifications.has(notification.eventId)) {
        notifications.set(notification.eventId, { ...copyOf(notification), sentAt: null, recipients: null });
      }
      if (!events.has(event.id)) events.set(event.id, { event: event.event, receivedAt: new Date(event.receivedAt) });
    },

    async lastEventAt() {
      let last: Date | null = null;
      for (const { receivedAt } of events.values()) if (!last || receivedAt > last) last = receivedAt;
      return last ? new Date(last) : null;
    },

    async webhook() {
      return webhook && { ...webhook, updatedAt: new Date(webhook.updatedAt) };
    },

    async saveWebhook(config) {
      webhook = { ...config, updatedAt: new Date(config.updatedAt) };
    },

    async pendingNotifications() {
      return [...notifications.values()]
        .filter((item) => item.sentAt === null)
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
  };
}

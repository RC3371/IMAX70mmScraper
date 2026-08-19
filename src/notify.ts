import type { Env } from "./config";
import { kvNotified } from "./config";
import type { Performance } from "./scrapers/types";

export interface Notifier {
  ntfy(title: string, body: string, clickUrl: string): Promise<void>;
  discord(title: string, body: string, clickUrl: string): Promise<void>;
  email(title: string, body: string, clickUrl: string): Promise<void>;
}

export function makeNotifier(env: Env): Notifier {
  return {
    async ntfy(title, body, clickUrl) {
      if (!env.NTFY_TOPIC) return console.log("[notify] ntfy skipped (NTFY_TOPIC unset)");
      const res = await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
        method: "POST",
        headers: {
          Title: title,
          Priority: "high",
          Click: clickUrl,
          Tags: "tickets,tada",
        },
        body,
      });
      if (!res.ok) throw new Error(`ntfy ${res.status}`);
    },
    async discord(title, body, clickUrl) {
      if (!env.DISCORD_WEBHOOK_URL)
        return console.log("[notify] discord skipped (DISCORD_WEBHOOK_URL unset)");
      const res = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{ title, description: `${body}\n\n[Buy tickets](${clickUrl})`, color: 0xe4002b }],
        }),
      });
      if (!res.ok) throw new Error(`discord ${res.status}`);
    },
    async email(title, body, clickUrl) {
      if (!env.RESEND_API_KEY || !env.ALERT_EMAIL)
        return console.log("[notify] email skipped (RESEND_API_KEY/ALERT_EMAIL unset)");
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Odyssey 70mm Watcher <onboarding@resend.dev>",
          to: [env.ALERT_EMAIL],
          subject: title,
          html: `<p>${body.replace(/\n/g, "<br>")}</p><p><a href="${clickUrl}">Buy tickets</a></p>`,
        }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}`);
    },
  };
}

export function formatAlert(perfs: Performance[]): { title: string; body: string; clickUrl: string } {
  const sorted = [...perfs].sort((a, b) =>
    `${a.localDate} ${a.localTime}`.localeCompare(`${b.localDate} ${b.localTime}`)
  );
  const first = sorted[0];
  const theaters = [...new Set(sorted.map((p) => p.theater))].join(" & ");
  const dates = [...new Set(sorted.map((p) => p.localDate))].join(", ");
  const lines = sorted.map(
    (p) => `${p.theater} — ${p.localDate} ${p.localTime} (${p.format})${p.soldOut ? " [SOLD OUT]" : ""}`
  );
  return {
    title: `🎬 The Odyssey IMAX 70mm — NEW showtime(s) at ${theaters}`,
    body: `New showtime(s) on ${dates}:\n${lines.join("\n")}`,
    clickUrl: first.buyUrl,
  };
}

// Alert once per performance. KV guard absorbs duplicate runs racing on the
// eventually-consistent seen-set: a perf already marked notified is dropped.
export async function sendAlerts(env: Env, perfs: Performance[], notifier = makeNotifier(env)) {
  const fresh: Performance[] = [];
  for (const p of perfs) {
    if (await env.WATCHER_KV.get(kvNotified(p.perfId))) continue;
    fresh.push(p);
  }
  if (fresh.length === 0) return { sent: 0, errors: [] as string[] };

  for (const p of fresh) {
    await env.WATCHER_KV.put(kvNotified(p.perfId), new Date().toISOString());
  }

  const { title, body, clickUrl } = formatAlert(fresh);
  const errors: string[] = [];
  const results = await Promise.allSettled([
    notifier.ntfy(title, body, clickUrl),
    notifier.discord(title, body, clickUrl),
    notifier.email(title, body, clickUrl),
  ]);
  for (const r of results) if (r.status === "rejected") errors.push(String(r.reason));
  return { sent: fresh.length, errors };
}

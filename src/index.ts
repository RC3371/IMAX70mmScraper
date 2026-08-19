import type { Env } from "./config";
import { KV_LAST_RUN, KV_REFRESH_LOCK } from "./config";
import { renderPage } from "./frontend";
import { formatAlert, makeNotifier } from "./notify";
import type { RunMeta } from "./run";
import { runCheck } from "./run";
import { jitterMs, shouldRun, sleep } from "./time";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const now = new Date();
    if (!shouldRun(now, env.BLITZ_START, env.BLITZ_END)) return;
    ctx.waitUntil(
      (async () => {
        await sleep(jitterMs());
        await runCheck(env);
      })()
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/" && req.method === "GET") {
      const meta = await env.WATCHER_KV.get<RunMeta>(KV_LAST_RUN, "json");
      return new Response(renderPage(meta), { headers: { "Content-Type": "text/html" } });
    }

    if (url.pathname === "/api/status" && req.method === "GET") {
      const meta = await env.WATCHER_KV.get<RunMeta>(KV_LAST_RUN, "json");
      return json(meta ?? { ts: null });
    }

    if (url.pathname === "/api/refresh" && req.method === "POST") {
      const lock = await env.WATCHER_KV.get(KV_REFRESH_LOCK);
      if (lock && Date.now() - Date.parse(lock) < 10_000) {
        return json({ error: "rate limited — wait 10s" }, 429);
      }
      await env.WATCHER_KV.put(KV_REFRESH_LOCK, new Date().toISOString(), { expirationTtl: 60 });
      const meta = await runCheck(env, { force: true }); // manual refresh bypasses the fetch throttle
      return json(meta);
    }

    // One-time seeding after deploy: absorbs currently listed target-range
    // showtimes (should be none until the drop) without alerting.
    if (url.pathname === "/api/seed" && req.method === "POST") {
      const meta = await runCheck(env, { seed: true });
      return json(meta);
    }

    // Fires a synthetic alert through all configured channels.
    if (url.pathname === "/api/test-alert" && req.method === "POST") {
      const n = makeNotifier(env);
      const { title, body, clickUrl } = formatAlert([
        {
          source: "fandango",
          theater: "TEST — Regal Hacienda Crossings",
          perfId: "test:1",
          localDate: "2026-09-26", // a watched Saturday
          localTime: "18:10",
          format: "IMAX 70MM",
          buyUrl: "https://www.fandango.com/regal-hacienda-crossings-screenx-imax-and-rpx-aaopk/theater-page",
        },
      ]);
      const results = await Promise.allSettled([
        n.ntfy(`[TEST] ${title}`, body, clickUrl),
        n.discord(`[TEST] ${title}`, body, clickUrl),
        n.email(`[TEST] ${title}`, body, clickUrl),
      ]);
      return json({
        channels: ["ntfy", "discord", "email"].map((c, i) => ({
          channel: c,
          ok: results[i].status === "fulfilled",
          error: results[i].status === "rejected" ? String((results[i] as PromiseRejectedResult).reason) : undefined,
        })),
      });
    }

    return new Response("not found", { status: 404 });
  },
};

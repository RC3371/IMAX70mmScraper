import type { Env } from "../src/config";

export function mockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const v = store.get(key) ?? null;
      if (v === null) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

export function mockEnv(): Env {
  return { WATCHER_KV: mockKV() } as Env;
}

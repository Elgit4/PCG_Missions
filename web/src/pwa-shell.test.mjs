import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
);
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorker = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
const entry = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const offlinePage = readFileSync(
  new URL("../public/offline.html", import.meta.url),
  "utf8",
);

describe("PCG Missions PWA installation contract", () => {
  it("defines a standalone, root-scoped staff workspace", () => {
    expect(manifest.name).toBe("PCG Missions");
    expect(manifest.short_name).toBe("PCG");
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
  });

  it("provides separate general and maskable crest icons", () => {
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/pwa-icon-192.svg",
          sizes: "192x192",
          type: "image/svg+xml",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/pwa-icon-maskable.svg",
          sizes: "512x512",
          type: "image/svg+xml",
          purpose: "maskable",
        }),
      ]),
    );
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="theme-color"');
  });

  it("registers the service worker only in production and fails open to online use", () => {
    expect(entry).toContain('import.meta.env.PROD && "serviceWorker" in navigator');
    expect(entry).toContain('navigator.serviceWorker.register("/sw.js")');
    expect(entry).toContain(".catch(() =>");
  });
});

describe("PCG Missions offline privacy boundary", () => {
  it("does not intercept non-GET or cross-origin requests", () => {
    expect(serviceWorker).toContain('if (request.method !== "GET") return;');
    expect(serviceWorker).toContain(
      "if (url.origin !== self.location.origin || API_PREFIXES.some",
    );
  });

  it("explicitly bypasses same-origin API, Auth, database and storage routes", () => {
    for (const prefix of [
      '"/api/"',
      '"/functions/v1/"',
      '"/auth/v1/"',
      '"/rest/v1/"',
      '"/storage/v1/"',
    ]) {
      expect(serviceWorker).toContain(prefix);
    }
  });

  it("caches only the static shell and cacheable static asset responses", () => {
    expect(serviceWorker).toContain(
      'const SHELL_URLS = ["/", "/offline.html", "/logo.svg", "/manifest.webmanifest", "/pwa-icon-192.svg", "/pwa-icon-maskable.svg"];',
    );
    expect(serviceWorker).toContain(
      '["script", "style", "image", "font"].includes(request.destination)',
    );
    expect(serviceWorker).toContain("response.ok && response.type === \"basic\"");
    expect(serviceWorker).not.toMatch(/caches\.open\([^)]*\)\.put\(url/i);
  });

  it("shows an offline notice without displaying staff or ministry records", () => {
    expect(offlinePage).toContain("PCG Missions needs an internet connection");
    expect(offlinePage).toContain("No staff or ministry data is available offline.");
    expect(serviceWorker).toContain('caches.match("/offline.html")');
  });
});

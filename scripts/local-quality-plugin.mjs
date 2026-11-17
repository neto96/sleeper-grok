import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
export function localQualityEnabled({ command, mode, isPreview }, env = process.env) {
  return (
    command === "serve" &&
    mode === "development" &&
    !isPreview &&
    env.NODE_ENV !== "production" &&
    env.LOCAL_QUALITY_ENABLED === "1"
  );
}
export async function readLocalQuality(root, enabled) {
  if (!enabled) return { status: "disabled" };
  try {
    const path = resolve(root, "local-data/fantasypros-quality.json");
    if ((await stat(path)).size > 2_000_000) return { status: "invalid" };
    return { status: "loaded", capture: JSON.parse(await readFile(path, "utf8")) };
  } catch (e) {
    return { status: e.code === "ENOENT" ? "absent" : "invalid" };
  }
}
export function localQualityPlugin(options) {
  const enabled = localQualityEnabled(options);
  return {
    name: "local-quality-development",
    config() {
      return {
        define: { "import.meta.env.LOCAL_QUALITY_ENABLED": JSON.stringify(enabled) },
        server: {
          fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/local-data/**"] },
        },
      };
    },
    resolveId(id) {
      if (/(?:^|[/\\])local-data[/\\]/.test(id))
        throw Error("Private local data cannot be imported into the app");
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        let path;
        try {
          path = decodeURIComponent((req.url ?? "").split("?")[0]);
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }
        if (/(?:^|[/\\])local-data(?:[/\\]|$)/.test(path)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        if (path !== "/__local-quality") return next();
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json");
        const host = req.headers.host ?? "";
        const local =
          ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) &&
          /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
        const sameOrigin =
          !req.headers.origin ||
          req.headers.origin === `http://${host}` ||
          req.headers.origin === `https://${host}`;
        if (
          !enabled ||
          !local ||
          !sameOrigin ||
          req.headers["x-forwarded-host"] ||
          req.headers["x-forwarded-for"] ||
          req.method !== "GET"
        ) {
          res.statusCode = 404;
          res.end(JSON.stringify({ status: "disabled" }));
          return;
        }
        const data = await readLocalQuality(server.config.root, true);
        if (data.status === "loaded") {
          try {
            const { normalizeCapture } = await server.ssrLoadModule(
              "/src/lib/local-quality/model.ts",
            );
            data.capture = normalizeCapture(data.capture);
          } catch {
            res.end(JSON.stringify({ status: "invalid" }));
            return;
          }
        }
        res.end(JSON.stringify(data));
      });
    },
  };
}

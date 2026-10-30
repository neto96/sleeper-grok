import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFile } from 'node:fs/promises';

const root = fileURLToPath(new URL(".", import.meta.url));
export async function startPreview(port = 0) {
  const server = await createServer({
    configFile: false, envDir: false, root, publicDir: false,
    plugins: [react(), tailwind(), {
      name: 'private-projection-study',
      configureServer(server) {
        server.middlewares.use('/__projection-study', async (_request, response) => {
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          try {
            response.end(await readFile(resolve(root, '../../test-results/projections/comparison.json'), 'utf8'));
          } catch {
            response.statusCode = 404;
            response.end(JSON.stringify({ error: 'No saved projection study' }));
          }
        });
      },
    }],
    resolve: { alias: [
      { find: "@/lib/sleeper/fetch.functions", replacement: resolve(root, "fetch-stub.ts") },
      { find: "@", replacement: resolve(root, "../../src") },
    ] },
    server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [resolve(root, "../..")] } },
  });
  await server.listen();
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startPreview(4174);
  server.printUrls();
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await server.close(); process.exit(0); });
}

import { Container } from "@cloudflare/containers";

export class Geometry extends Container {
  defaultPort = 8080;
  sleepAfter = "2m";
  enableInternet = false;
}

// Only the app's service binding can reach this Worker (no public route).
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST" || !["/analyze", "/validate-ar", "/convert-ar"].includes(path))
      return new Response(null, { status: 404 });
    const bytes = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 80 * 1024 * 1024)
      return new Response(null, { status: 413 });
    const slot = crypto.getRandomValues(new Uint32Array(1))[0] % 2;
    return env.GEOMETRY_CONTAINER.getByName(`slot-${slot}`).fetch(request);
  },
} satisfies ExportedHandler<GeometryEnv>;

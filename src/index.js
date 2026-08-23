import { handleApi } from "./api.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const path = url.pathname.replace(/^\/api/, "") || "/";
      return handleApi(request, env, path);
    }

    // Everything else: serve static files from ./public
    return env.ASSETS.fetch(request);
  }
};

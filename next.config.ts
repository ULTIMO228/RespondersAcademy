import type { NextConfig } from "next";

/*
 * Реальный бэкенд (backend/, FastAPI) подключается без правок кода фронта: при заданном BACKEND_URL
 * запросы к /api/mock/* уходят на бэкенд (beforeFiles перекрывает route-handler'ы app/api/mock/**),
 * cookie arm112_session остаётся same-origin. Без переменной фронт работает на своём мок-слое.
 */
const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: backendUrl ? [{ source: "/api/mock/:path*", destination: `${backendUrl}/api/mock/:path*` }] : [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;

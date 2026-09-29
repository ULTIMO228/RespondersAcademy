import type { NextConfig } from "next";

/*
 * Реальный бэкенд (backend/, FastAPI) подключается без правок кода фронта: при заданном BACKEND_URL
 * запросы к /api/mock/* и /api/v1/* уходят на бэкенд (beforeFiles перекрывает route-handler'ы
 * app/api/mock/** и автономные ответы ИИ-панелей app/api/v1/ai/**), cookie arm112_session остаётся
 * same-origin. Без переменной фронт работает на своём мок-слое; остальные /api/v1/* без бэкенда
 * не обслуживаются (экраны показывают «Раздел требует подключения к серверу тренажёра»).
 * Правила запекаются в .next/routes-manifest.json при `next build`: после смены BACKEND_URL нужна пересборка.
 */
const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /*
   * Прежние вкладки симулятора «прогресс» и «справка» переехали в платформу (спека 002, 07-platform-shell.md §3):
   * старые адреса ведут в кабинет, а не в симулятор. Редиректы выполняются до proxy.
   */
  async redirects() {
    return [
      { source: "/arm/progress", destination: "/student/analytics", permanent: false },
      { source: "/arm/help", destination: "/reference", permanent: false },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: backendUrl
        ? [
            { source: "/api/mock/:path*", destination: `${backendUrl}/api/mock/:path*` },
            { source: "/api/v1/:path*", destination: `${backendUrl}/api/v1/:path*` },
          ]
        : [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;

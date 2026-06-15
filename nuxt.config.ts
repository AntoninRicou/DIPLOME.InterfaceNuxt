// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // Disabled so the Nuxt DevTools floating button never appears on screen —
  // committed here, so it stays off on every machine that pulls the repo.
  devtools: { enabled: false },
  devServer: {
    port: 3050,
  },
  modules: ['@pinia/nuxt'],
  runtimeConfig: {
    public: {
      socketUrl: process.env.NUXT_PUBLIC_SOCKET_URL || 'http://localhost:3001',
      projectUrl: process.env.NUXT_PUBLIC_PROJECT_URL || 'http://localhost:5173',
    },
  },
  // Preload the critical typography so fonts start downloading before
  // the browser parses the CSS that declares them. Without this the
  // browser only discovers font URLs after CSSOM is built, which is
  // why text was rendering in fallback then swapping on cold cache
  // (the inconsistent-between-refreshes problem on VIEW_0).
  // `crossorigin: 'anonymous'` is required even for same-origin font
  // preloads — without it the preload is fetched but ignored, then
  // the same file is downloaded a second time by the CSS request.
  // Paths mirror the @font-face declarations in app.vue.
  app: {
    head: {
      link: [
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/ABC%20Otto/ABCOtto-Regular-Trial.woff2',
          crossorigin: 'anonymous',
        },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/ABC%20Otto/ABCOtto-MediumItalic-Trial.woff2',
          crossorigin: 'anonymous',
        },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/otf',
          href: '/fonts/Neue%20Kabel/NeueKabel-Medium.otf',
          crossorigin: 'anonymous',
        },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/otf',
          href: '/fonts/Neue%20Kabel/NeueKabel-MediumItalic.otf',
          crossorigin: 'anonymous',
        },
      ],
    },
  },
})

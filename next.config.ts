import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Compiles the admin's `graphql` tagged literals (react-relay) into imports
  // of the artifacts `pnpm relay` writes to `__generated__/` beside each file.
  // Settings mirror relay.config.json; the two must agree or the transform
  // points at artifacts the compiler never wrote.
  compiler: {
    relay: {
      src: "./src",
      language: "typescript",
      eagerEsModules: true,
    },
  },
  async redirects() {
    return [
      // dmbk.io/photos used to be the gallery, served from the portfolio app.
      // dmbk.io now forwards /photos here with its query string, so the
      // gallery's own address has nowhere to go but the root.
      { source: "/photos", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;

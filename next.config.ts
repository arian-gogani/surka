import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly and the postgres driver opens sockets; both must
  // load from node_modules at runtime instead of being bundled.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Private swap links must never leak through the Referer header.
      { source: "/d/:token", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;

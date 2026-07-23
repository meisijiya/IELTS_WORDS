import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Required: Prisma must stay external so HMR doesn't see `prisma` as undefined.
  serverExternalPackages: ["@prisma/client"],
  async headers() {
    return [
      {
        source: "/audio/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
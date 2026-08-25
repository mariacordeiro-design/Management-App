import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];

    return [
      {
        source: "/api/optimize_shifts",
        destination: "http://127.0.0.1:8000/api/optimize_shifts",
      },
    ];
  },
};

export default nextConfig;

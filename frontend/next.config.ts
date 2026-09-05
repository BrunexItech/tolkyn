import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production build (only the files actually needed at
  // runtime, deps included) — what the Docker image copies and runs, so the
  // final image doesn't carry the whole node_modules tree.
  output: "standalone",
};

export default nextConfig;

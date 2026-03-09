import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@my-app/stripe", "@my-app/types", "@my-app/ui"]
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // PDF attachments are uploaded through a server action; the default body
    // limit is 1 MB, too small for real documents.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;

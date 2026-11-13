/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Firmware upload goes through a server action. Vercel's own request cap (~4.5 MB on
    // serverless) still applies in production; larger images need a direct signed upload.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;

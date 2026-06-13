/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // Next.js 16 uses Turbopack by default. onnxruntime-web's node entry
  // references fs/path/crypto; Turbopack handles these automatically via
  // browser field resolution, so no extra config is needed.
  turbopack: {},
};

export default nextConfig;

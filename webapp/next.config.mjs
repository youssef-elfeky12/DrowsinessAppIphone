/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // Next.js 16 uses Turbopack by default. onnxruntime-web's node entry
  // references fs/path/crypto; Turbopack handles these automatically via
  // browser field resolution, so no extra config is needed.
  turbopack: {},

  // Cross-origin isolation. onnxruntime-web only runs the WASM backend with
  // multiple threads when SharedArrayBuffer is available, which requires the
  // document to be cross-origin isolated (COOP + COEP). Without these headers
  // ORT silently falls back to a SINGLE thread — the main perf bottleneck.
  //
  // We use `require-corp` (not `credentialless`) because iOS Safari — the
  // primary PWA target — does not support credentialless. require-corp blocks
  // cross-origin subresources unless they opt in, which is why the ORT WASM is
  // now served same-origin from /public/ort (see detector.ts). All other
  // assets (models, icons) are same-origin too, so nothing breaks.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;

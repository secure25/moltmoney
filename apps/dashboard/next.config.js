/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@moltmoney/shared'],
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    // On this machine the webpack filesystem cache (`.next/cache/webpack`)
    // repeatedly fails with ERR_MEMORY_ALLOCATION_FAILED: serializing the
    // cache writes multi-hundred-MB buffers and reading it back gunzips
    // several packs in parallel, which exhausts free RAM (11.9 GB total).
    // Dev only needs the cache within a session, so keep it in memory and
    // skip the disk round-trip entirely. Production builds are untouched.
    if (dev) {
      config.cache = { type: 'memory' };
    }
    return config;
  },
}

module.exports = nextConfig

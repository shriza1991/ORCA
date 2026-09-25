/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/react'],
  webpack: (config) => {
    // Deck.gl and MapLibre fallback handling
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
};

export default nextConfig;

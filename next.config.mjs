/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PGlite 从包内读取 WASM 和数据库资源，pg 走 Node 原生网络栈，均保留 Node 路径解析。
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // echarts 体积较大，交给 webpack 处理
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), 'canvas', 'jsdom'];
    return config;
  },
};

export default nextConfig;

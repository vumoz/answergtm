/** @type {import('next').NextConfig} */
const nextConfig = {
  // The SQLite database lives on the server; keep the Anthropic SDK unbundled too.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};
export default nextConfig;

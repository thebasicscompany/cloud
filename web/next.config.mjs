/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained Node server (server.js + minimal node_modules) so the
  // renderer can be bundled INSIDE the Electron app and run locally — no hosted
  // web. The renderer no longer uses the service-role admin client, so nothing
  // secret ships in this output (only public NEXT_PUBLIC_* + the cloud/api base).
  output: "standalone",
  reactCompiler: true,
  devIndicators:
    process.env.BASICHOME_NEXT_DEV_INDICATORS === "1"
      ? {
          position: "bottom-right",
        }
      : false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
};

export default nextConfig;

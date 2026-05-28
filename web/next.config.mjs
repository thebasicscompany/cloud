/** @type {import('next').NextConfig} */
const nextConfig = {
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

const controlPlaneUrl =
  process.env.CONTROL_PLANE_INTERNAL_URL ?? "http://localhost:3001";

/** @type {import("next").NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/platform-api/:path*",
        destination: controlPlaneUrl + "/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;

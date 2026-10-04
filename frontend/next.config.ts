import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/orders",
        destination: "/delivery/orders",
        permanent: true,
      },
      {
        source: "/order/:id",
        destination: "/delivery/order/:id",
        permanent: true,
      },
      {
        source: "/entregador/calendario",
        destination: "/delivery/batchOrder",
        permanent: true,
      },
      {
        source: "/entregador/login",
        destination: "/delivery/login",
        permanent: true,
      },
      {
        source: "/entregador",
        destination: "/delivery/orders",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
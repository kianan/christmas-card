import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/** This machine's LAN IPv4 addresses, so phones can load the dev server. */
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Dev only: allow phones on the local network to use the dev server.
  allowedDevOrigins: lanAddresses,
};

export default nextConfig;

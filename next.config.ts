import type { NextConfig } from "next";

const next_config: NextConfig = {
    poweredByHeader: false,
    productionBrowserSourceMaps: false,
    // No current image widget needs a public optimizer or remote image fetch capability.
    images: { unoptimized: true, localPatterns: [], remotePatterns: [] },
    reactStrictMode: true,
};

export default next_config;

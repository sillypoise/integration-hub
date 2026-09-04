import assert from "node:assert/strict";
import type { NextConfig } from "next";

import { read_server_environment } from "./src/lib/config/server_environment";

const server_environment = read_server_environment(process.env);

assert.ok(server_environment.DATABASE_URL.length > 0);
assert.ok(server_environment.NODE_ENV.length > 0);

const next_config: NextConfig = {
    poweredByHeader: false,
    reactStrictMode: true,
};

export default next_config;

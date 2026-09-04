import pino from "pino";

import { read_server_environment } from "../config/server_environment.ts";

const environment = read_server_environment(process.env);

export const application_logger = pino({
    base: {
        service: "p1_integration_hub",
    },
    enabled: true,
    level: environment.LOG_LEVEL,
    messageKey: "message",
    redact: {
        paths: [
            "DATABASE_URL",
            "authorization",
            "cookie",
            "password",
            "request.headers.authorization",
            "request.headers.cookie",
            "token",
        ],
        censor: "[REDACTED]",
        remove: false,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});

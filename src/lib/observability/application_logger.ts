import pino from "pino";

export const application_logger = pino({
    base: {
        service: "p1_integration_hub",
    },
    enabled: true,
    level: "info",
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

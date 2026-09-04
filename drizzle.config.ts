import { defineConfig } from "drizzle-kit";

const database_url = process.env.DATABASE_URL;

if (typeof database_url !== "string") {
    throw new Error("DATABASE_URL is required for database commands.");
}

if (database_url.length === 0) {
    throw new Error("DATABASE_URL is required for database commands.");
}

export default defineConfig({
    dialect: "postgresql",
    out: "./drizzle",
    schema: "./src/db/schema.ts",
    dbCredentials: {
        url: database_url,
    },
    strict: true,
    verbose: true,
});

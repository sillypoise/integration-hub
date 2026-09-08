import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
    title: "Integration Hub",
    description: "Operational visibility for a reliable commerce-to-CRM customer sync.",
};

type RootLayoutProperties = Readonly<{
    children: ReactNode;
}>;

export default async function RootLayout({ children }: RootLayoutProperties) {
    // A fresh CSP nonce must accompany framework scripts; build-time HTML cannot supply one.
    await connection();
    return (
        <html lang="en">
            <body>
                <a className="skip-link" href="#main">
                    Skip to content
                </a>
                {children}
            </body>
        </html>
    );
}

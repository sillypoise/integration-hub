import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
    title: "Integration Hub",
    description: "Operational visibility for a reliable commerce-to-CRM customer sync.",
};

type RootLayoutProperties = Readonly<{
    children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProperties) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}

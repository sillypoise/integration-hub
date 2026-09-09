"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./ui_icon";

export function DemoShell({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <div className="workspace-layout">
            <DemoSidebar />
            <div className="workspace-body">
                <header className="topbar">
                    <span>
                        Commerce <span aria-hidden="true">/</span> Customer synchronization
                    </span>
                    <span className="badge neutral">Simulator environment</span>
                </header>
                <main id="main" tabIndex={-1} className="workspace-content">
                    {children}
                </main>
                <footer className="workspace-footer">
                    Independent Project · Product Concept{" "}
                    <span>Next.js + PostgreSQL + pg-boss</span>
                </footer>
            </div>
        </div>
    );
}

const navigation = [
    { href: "/demo", label: "Overview", icon: "overview" },
    { href: "/demo/runs", label: "Synchronization runs", icon: "runs" },
    { href: "/demo/controls", label: "Demo controls", icon: "controls" },
] as const;

function DemoSidebar() {
    const pathname = usePathname();
    return (
        <aside className="sidebar">
            <Link href="/" className="brand" prefetch={false}>
                <span className="brand-mark">
                    <Icon name="hub" />
                </span>
                Integration Hub
            </Link>
            <div className="sidebar-caption">WORKSPACE / DEMO</div>
            <nav aria-label="Demo navigation">
                {navigation.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        aria-current={
                            (
                                item.href === "/demo"
                                    ? pathname === item.href
                                    : pathname.startsWith(item.href)
                            )
                                ? "page"
                                : undefined
                        }
                    >
                        <span className="nav-mark">
                            <Icon name={item.icon} />
                        </span>
                        {item.label}
                    </Link>
                ))}
            </nav>
            <div className="sidebar-note">
                <span className="sidebar-dot" aria-hidden="true" /> Isolated demo
                <p>
                    Synthetic customers.
                    <br />
                    No external side effects.
                </p>
            </div>
            <Link href="/" className="sidebar-back" prefetch={false}>
                About this project ↗
            </Link>
        </aside>
    );
}

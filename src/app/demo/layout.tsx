import type { ReactNode } from "react";
import { DemoShell } from "../ui/demo_shell";

export default function DemoLayout({ children }: Readonly<{ children: ReactNode }>) {
    return <DemoShell>{children}</DemoShell>;
}

import Link from "next/link";

export default function NotFound() {
    return (
        <main id="main" tabIndex={-1} className="not-found">
            <h1>Page not found</h1>
            <p>This page is not available.</p>
            <Link className="button primary" href="/" prefetch={false}>
                Return to demo entry
            </Link>
        </main>
    );
}

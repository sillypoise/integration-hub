const icon_paths = {
    hub: "M4 5h6v6H4z M14 13h6v6h-6z M10 8h5a2 2 0 0 1 2 2v3 M7 11v3a2 2 0 0 0 2 2h5",
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    runs: "M3 7h17m-4-4 4 4-4 4 M21 17H4m4-4-4 4 4 4",
    controls: "M5 3v8m0 4v6M12 3v3m0 4v11M19 3v11m0 4v3 M2 11h6M9 6h6M16 14h6",
    commerce: "M4 8h16l-1 13H5L4 8Z M8 8V6a4 4 0 0 1 8 0v2",
    customer: "M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2",
    check: "m5 12 4 4L19 6",
    clock: "M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    attention: "M12 8v5m0 3v1 M12 3 2 21h20L12 3Z",
} as const;

// A fixed decorative set keeps navigation and provider symbols consistent without an icon runtime.
export function Icon({ name }: Readonly<{ name: keyof typeof icon_paths }>) {
    return (
        <svg
            className="icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            <path d={icon_paths[name]} />
        </svg>
    );
}

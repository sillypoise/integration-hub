import { notFound } from "next/navigation";
import { z } from "zod";
import { DetailScreen } from "../../../ui/detail_screen";

export default async function DetailPage({ params }: PageProps<"/demo/runs/[run_id]">) {
    const { run_id } = await params;
    const parsed = z.uuid().safeParse(run_id);
    if (!parsed.success) notFound();
    return <DetailScreen key={parsed.data} run_id={parsed.data} />;
}

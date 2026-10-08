import { requireUser } from "@/lib/auth/session";
import { ChangeLog } from "@/components/ChangeLog";
import { pageParam } from "@/components/Pagination";

export default async function TrainingHistoryPage({ searchParams }: PageProps<"/training/history">) {
  await requireUser();
  const sp = await searchParams;
  return (
    <ChangeLog
      prefixes={["training.", "principle.", "stage.", "portfolio.", "knowledge.files_added", "knowledge.file_removed"]}
      page={pageParam(sp.page)}
      href={(p) => `/training/history?page=${p}`}
      title="Changes to the Training Studio and knowledge base"
    />
  );
}

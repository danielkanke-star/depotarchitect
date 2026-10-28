import { notFound } from "next/navigation";
import { PreviewWorkspace } from "@/components/preview-workspace";
import { createPreviewData } from "@/lib/preview-data";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PreviewWorkspace initial={createPreviewData()} />;
}

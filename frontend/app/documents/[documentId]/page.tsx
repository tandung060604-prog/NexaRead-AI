import { DocumentDetail } from "@/components/document-detail";

type DocumentPageProps = {
  params: Promise<{ documentId: string }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { documentId } = await params;
  return <DocumentDetail documentId={documentId} />;
}


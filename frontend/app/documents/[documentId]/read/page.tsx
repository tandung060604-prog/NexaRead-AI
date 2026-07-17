import { DocumentReader } from "@/components/document-reader";
import { ReaderExperience } from "@/components/reader-experience";

type ReaderPageProps = {
  params: Promise<{ documentId: string }>;
};

export default async function ReaderPage({ params }: ReaderPageProps) {
  const { documentId } = await params;
  return (
    <ReaderExperience>
      <DocumentReader documentId={documentId} />
    </ReaderExperience>
  );
}

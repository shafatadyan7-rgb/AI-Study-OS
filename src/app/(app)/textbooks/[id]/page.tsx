import { Reader } from '@/components/Reader';

export default async function TextbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Reader textbookId={id} />;
}

import { TemplateBuilder } from '@/components/templates/template-builder';
import { getCoachSession } from '@/lib/auth/coach-session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function NewTemplatePage() {
  const session = await getCoachSession();
  if (!session) redirect('/auth/sign-in');

  return <TemplateBuilder mode="new" />;
}

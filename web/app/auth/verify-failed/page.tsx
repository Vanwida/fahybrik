interface VerifyFailedPageProps {
  searchParams: Promise<{ reason?: string }>;
}

const REASON_COPY: Record<string, string> = {
  missing_token: 'No sign-in token was provided.',
  invalid_or_expired: 'This link is invalid or has expired. Request a new one.',
  not_allowed: 'This email is not authorized to access the dashboard.',
};

export default async function VerifyFailedPage({ searchParams }: VerifyFailedPageProps) {
  const { reason } = await searchParams;
  const message = (reason && REASON_COPY[reason]) || 'Sign-in failed. Try requesting a new link.';

  return (
    <main className="min-h-screen flex items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Sign-in failed</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}

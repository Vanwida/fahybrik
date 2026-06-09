import { SignUp } from "@clerk/nextjs";

// Alta Clerk (atletas que se registran desde web / coaches invitados). Mismo
// patrón que sign-in: top-level, tema heredado del ClerkProvider.
export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <SignUp />
    </main>
  );
}

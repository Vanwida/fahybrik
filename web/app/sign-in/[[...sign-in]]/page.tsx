import { SignIn } from "@clerk/nextjs";

// Login Clerk del dashboard (coach + admin). Top-level fuera de [locale], como
// las páginas legales — la auth no se localiza. El tema (dark + naranja) se
// hereda del ClerkProvider en el root layout.
export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <SignIn />
    </main>
  );
}

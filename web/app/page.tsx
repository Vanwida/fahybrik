export default function Home() {
  return (
    <main className="flex flex-1 min-h-screen flex-col items-center justify-center bg-background px-6">
      <h1
        className="font-display italic font-black tracking-tight text-7xl sm:text-8xl md:text-9xl select-none"
        aria-label="FAHYBRIK"
      >
        <span style={{ color: "var(--accent-orange)" }}>F</span>
        <span className="text-foreground">AHYBRIK</span>
      </h1>
      <p className="mt-6 text-sm sm:text-base text-muted-foreground tracking-wide uppercase">
        Coach dashboard — UX pending sign-off
      </p>
    </main>
  );
}

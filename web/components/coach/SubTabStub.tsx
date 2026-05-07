import { Construction } from 'lucide-react';

interface SubTabStubProps {
  title: string;
  description: string;
}

export function SubTabStub({ title, description }: SubTabStubProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-6 py-12 text-center">
      <Construction className="mx-auto size-6 text-[color:var(--muted)]" aria-hidden strokeWidth={1.5} />
      <h2 className="text-[18px] italic text-[color:var(--fg)]" style={{ fontFamily: 'var(--font-display, var(--font-display-stack))', fontWeight: 800 }}>
        {title}
      </h2>
      <p className="mx-auto max-w-md text-[12px] text-[color:var(--muted)]">{description}</p>
      <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]/70">Próximamente</p>
    </div>
  );
}

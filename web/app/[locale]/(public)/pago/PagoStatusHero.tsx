// Shared on-brand hero for the payment result pages (#15). Server component —
// no client JS. The success/cancel pages compose it with their own copy so the
// visual language stays identical to the rest of the public/onboarding surface.

type Variant = 'success' | 'cancel';

export function PagoStatusHero({
  variant,
  title,
  body,
  hint,
}: {
  variant: Variant;
  title: string;
  body: string;
  hint?: string;
}) {
  return (
    <section className="flex flex-col items-center text-center py-8 md:py-14">
      <span
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{
          background:
            variant === 'success'
              ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
              : 'var(--hairline)',
        }}
      >
        {variant === 'success' ? <CheckMark /> : <ArrowBack />}
      </span>

      <h1 className="mt-7 font-display italic font-black tracking-tight text-3xl md:text-4xl text-[color:var(--fg)]">
        {title}
      </h1>
      <p className="mt-4 max-w-[440px] text-[15px] leading-7 text-[color:var(--fg)]/85">{body}</p>
      {hint ? (
        <p className="mt-6 text-[13px] leading-6 text-[color:var(--muted)] max-w-[420px]">{hint}</p>
      ) : null}
    </section>
  );
}

function CheckMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6L9 17l-5-5"
        stroke="var(--accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowBack() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 17l-5-5 5-5M6 12h12"
        stroke="var(--muted)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

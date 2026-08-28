import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const EXAMPLES = [
  { what: "Duplicate charge", who: "an electronics retailer", sum: "249.99" },
  { what: "Deposit withheld", who: "a former landlord", sum: "950.00" },
  { what: "Flight delayed 6h", who: "an airline", sum: "520.00" },
];

export function Welcome({
  onNew,
  onOpenExample,
  exampleLabel,
}: {
  onNew: () => void;
  onOpenExample?: () => void;
  exampleLabel?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduced) return;

      // One orchestrated arrival rather than a dozen independent fades: the
      // headline rises from behind its own mask, the rule draws itself, then
      // the supporting material settles.
      const tl = gsap.timeline({
        defaults: { ease: "expo.out", duration: 1 },
      });

      tl.from(".hero-line > span", { yPercent: 115, stagger: 0.08 })
        .from(
          ".hero-rule",
          { scaleX: 0, transformOrigin: "left center", duration: 0.9 },
          "-=0.65",
        )
        .from(
          ".hero-body",
          { y: 14, opacity: 0, stagger: 0.09, duration: 0.7 },
          "-=0.6",
        )
        .from(
          ".hero-row",
          { y: 10, opacity: 0, stagger: 0.06, duration: 0.6 },
          "-=0.45",
        )
        .from(".hero-cta", { y: 8, opacity: 0, duration: 0.6 }, "-=0.4");
    },
    { scope },
  );

  return (
    <div
      ref={scope}
      className="ruled relative flex h-full items-center justify-center px-8 py-16"
    >
      <div className="w-full max-w-[600px]">
        <p className="label hero-body">A claim you never got round to</p>

        <h2 className="mt-4 font-serif text-[34px] leading-[1.14] tracking-[-0.02em] sm:text-[42px]">
          <span className="reveal-line hero-line">
            <span>Most people are owed</span>
          </span>
          <span className="reveal-line hero-line">
            <span>something they never chase.</span>
          </span>
        </h2>

        <div className="hero-rule rule-fade mt-7 h-px w-full" />

        <p className="hero-body mt-6 max-w-[54ch] text-[14.5px] leading-[1.65] text-ink-700">
          Recourse reads the other side's own refund policy and terms, finds the
          clause that entitles you to the money, and writes to them citing it by
          reference. Then it handles the correspondence until the matter is
          settled.
        </p>

        <ul className="mt-9 space-y-px">
          {EXAMPLES.map((e) => (
            <li
              key={e.what}
              className="hero-row group flex items-baseline justify-between gap-4 border-b border-ink-100 py-2.5"
            >
              <span className="text-[13.5px] font-medium">{e.what}</span>
              <span className="hidden flex-1 truncate text-[13px] text-ink-400 sm:block">
                {e.who}
              </span>
              <span className="tnum text-[13.5px] font-medium text-ink-700">
                <span className="cur">£</span>
                {e.sum}
              </span>
            </li>
          ))}
        </ul>

        <div className="hero-cta mt-9 flex flex-wrap items-center gap-4">
          <button
            onClick={onNew}
            className="lift rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Open a claim
          </button>
          {onOpenExample && (
            <button
              onClick={onOpenExample}
              className="text-[13px] font-medium text-ink-700 underline decoration-ink-300 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
            >
              Read a finished claim{exampleLabel ? ` against ${exampleLabel}` : ""}
            </button>
          )}
          <p className="w-full text-[12.5px] text-ink-500">
            Nothing is sent until you approve it.
          </p>
        </div>
      </div>
    </div>
  );
}

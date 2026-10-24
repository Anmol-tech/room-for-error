import type { ReactNode } from "react";

const KANE_DOCS = "https://www.testmuai.com/support/docs/kane-cli-introduction/";

interface Props {
  /** "pill" for bars and panels, "hero" for the start and ending screens. */
  variant?: "pill" | "hero";
  children?: ReactNode;
}

/** "Powered by Kane CLI": every escape route is play-tested by Kane before players can finish through it. */
export function KaneBadge({ variant = "pill", children }: Props) {
  return (
    <a className={`kane-badge ${variant}`} href={KANE_DOCS} target="_blank" rel="noreferrer" title="Every escape route is play-tested by Kane CLI">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
        <path d="M8.8 12.2l2.2 2.2 4.3-4.6" />
      </svg>
      <span>{children ?? <>Powered by <strong>Kane CLI</strong></>}</span>
    </a>
  );
}

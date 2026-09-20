/** Shared Tailwind utilities keep the start and pause menus consistent. */
export const menu = {
  shell: "grid min-h-dvh place-items-center bg-gb-backdrop pt-[max(24px,env(safe-area-inset-top))] pr-[max(16px,env(safe-area-inset-right))] pb-[max(24px,env(safe-area-inset-bottom))] pl-[max(16px,env(safe-area-inset-left))]",
  panel: "border-6 border-double border-gb-ink bg-gb-screen p-6 text-xs leading-[1.65] text-gb-ink outline-2 outline-gb-screen font-pixel [font-synthesis:none] max-[360px]:p-4 [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-dashed [&_:focus-visible]:outline-gb-ink [&_:focus-visible]:outline-offset-4",
  primary: "min-h-11 rounded-none border-2 border-gb-ink bg-gb-ink px-4 py-3 text-xs font-normal text-gb-screen enabled:hover:bg-gb-hover enabled:hover:text-gb-ink",
  secondary: "min-h-11 rounded-none border-2 border-gb-ink bg-transparent p-2.5 text-xs font-normal text-gb-ink enabled:hover:bg-gb-hover",
  link: "min-h-11 py-3 text-xs text-inherit enabled:hover:bg-gb-hover",
  details: "group border-t-2 border-gb-line",
  summary: "flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 text-xs hover:bg-gb-hover [&::-webkit-details-marker]:hidden",
  indicator: "font-mono text-lg group-open:rotate-45",
  content: "grid gap-3 pt-1 pb-4 [&_select]:min-w-0 [&_select]:max-w-[65%]",
  note: "font-sans text-xs leading-relaxed text-gb-muted",
  status: "mt-3 border-2 border-gb-ink p-3 text-xs leading-relaxed",
};

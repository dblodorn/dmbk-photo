/* Stroke icons for the gallery's controls. Sized by Reshaped's Icon, which
   wraps whatever is passed as a Button's `icon`. */

const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export const CloseIcon = () => (
  <svg {...stroke}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const ChevronLeftIcon = () => (
  <svg {...stroke}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const ChevronRightIcon = () => (
  <svg {...stroke}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

import { Component, createUniqueId } from "solid-js";

/**
 * Inline version of `assets/img/logoV2Animated.svg`.
 *
 * Keeping the artwork inline lets the logo follow the active theme (the base
 * traces switch from light to dark) and the accent preference. The filter id is
 * unique per instance so multiple logos can be rendered safely.
 */
export const AnimatedLogo: Component<{ class?: string }> = (props) => {
  const glowId = `ascend-logo-glow-${createUniqueId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="330 342 364 308"
      class={props.class}
      role="img"
      aria-label="A.S.C.E.N.D."
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Static passive infrastructure */}
      <g fill="none" class="ascend-logo-base">
        <path
          class="ascend-logo-static-accent"
          stroke-width="48"
          d="M 436 498 L 512 366 L 588 498 Z"
        />

        <g class="ascend-logo-static-base">
          <path stroke-width="40" d="M 350 630 L 436 480" />
          <path stroke-width="40" d="M 674 630 L 588 480" />
          <line x1="340" y1="630" x2="435" y2="630" stroke-width="20" />
          <line x1="589" y1="630" x2="684" y2="630" stroke-width="20" />

          <g stroke-width="14">
            <line x1="512" y1="475" x2="512" y2="585" />
            <path d="M 500 470 L 524 470" />
            <path d="M 496 536 C 496 546 528 546 528 556" />
            <path d="M 405 505 L 452 552 L 486 552 L 486 585" />
            <path d="M 425 566 L 394 566" />
            <path d="M 423 605 L 423 630" />
            <path d="M 619 505 L 572 552 L 538 552 L 538 585" />
            <path d="M 599 566 L 630 566" />
            <path d="M 601 605 L 601 630" />
          </g>
        </g>

        <line
          class="ascend-logo-static-accent-soft"
          x1="512"
          y1="440"
          x2="512"
          y2="475"
          stroke-width="14"
        />
      </g>

      {/* Active dynamic signals */}
      <g fill="none" filter={`url(#${glowId})`}>
        <path
          class="ascend-logo-signal ascend-logo-signal-accent"
          stroke-width="48"
          d="M 436 498 L 512 366 L 588 498 Z"
        />
        <line
          x1="512"
          y1="440"
          x2="512"
          y2="585"
          stroke-width="14"
          class="ascend-logo-signal ascend-logo-signal-accent ascend-logo-delay-1"
        />
        <path
          class="ascend-logo-signal ascend-logo-signal-base ascend-logo-delay-1"
          stroke-width="14"
          d="M 405 505 L 452 552 L 486 552 L 486 585"
        />
        <path
          class="ascend-logo-signal ascend-logo-signal-base ascend-logo-delay-2"
          stroke-width="14"
          d="M 619 505 L 572 552 L 538 552 L 538 585"
        />
        <path
          class="ascend-logo-signal ascend-logo-signal-base ascend-logo-signal-reverse"
          stroke-width="40"
          d="M 350 630 L 436 480"
        />
        <path
          class="ascend-logo-signal ascend-logo-signal-base ascend-logo-delay-1"
          stroke-width="40"
          d="M 588 480 L 674 630"
        />
      </g>

      {/* Pulsing terminal nodes */}
      <g class="ascend-logo-nodes" filter={`url(#${glowId})`}>
        <circle cx="512" cy="458" r="9" class="ascend-logo-pulse-node" />
        <circle cx="387" cy="570" r="8" class="ascend-logo-pulse-node ascend-logo-delay-1" />
        <circle cx="414" cy="595" r="8" class="ascend-logo-pulse-node ascend-logo-delay-2" />
        <circle cx="613" cy="595" r="8" class="ascend-logo-pulse-node ascend-logo-delay-2" />
        <circle cx="640" cy="570" r="8" class="ascend-logo-pulse-node ascend-logo-delay-3" />
      </g>
    </svg>
  );
};

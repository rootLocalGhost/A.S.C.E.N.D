import { Component, JSX, Show } from "solid-js";
import { copyText, cx } from "../utils";
import { toast } from "../stateStore";

export const CopyButton: Component<{ value: string; label?: string; class?: string }> = (
  props
) => {
  return (
    <button
      type="button"
      class={cx("icon-btn copy-btn", props.class)}
      title={`Copy ${props.label || "value"}`}
      aria-label={`Copy ${props.label || "value"}`}
      onClick={async (event) => {
        event.stopPropagation();
        const ok = await copyText(props.value);
        toast(ok ? "Copied to clipboard" : "Could not copy", ok ? "success" : "error");
      }}
    >
      <i class="fa-regular fa-copy" />
    </button>
  );
};

export const ToggleSwitch: Component<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}> = (props) => (
  <button
    type="button"
    role="switch"
    aria-checked={props.checked}
    aria-label={props.label}
    disabled={props.disabled}
    class={cx("toggle-switch", props.checked && "on")}
    onClick={() => props.onChange(!props.checked)}
  >
    <span class="toggle-thumb" />
  </button>
);

export const Segmented: Component<{
  value: string;
  options: Array<{ value: string; label: string; icon?: string; badge?: number }>;
  onChange: (value: string) => void;
  ariaLabel?: string;
}> = (props) => (
  <div class="segmented" role="tablist" aria-label={props.ariaLabel}>
    {props.options.map((option) => (
      <button
        type="button"
        role="tab"
        aria-selected={props.value === option.value}
        class={cx("segmented-item", props.value === option.value && "active")}
        onClick={() => props.onChange(option.value)}
      >
        <Show when={option.icon}>
          <i class={option.icon} />
        </Show>
        <span>{option.label}</span>
        <Show when={option.badge !== undefined}>
          <span class="segmented-badge">{option.badge}</span>
        </Show>
      </button>
    ))}
  </div>
);

export const EmptyState: Component<{
  icon: string;
  title: string;
  description?: string;
  children?: JSX.Element;
}> = (props) => (
  <div class="empty-state">
    <div class="empty-state-icon">
      <i class={props.icon} />
    </div>
    <h2>{props.title}</h2>
    <Show when={props.description}>
      <p>{props.description}</p>
    </Show>
    {props.children}
  </div>
);

export const SkeletonLines: Component<{ count?: number; class?: string }> = (props) => (
  <div class={cx("skeleton-lines", props.class)}>
    {Array.from({ length: props.count ?? 4 }).map((_, index) => (
      <div class="skeleton-line" style={{ width: `${85 - ((index * 13) % 45)}%` }} />
    ))}
  </div>
);

export const IconButton: Component<{
  icon: string;
  title: string;
  onClick: (event: MouseEvent) => void;
  class?: string;
  danger?: boolean;
  disabled?: boolean;
}> = (props) => (
  <button
    type="button"
    class={cx("icon-btn", props.danger && "danger", props.class)}
    title={props.title}
    aria-label={props.title}
    disabled={props.disabled}
    onClick={props.onClick}
  >
    <i class={props.icon} />
  </button>
);

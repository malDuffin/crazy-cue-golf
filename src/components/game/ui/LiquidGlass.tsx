import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GlassPanel({
  className,
  strong,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { strong?: boolean }) {
  return (
    <div
      className={cn(
        "liquid-glass relative overflow-hidden",
        strong && "liquid-glass-strong",
        className,
      )}
      {...props}
    >
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

export function GlassButton({
  className,
  variant = "primary",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "liquid-btn",
        variant === "primary" ? "liquid-btn-primary" : "liquid-btn-ghost",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function GlassChip({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("liquid-chip", className)} {...props}>
      {children}
    </span>
  );
}

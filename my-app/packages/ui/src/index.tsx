import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export function Button({ children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      {...props}
      style={{
        borderRadius: 8,
        border: "1px solid #d1d5db",
        padding: "10px 14px",
        fontWeight: 600,
        background: "#111827",
        color: "#ffffff",
        cursor: "pointer"
      }}
    >
      {children}
    </button>
  );
}

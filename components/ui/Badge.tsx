"use client";

interface BadgeProps {
  variant?: "default" | "success" | "warning" | "error" | "info";
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  const variants = {
    default: "bg-gray-700 text-gray-300",
    success: "bg-green-900/50 text-green-400 border border-green-700",
    warning: "bg-yellow-900/50 text-yellow-400 border border-yellow-700",
    error: "bg-red-900/50 text-red-400 border border-red-700",
    info: "bg-blue-900/50 text-blue-400 border border-blue-700",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

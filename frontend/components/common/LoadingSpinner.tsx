type SpinnerSize = "sm" | "md" | "lg" | "xl";

export function LoadingSpinner({
  size = "md",
  className = "",
}: {
  size?: SpinnerSize;
  className?: string;
}) {
  const sizeMap: Record<SpinnerSize, string> = {
    sm: "w-5 h-5",
    md: "w-10 h-10",
    lg: "w-16 h-16",
    xl: "w-24 h-24",
  };

  const sizeClass = sizeMap[size] || sizeMap.md;

  return (
    <div className={`relative ${sizeClass} ${className}`}>
      <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
      <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
    </div>
  );
}
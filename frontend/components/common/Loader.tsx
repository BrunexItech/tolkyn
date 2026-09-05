import { LoadingSpinner } from "./LoadingSpinner";

interface LoaderProps {
  fullScreen?: boolean;
  message?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Loader({ fullScreen = false, message, size = "md" }: LoaderProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      <LoadingSpinner size={size} />
      {message && <p className="text-sm text-[#8A8DA8] animate-pulse">{message}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0F1229]/90 backdrop-blur-sm z-50">
        {content}
      </div>
    );
  }

  return content;
}
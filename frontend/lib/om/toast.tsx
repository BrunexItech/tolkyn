import hot from "react-hot-toast";
import { CheckCircle2, TriangleAlert, XCircle, Info } from "lucide-react";

const ok = (msg: string) =>
  hot.success(msg, { icon: <CheckCircle2 className="size-4 text-om-green" /> });

const warn = (msg: string) =>
  hot(msg, {
    icon: <TriangleAlert className="size-4 text-om-amber" />,
    style: { borderLeft: "2px solid #f5b642" },
  });

const err = (msg: string) =>
  hot.error(msg, { icon: <XCircle className="size-4 text-om-red" /> });

const info = (msg: string) =>
  hot(msg, { icon: <Info className="size-4 text-om-blue" /> });

/** Tolkyn toast helper over react-hot-toast, with lucide icons. */
export const toast = { ok, warn, err, info };

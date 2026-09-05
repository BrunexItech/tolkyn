import type { IconType } from "react-icons";
import {
  SiFacebook,
  SiInstagram,
  SiX,
  SiTiktok,
  SiYoutube,
  SiWhatsapp,
} from "react-icons/si";
import { FaLinkedinIn } from "react-icons/fa6";

export type PlatformId = "facebook" | "instagram" | "x" | "tiktok" | "linkedin" | "youtube" | "whatsapp";

export interface Platform {
  id: PlatformId;
  name: string;
  handle: string;
  Icon: IconType;
  color: string;
  followers: string;
  followersN: number;
  /** publishing / DM ceiling copy */
  limit: string;
  api: string;
  kind: "social" | "messaging" | "video";
}

export const PLATFORMS: Platform[] = [
  { id: "facebook", name: "Facebook", handle: "@tolkyn", Icon: SiFacebook, color: "#1877F2", followers: "48.2K", followersN: 48200, limit: "200 posts/day", api: "Graph v19", kind: "social" },
  { id: "instagram", name: "Instagram", handle: "@tolkyn", Icon: SiInstagram, color: "#E1306C", followers: "31.7K", followersN: 31700, limit: "100 posts/day", api: "Graph v19", kind: "social" },
  { id: "x", name: "X", handle: "@tolkyn", Icon: SiX, color: "#e7e9ea", followers: "22.4K", followersN: 22400, limit: "500 posts/day", api: "API v2", kind: "social" },
  { id: "linkedin", name: "LinkedIn", handle: "Tolkyn", Icon: FaLinkedinIn, color: "#0A66C2", followers: "14.9K", followersN: 14900, limit: "150 posts/day", api: "API v2", kind: "social" },
  { id: "tiktok", name: "TikTok", handle: "@tolkyn", Icon: SiTiktok, color: "#e7e9ea", followers: "89.1K", followersN: 89100, limit: "1K posts/day", api: "Content v2", kind: "video" },
  { id: "youtube", name: "YouTube", handle: "@tolkyn", Icon: SiYoutube, color: "#FF0000", followers: "26.3K", followersN: 26300, limit: "Unlimited", api: "Data API v3", kind: "video" },
  { id: "whatsapp", name: "WhatsApp", handle: "Business", Icon: SiWhatsapp, color: "#25D366", followers: "12.8K", followersN: 12800, limit: "1K msgs/day", api: "Cloud v18", kind: "messaging" },
];

export const SOCIAL_PLATFORM_COUNT = PLATFORMS.length;

export function platform(id: string): Platform | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

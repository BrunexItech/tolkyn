import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Inbox,
  MessageCircle,
  MessageSquareText,
  Mail,
  BookUser,
  Headset,
  PenSquare,
  Send,
  CalendarDays,
  Sparkles,
  Megaphone,
  ChartNoAxesColumn,
  UsersRound,
  Target,
  Contact,
  Map,
  Newspaper,
  Workflow,
  Plug,
  UserCog,
  Settings,
  Clapperboard,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** id used to look up a live badge count in the sidebar */
  badgeKey?: "inbox" | "calendar" | "accounts" | "calls" | "crm" | "published";
  /** Matches a key in ROLE_PERMISSIONS (backend app/models/team_member.py).
   * A team member missing this permission never sees the item — the owner
   * (no TeamMember row, or role "owner") always sees everything. Omit for
   * pages every role should see regardless of permission. */
  permKey?: string;
  /** Matches a key in app/core/features.py MODULES. Hidden when the
   * workspace's pricing package doesn't grant the module. Omit for pages
   * every plan includes. */
  moduleKey?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Engage",
    items: [
      { label: "Social Media Inbox", href: "/dashboard/inbox", icon: Inbox, badgeKey: "inbox", permKey: "engage", moduleKey: "engage" },
      { label: "Call Center", href: "/dashboard/calls", icon: Headset, badgeKey: "calls", permKey: "engage", moduleKey: "call_center" },
      { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageCircle, permKey: "messaging", moduleKey: "whatsapp" },
      { label: "Bulk SMS", href: "/dashboard/sms", icon: MessageSquareText, permKey: "messaging", moduleKey: "sms" },
      { label: "Bulk Email", href: "/dashboard/email", icon: Mail, permKey: "messaging", moduleKey: "email" },
      { label: "Phone Book", href: "/dashboard/phonebook", icon: BookUser, permKey: "messaging", moduleKey: "sms" },
    ],
  },
  {
    title: "Publish",
    items: [
      { label: "Composer", href: "/dashboard/publishing", icon: PenSquare, permKey: "publish", moduleKey: "publishing" },
      { label: "Published", href: "/dashboard/published", icon: Send, badgeKey: "published", permKey: "publish", moduleKey: "publishing" },
      { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays, badgeKey: "calendar", permKey: "publish", moduleKey: "publishing" },
      { label: "Content Studio", href: "/dashboard/content-studio", icon: Sparkles, permKey: "publish", moduleKey: "content_studio" },
      { label: "AI Video", href: "/dashboard/video", icon: Clapperboard, permKey: "publish", moduleKey: "video" },
      { label: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone, permKey: "campaigns", moduleKey: "campaigns" },
    ],
  },
  {
    title: "Grow",
    items: [
      { label: "Analytics", href: "/dashboard/analytics", icon: ChartNoAxesColumn, permKey: "analytics", moduleKey: "analytics" },
      { label: "Media Intelligence", href: "/dashboard/media-intelligence", icon: Newspaper, permKey: "analytics", moduleKey: "analytics" },
      { label: "Audience", href: "/dashboard/audience", icon: UsersRound, moduleKey: "audience" },
      { label: "Geo Targeting", href: "/dashboard/geo", icon: Map, moduleKey: "geo" },
      { label: "Lead Generator", href: "/dashboard/leads", icon: Target, permKey: "leads", moduleKey: "leads" },
      { label: "CRM", href: "/dashboard/crm", icon: Contact, badgeKey: "crm", permKey: "crm", moduleKey: "crm" },
      { label: "Automations", href: "/dashboard/automations", icon: Workflow, permKey: "automations", moduleKey: "automations" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Connected Accounts", href: "/dashboard/accounts", icon: Plug, badgeKey: "accounts", permKey: "connections" },
      { label: "Team", href: "/dashboard/team", icon: UserCog, permKey: "team" },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Workspace overview" },
  "/dashboard/inbox": { title: "Social Media Inbox", subtitle: "Comments, mentions and DMs in one queue" },
  "/dashboard/calls": { title: "Call Center", subtitle: "Inbound & outbound voice" },
  "/dashboard/calls/flow": { title: "Call flow / IVR", subtitle: "What callers hear and where each key sends them" },
  "/dashboard/whatsapp": { title: "WhatsApp", subtitle: "Automated number, conversations & communities" },
  "/dashboard/sms": { title: "Bulk SMS", subtitle: "Send SMS campaigns to your phone books and contacts" },
  "/dashboard/email": { title: "Bulk Email", subtitle: "Email your leads and customers from your own address" },
  "/dashboard/phonebook": { title: "Phone Book", subtitle: "Saved numbers by category — VIP, traders, and more" },
  "/dashboard/publishing": { title: "Composer", subtitle: "Draft, preview and publish" },
  "/dashboard/published": { title: "Published", subtitle: "Live links and failed posts" },
  "/dashboard/calendar": { title: "Content Calendar", subtitle: "Scheduled & published posts" },
  "/dashboard/content-studio": { title: "Content Studio", subtitle: "AI copy and images" },
  "/dashboard/video": { title: "AI Video", subtitle: "Generate realistic video with sound, powered by Veo 3.1" },
  "/dashboard/campaigns": { title: "Campaigns", subtitle: "Multi-channel campaign planning" },
  "/dashboard/analytics": { title: "Analytics", subtitle: "Reach, engagement and growth" },
  "/dashboard/media-intelligence": {
    title: "Media Intelligence",
    subtitle: "What's happening right now, in your space",
  },
  "/dashboard/audience": { title: "Audience", subtitle: "Followers, segments and contacts" },
  "/dashboard/geo": { title: "Geo Targeting", subtitle: "Target areas, reach and location insight" },
  "/dashboard/leads": { title: "Lead Generator", subtitle: "Discover, score and enrich prospects" },
  "/dashboard/crm": { title: "CRM", subtitle: "Track and grow your customers" },
  "/dashboard/automations": { title: "Automations", subtitle: "Rules, triggers and workflows" },
  "/dashboard/accounts": { title: "Connected Accounts", subtitle: "Social profiles & channels" },
  "/dashboard/team": { title: "Team", subtitle: "Members, roles and permissions" },
  "/dashboard/settings": { title: "Settings", subtitle: "Your profile, password and sending accounts" },
};

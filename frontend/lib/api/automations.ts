import { http } from "./http";

export type AutomationTrigger =
  | "new_lead"
  | "new_comment"
  | "new_mention"
  | "inbound_message"
  | "post_published"
  | "schedule";

export type AutomationAction =
  | "send_email"
  | "send_sms"
  | "add_tag"
  | "push_to_crm"
  | "assign_teammate"
  | "auto_reply"
  | "notify";

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  trigger_config: Record<string, unknown>;
  action: AutomationAction;
  action_config: Record<string, unknown>;
  enabled: boolean;
  runs_count: number;
  last_run_at: string | null;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  status: string;
  summary: string | null;
  context: Record<string, unknown>;
  created_at: string;
}

export interface CatalogEntry {
  id: string;
  label: string;
  fields: string[];
}

export interface AutomationSummary {
  total: number;
  active: number;
  runs_total: number;
  triggers: CatalogEntry[];
  actions: CatalogEntry[];
}

export interface AutomationInput {
  name?: string;
  description?: string;
  trigger?: AutomationTrigger;
  trigger_config?: Record<string, unknown>;
  action?: AutomationAction;
  action_config?: Record<string, unknown>;
  enabled?: boolean;
}

export const automationsApi = {
  list: () => http.get<{ items: Automation[] }>("/automations"),
  summary: () => http.get<AutomationSummary>("/automations/summary"),
  create: (body: AutomationInput) => http.post<Automation>("/automations", body),
  update: (id: string, body: AutomationInput) => http.patch<Automation>(`/automations/${id}`, body),
  toggle: (id: string, enabled: boolean) =>
    http.post<Automation>(`/automations/${id}/toggle`, { enabled }),
  test: (id: string) => http.post<AutomationRun>(`/automations/${id}/test`),
  runs: (id: string) => http.get<{ items: AutomationRun[] }>(`/automations/${id}/runs`),
  remove: (id: string) => http.del<void>(`/automations/${id}`),
};

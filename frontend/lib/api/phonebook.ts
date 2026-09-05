import { http } from "./http";
import type { BroadcastRecipient, CsvImportResult } from "./messaging";

export interface PhoneBook {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

export interface PhoneBookContact {
  id: string;
  phone: string;
  name: string | null;
  source: "csv" | "lead" | "manual";
  created_at: string;
  also_in_other_books: boolean;
}

export interface PhoneBookDetail extends PhoneBook {
  contacts: PhoneBookContact[];
}

export interface PhoneBookAddResult {
  added: number;
  skipped_duplicate: number;
  skipped_invalid: number;
  duplicate_phones: string[];
  cross_book_phones: string[];
}

export interface DuplicateAcrossBooks {
  phone: string;
  name: string | null;
  books: string[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const phoneBookApi = {
  list: () => http.get<{ items: PhoneBook[] }>("/phone-books"),
  get: (id: string) => http.get<PhoneBookDetail>(`/phone-books/${id}`),
  create: (body: { name: string; description?: string; color?: string }) =>
    http.post<PhoneBook>("/phone-books", body),
  update: (id: string, body: { name?: string; description?: string; color?: string }) =>
    http.patch<PhoneBookDetail>(`/phone-books/${id}`, body),
  remove: (id: string) => http.del<void>(`/phone-books/${id}`),
  addContacts: (id: string, body: { contacts?: BroadcastRecipient[]; lead_ids?: string[] }) =>
    http.post<PhoneBookAddResult>(`/phone-books/${id}/contacts`, body),
  removeContact: (id: string, contactId: string) =>
    http.del<void>(`/phone-books/${id}/contacts/${contactId}`),
  duplicates: () => http.get<{ items: DuplicateAcrossBooks[] }>("/phone-books/duplicates"),
  parseCsv: async (file: File): Promise<CsvImportResult> => {
    const fd = new FormData();
    fd.append("file", file);
    const tok = typeof window === "undefined" ? null : localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/phone-books/parse-csv`, {
      method: "POST",
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.detail || `Import failed (${res.status})`);
    return data as CsvImportResult;
  },
};

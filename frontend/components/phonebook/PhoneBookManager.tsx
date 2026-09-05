"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookUser,
  Loader2,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users2,
} from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { StatusBadge } from "@/components/om/primitives/StatusBadge";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { relativeTime } from "@/lib/om/format";
import { cn } from "@/lib/utils";
import {
  usePhoneBook,
  usePhoneBooks,
  usePhoneBookDuplicates,
  useDeletePhoneBook,
  useRemovePhoneBookContact,
} from "./hooks";
import { CreatePhoneBookModal } from "./CreatePhoneBookModal";
import { AddContactsModal } from "./AddContactsModal";

export function PhoneBookManager() {
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="om-anim-rise space-y-3">
      {selected ? (
        <BookDetail id={selected} onBack={() => setSelected(null)} />
      ) : (
        <BookList onSelect={setSelected} onNew={() => setCreateOpen(true)} />
      )}
      <CreatePhoneBookModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function BookList({ onSelect, onNew }: { onSelect: (id: string) => void; onNew: () => void }) {
  const { data, isLoading } = usePhoneBooks();
  const { data: dupes } = usePhoneBookDuplicates();
  const books = data?.items ?? [];
  const dupItems = dupes?.items ?? [];

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-om-muted">
          {books.length} phone book{books.length === 1 ? "" : "s"}
        </div>
        <OmButton variant="solid" size="sm" onClick={onNew}>
          <Plus /> New phone book
        </OmButton>
      </div>

      {dupItems.length > 0 && (
        <Card accent="amber" className="space-y-1.5">
          <CardTitle icon={<TriangleAlert />} color="var(--om-amber)">
            {dupItems.length} number{dupItems.length === 1 ? "" : "s"} in more than one phone book
          </CardTitle>
          <div className="om-scroll max-h-40 space-y-1 overflow-y-auto">
            {dupItems.map((d) => (
              <div
                key={d.phone}
                className="flex items-center gap-2 rounded-md bg-white/[0.02] px-2 py-1.5 text-[11px]"
              >
                <span className="font-mono text-om-dim">{d.phone}</span>
                {d.name && <span className="text-om-muted">{d.name}</span>}
                <span className="ml-auto flex flex-wrap gap-1">
                  {d.books.map((b) => (
                    <StatusBadge key={b} tone="amber">
                      {b}
                    </StatusBadge>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-om-faint">
            This is fine if intentional — open a book to remove a number you didn&rsquo;t mean to add there.
          </p>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-om-muted">
          <Loader2 className="size-4 animate-spin" /> Loading phone books…
        </div>
      ) : books.length === 0 ? (
        <EmptyState icon={<BookUser />} title="No phone books yet">
          Create a category — VIP, Traders, Wholesale — then import numbers from a CSV, your leads, or by
          hand. Phone books feed your Bulk SMS campaigns.
        </EmptyState>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((b) => (
            <button
              key={b.id}
              onClick={() => onSelect(b.id)}
              className="flex flex-col gap-2 rounded-xl border border-om-border bg-om-card p-3.5 text-left transition-colors hover:border-om-blue/40"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: b.color || "var(--om-faint)" }}
                />
                <span className="flex-1 truncate text-[13px] font-semibold text-om-text">{b.name}</span>
              </div>
              {b.description && (
                <p className="line-clamp-2 text-[11px] leading-relaxed text-om-muted">{b.description}</p>
              )}
              <div className="mt-auto flex items-center gap-1.5 text-[11px] text-om-faint">
                <Users2 className="size-3.5" />
                {b.contact_count} number{b.contact_count === 1 ? "" : "s"}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function BookDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: book, isLoading } = usePhoneBook(id);
  const del = useDeletePhoneBook();
  const removeContact = useRemovePhoneBookContact();
  const { confirm, dialog } = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");

  const contacts = useMemo(() => {
    const list = book?.contacts ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) => `${c.name ?? ""} ${c.phone}`.toLowerCase().includes(s));
  }, [book, q]);

  if (isLoading || !book) {
    return (
      <div className="flex items-center gap-2 py-8 text-[12px] text-om-muted">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete phone book?",
      message: (
        <>
          <strong className="text-om-text">{book.name}</strong> and all {book.contact_count} number
          {book.contact_count === 1 ? "" : "s"} in it will be permanently removed.
        </>
      ),
      confirmLabel: "Delete phone book",
      danger: true,
    });
    if (!ok) return;
    await del.mutateAsync(book.id);
    onBack();
  };

  const onRemoveContact = async (contactId: string, phone: string) => {
    const ok = await confirm({
      title: "Remove number?",
      message: (
        <>
          Remove <span className="font-mono text-om-text">{phone}</span> from {book.name}?
        </>
      ),
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) removeContact.mutate({ id: book.id, contactId });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onBack}
          className="grid size-7 place-items-center rounded-lg text-om-muted hover:bg-white/[0.05] hover:text-om-text"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="size-3 shrink-0 rounded-full" style={{ background: book.color || "var(--om-faint)" }} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold tracking-tight">{book.name}</div>
          <div className="text-[11px] text-om-muted">
            {book.contact_count} number{book.contact_count === 1 ? "" : "s"}
            {book.description ? ` · ${book.description}` : ""}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <OmButton variant="solid" size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus /> Add numbers
          </OmButton>
          <OmButton variant="danger" size="sm" onClick={onDelete} disabled={del.isPending}>
            <Trash2 /> Delete book
          </OmButton>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-om-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search this phone book"
          className="w-full rounded-lg border border-om-border bg-white/[0.03] py-1.5 pl-8 pr-3 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
        />
      </div>

      {contacts.length === 0 ? (
        <EmptyState icon={<Users2 />} title={q ? "No matches" : "No numbers yet"}>
          {q ? "Try a different search." : "Add numbers from a CSV, your leads, or by hand."}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-om-border">
          <div className="om-scroll max-h-[calc(100vh-320px)] overflow-y-auto divide-y divide-om-border">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                <span className="w-40 shrink-0 font-mono text-om-dim">{c.phone}</span>
                <span className="min-w-0 flex-1 truncate text-om-muted">{c.name || "—"}</span>
                <StatusBadge tone="muted">{c.source}</StatusBadge>
                {c.also_in_other_books && (
                  <StatusBadge tone="amber" icon={<TriangleAlert />}>
                    in another book
                  </StatusBadge>
                )}
                <span className="hidden w-20 shrink-0 text-right text-[10px] text-om-faint sm:block">
                  {relativeTime(c.created_at)}
                </span>
                <button
                  onClick={() => onRemoveContact(c.id, c.phone)}
                  className="shrink-0 text-om-muted transition-colors hover:text-om-red"
                  aria-label="Remove"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddContactsModal
        bookId={book.id}
        bookName={book.name}
        accent={book.color || "#4f7aff"}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      {dialog}
    </>
  );
}

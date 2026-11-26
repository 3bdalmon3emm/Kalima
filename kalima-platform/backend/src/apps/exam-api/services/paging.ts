// One way to page every list in the exam system: ?page=1&page_size=20.
// Lists answer with { items, page, page_size, total, pages }; nothing is
// capped, the rest is on the next pages.

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type Paging = { page: number; size: number; skip: number };

export function paging(query: { page?: unknown; page_size?: unknown } = {}, defaultSize = DEFAULT_PAGE_SIZE): Paging {
  const page = Math.max(Math.floor(Number(query.page)) || 1, 1);
  const asked = Math.floor(Number(query.page_size));
  const size = Math.min(Math.max(Number.isFinite(asked) && asked > 0 ? asked : defaultSize, 1), MAX_PAGE_SIZE);
  return { page, size, skip: (page - 1) * size };
}

export function paged<T>(items: T[], total: number, p: Paging) {
  return { items, page: p.page, page_size: p.size, total, pages: Math.max(Math.ceil(total / p.size), 1) };
}

// A page cut from a list already in memory (small lists sorted in code).
export function slicePage<T>(all: T[], p: Paging) {
  return paged(all.slice(p.skip, p.skip + p.size), all.length, p);
}

export const searchTerm = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// People matching a name, phone, email or student number.
export function personWhere(term: string) {
  if (!term) return {};
  const serial = /^\d+$/.test(term) ? Number(term) : null;
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" as const } },
      { phone: { contains: term } },
      { email: { contains: term, mode: "insensitive" as const } },
      ...(serial !== null && serial <= 2_147_483_647 ? [{ students: { sequenced_id: serial } }] : []),
    ],
  };
}

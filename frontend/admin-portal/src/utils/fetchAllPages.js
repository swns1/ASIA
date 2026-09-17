// Every row of a paginated list, not just the first page.
//
// The services cap page_size at 500 (StandardPagination), so asking for a big
// page and treating it as "everything" silently drops the rest once a school
// outgrows it. This walks `next` until the list ends.
//
// `maxPages` is a runaway guard, not an expected limit: 20 pages of 500 is
// ten thousand rows.
export default async function fetchAllPages(fetchPage, params = {}, { pageSize = 500, maxPages = 20 } = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await fetchPage({ ...params, page, page_size: pageSize });
    // A plain array means the endpoint isn't paginated; one call is all there is.
    if (Array.isArray(res)) return res;
    rows.push(...(res?.results ?? []));
    if (!res?.next) break;
  }
  return rows;
}

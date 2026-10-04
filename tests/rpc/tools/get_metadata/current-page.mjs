/** Read-only smoke: get_metadata and get_document must identify the same current PAGE. */
export const writes = false;

export default async function currentPage({ request, pageId }) {
  const result = await request('get_document', {}, 'current-page-document');
  if (result.error || result.transportError) throw new Error(`get_document failed: ${JSON.stringify(result)}`);
  const page = result.data;
  if (page?.id !== pageId || page?.type !== 'PAGE') {
    throw new Error(`Document page differs from metadata ${pageId}: ${JSON.stringify({ id: page?.id, type: page?.type })}`);
  }
  return { classification: 'passed', currentPageId: pageId };
}

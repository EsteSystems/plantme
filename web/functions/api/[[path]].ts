const WORKER_URL = "https://plantme-api.tiny-cake-b3f4.workers.dev";

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const target = new URL(url.pathname + url.search, WORKER_URL);

  const response = await fetch(target.toString(), {
    method: context.request.method,
    headers: context.request.headers,
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
};

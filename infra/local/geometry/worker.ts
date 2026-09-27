/** Local-only bridge for environments where workerd cannot start Docker containers.
 * Register under the same local service name; never deploy this entry point. */
const worker = {
  async fetch(request: Request) {
    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "127.0.0.1:8789";
    return fetch(new Request(url, request));
  },
};
export default worker;

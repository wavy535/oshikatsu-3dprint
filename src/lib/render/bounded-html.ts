/** Buffer only small HTML documents. On overflow, replay the prefix and keep
 * streaming the original body with backpressure; files and large pages stay streams. */
export async function readBoundedHtml(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<{ html: string } | { stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      reader.releaseLock();
      const data = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      return { html: new TextDecoder().decode(data) };
    }
    chunks.push(value);
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      let index = 0;
      return { stream: new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (index < chunks.length) { controller.enqueue(chunks[index++]); return; }
          const result = await reader.read();
          if (result.done) { reader.releaseLock(); controller.close(); }
          else controller.enqueue(result.value);
        },
        async cancel(reason) { await reader.cancel(reason); reader.releaseLock(); },
      }) };
    }
  }
}

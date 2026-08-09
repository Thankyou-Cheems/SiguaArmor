export function GET() {
  return new Response("OK\n", {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

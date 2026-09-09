import { getAuth } from "@/lib/auth/config";
import { authHeaders } from "@/lib/auth/request";

export async function GET(request: Request) {
  return getAuth().handler(
    new Request(request, { headers: authHeaders(request.headers) }),
  );
}
export async function POST(request: Request) {
  return getAuth().handler(
    new Request(request, { headers: authHeaders(request.headers) }),
  );
}

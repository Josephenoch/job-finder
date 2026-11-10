import { isApplicationStatus, setJobStatus } from "@/lib/store";

export async function PATCH(request: Request, context: RouteContext<"/api/jobs/[id]">) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Choose a status." }, { status: 400 });
  }
  const status = body && typeof body === "object" && "status" in body ? body.status : null;
  if (typeof status !== "string" || !isApplicationStatus(status)) {
    return Response.json({ message: "Choose a status." }, { status: 400 });
  }
  const job = await setJobStatus(id, status);
  if (!job) return Response.json({ message: "That role is not saved." }, { status: 404 });
  return Response.json(job);
}

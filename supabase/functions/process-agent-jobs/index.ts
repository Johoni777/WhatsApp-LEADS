import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const AI_AGENT_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-agent`;
const PROCESS_AGENT_JOBS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-agent-jobs`;
const MAX_JOBS_PER_RUN = 5;
const CLAIM_CANDIDATE_MULTIPLIER = 5;
const MAX_SELF_SCHEDULE_DELAY_MS = 55_000;
const STALE_LOCK_MS = 10 * 60 * 1000;

interface AgentJobRow {
  id: string;
  workspace_id: string;
  conversation_id: string;
  contact_id: string | null;
  contact_name: string | null;
  latest_message: string | null;
  message_id: string | null;
  batch_started_at: string | null;
  status: "pending" | "processing" | "retry" | "completed" | "fallback_sent" | "failed" | "cancelled";
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
}

function runAsync(task: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
  } else {
    task.catch((error) => console.error("Async task failed:", error));
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleWorkerRun(delayMs: number, reason: string) {
  const boundedDelayMs = Math.max(0, Math.min(delayMs, MAX_SELF_SCHEDULE_DELAY_MS));

  runAsync((async () => {
    if (boundedDelayMs > 0) {
      await sleep(boundedDelayMs);
    }

    await fetch(PROCESS_AGENT_JOBS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    });
  })());
}

async function logJob(job: Pick<AgentJobRow, "id" | "workspace_id" | "conversation_id">, level: "info" | "warn" | "error", eventType: string, message: string, details: Record<string, unknown> = {}) {
  await supabase.from("agent_job_logs").insert({
    job_id: job.id,
    workspace_id: job.workspace_id,
    conversation_id: job.conversation_id,
    level,
    event_type: eventType,
    message,
    details,
  });
}

async function reviveStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data: staleJobs } = await supabase
    .from("agent_jobs")
    .select("id, workspace_id, conversation_id")
    .eq("status", "processing")
    .lt("locked_at", cutoff);

  if (!staleJobs?.length) return;

  await supabase
    .from("agent_jobs")
    .update({
      status: "retry",
      locked_at: null,
      locked_by: null,
      next_attempt_at: new Date().toISOString(),
      last_error: "Job lock expired while processing",
      last_error_code: "stale_lock",
    })
    .eq("status", "processing")
    .lt("locked_at", cutoff);

  for (const job of staleJobs) {
    await logJob(job as Pick<AgentJobRow, "id" | "workspace_id" | "conversation_id">, "warn", "stale_lock_released", "Job travado foi devolvido para retry.");
  }
}

async function claimReadyJobs(workerId: string, limit: number): Promise<AgentJobRow[]> {
  const now = new Date().toISOString();
  const { data: candidates } = await supabase
    .from("agent_jobs")
    .select("*")
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit * CLAIM_CANDIDATE_MULTIPLIER);

  if (!candidates?.length) return [];

  const claimedJobs: AgentJobRow[] = [];
  const claimedConversationIds = new Set<string>();

  for (const candidate of candidates as AgentJobRow[]) {
    if (claimedConversationIds.has(candidate.conversation_id)) {
      continue;
    }

    const { data: claimed } = await supabase
      .from("agent_jobs")
      .update({
        status: "processing",
        locked_at: now,
        locked_by: workerId,
        last_attempt_at: now,
        attempt_count: candidate.attempt_count + 1,
      })
      .eq("id", candidate.id)
      .in("status", ["pending", "retry"])
      .select("*")
      .maybeSingle();

    if (claimed) {
      const claimedJob = claimed as AgentJobRow;

      await logJob(claimedJob, "info", "job_claimed", "Job capturado pelo worker.", {
        worker_id: workerId,
        attempt_count: claimed.attempt_count,
      });

      claimedJobs.push(claimedJob);
      claimedConversationIds.add(claimedJob.conversation_id);

      if (claimedJobs.length >= limit) {
        break;
      }
    }
  }

  return claimedJobs;
}

async function processJob(job: AgentJobRow) {
  const response = await fetch(AI_AGENT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workspace_id: job.workspace_id,
      conversation_id: job.conversation_id,
      message: job.latest_message || "",
      contact_name: job.contact_name || "",
      message_id: job.message_id || undefined,
      job_id: job.id,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error || `AI agent failed with status ${response.status}`);
  }

  return payload;
}

async function getNextQueuedJobTime(): Promise<string | null> {
  const { data } = await supabase
    .from("agent_jobs")
    .select("next_attempt_at")
    .in("status", ["pending", "retry"])
    .order("next_attempt_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as { next_attempt_at?: string | null } | null)?.next_attempt_at || null;
}

async function scheduleRetryFromWorker(job: AgentJobRow, error: unknown) {
  const delaySeconds = Math.min(300, 15 * Math.pow(2, Math.max(0, job.attempt_count - 1)));
  const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  const message = error instanceof Error ? error.message : "Worker invocation failed";

  await supabase
    .from("agent_jobs")
    .update({
      status: job.attempt_count >= job.max_attempts ? "failed" : "retry",
      locked_at: null,
      locked_by: null,
      next_attempt_at: job.attempt_count >= job.max_attempts ? null : nextAttemptAt,
      last_error: message,
      last_error_code: "worker_invocation_failed",
      last_error_details: { source: "process-agent-jobs" },
      completed_at: job.attempt_count >= job.max_attempts ? new Date().toISOString() : null,
    })
    .eq("id", job.id);

  await logJob(
    job,
    "error",
    job.attempt_count >= job.max_attempts ? "job_failed" : "worker_retry_scheduled",
    job.attempt_count >= job.max_attempts
      ? "Worker esgotou as tentativas para este job."
      : "Worker falhou ao invocar o agente; job reagendado.",
    { error: message, next_attempt_at: nextAttemptAt, attempt_count: job.attempt_count }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const workerId = crypto.randomUUID();
  let processed = 0;

  try {
    await reviveStaleJobs();

    const jobs = await claimReadyJobs(workerId, MAX_JOBS_PER_RUN);

    if (jobs.length > 0) {
      await Promise.all(jobs.map(async (job) => {
        try {
          await processJob(job);
        } catch (error) {
          console.error("process-agent-jobs error:", error);
          await scheduleRetryFromWorker(job, error);
        }
      }));

      processed = jobs.length;
    }

    const nextQueuedAt = await getNextQueuedJobTime();

    if (nextQueuedAt) {
      const delayMs = new Date(nextQueuedAt).getTime() - Date.now();

      if (delayMs <= 0) {
        scheduleWorkerRun(0, "drain_remaining_jobs");
      } else {
        scheduleWorkerRun(delayMs, "wait_for_next_attempt");
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, worker_id: workerId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-agent-jobs fatal error:", error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

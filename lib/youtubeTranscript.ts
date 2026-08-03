import { alertOncePerDay } from './systemAlerts';

const YOUTUBE_URL_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]+/i;

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_WAIT_MS = 35000;
const TIMEOUT_MESSAGE =
  "This video is taking longer to transcribe than expected — try a shorter video, or paste the transcript text directly.";

export function isYoutubeUrl(text: string): boolean {
  return YOUTUBE_URL_RE.test(text.trim());
}

// Supadata returns { error: "limit-exceeded", ... } once the shared monthly
// transcript quota runs out — every YouTube capture will fail until it resets
// or the plan is upgraded, so this is worth telling the owner about promptly.
async function notifyIfQuotaExceeded(body: any) {
  if (body?.error === 'limit-exceeded') {
    await alertOncePerDay(
      'supadata_quota_exceeded',
      'Afterword: Supadata YouTube transcript quota exceeded',
      "Your Supadata account has run out of transcript credits for this billing cycle. YouTube captures will fail for all users until it resets or you upgrade your Supadata plan."
    );
  }
}

// Song lyrics fed to "Extract ideas"/"Summarize"/"Quiz me" produce nonsense
// (there are no "ideas" in a chorus), and reproducing full lyrics verbatim is
// a real copyright risk unlike paraphrasing an article. So this checks with
// Claude (cheap, tiny response) before handing the transcript back, and fails
// open — a broken check should never block a legitimate capture.
async function checkNotSong(content: string): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  let isSong = false;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 20,
        system:
          'Classify whether the given text is song lyrics/music being performed, as opposed to spoken informational content (a talk, lecture, interview, review, tutorial, etc). Respond with ONLY a JSON object {"isSong": true} or {"isSong": false} — no other text.',
        messages: [{ role: 'user', content: content.slice(0, 4000) }],
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const raw = (data.content || []).map((b: any) => b.text || '').join('');
    isSong = /"isSong"\s*:\s*true/i.test(raw);
  } catch {
    return;
  }

  if (isSong) {
    throw new Error('This looks like a song — Afterword works best with content that has ideas to capture, like talks, lectures, or tutorials, not song lyrics.');
  }
}

async function extractContent(data: any): Promise<string> {
  const content = typeof data.content === 'string' ? data.content.trim() : '';
  if (!content) {
    throw new Error("This video doesn't have a transcript available.");
  }
  await checkNotSong(content);
  return content;
}

// Longer videos (Supadata docs: ~20+ min) don't transcribe in time to answer
// the initial request, so the API instead returns a jobId to poll. We poll
// api/v1/transcript/{jobId} until it's done or we run out of budget — kept
// under the request's own time budget (see maxDuration on the API routes).
async function pollTranscriptJob(jobId: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + POLL_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(`https://api.supadata.ai/v1/transcript/${jobId}`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      await notifyIfQuotaExceeded(body);
      throw new Error(`Could not check this video's transcript status (${res.status}).`);
    }

    const data = await res.json();
    if (data.status === 'completed') {
      return extractContent(data);
    }
    if (data.status === 'failed') {
      throw new Error(data.error || 'Could not transcribe this video.');
    }
    // status is "queued" or "active" — keep polling
  }

  throw new Error(TIMEOUT_MESSAGE);
}

// Fetches a YouTube video's transcript via Supadata (api.supadata.ai).
// Throws with a user-facing message on failure.
export async function fetchYoutubeTranscript(url: string): Promise<string> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    throw new Error('YouTube transcript fetching is not configured on this server.');
  }

  const res = await fetch(
    `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url.trim())}&text=true`,
    { headers: { 'x-api-key': apiKey } }
  );

  if (res.status === 202) {
    const body = await res.json().catch(() => null);
    const jobId = body?.jobId;
    if (!jobId) {
      throw new Error(TIMEOUT_MESSAGE);
    }
    return await pollTranscriptJob(jobId, apiKey);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    await notifyIfQuotaExceeded(body);
    throw new Error(body?.message || `Could not fetch this video's transcript (${res.status}).`);
  }

  const data = await res.json();
  return extractContent(data);
}

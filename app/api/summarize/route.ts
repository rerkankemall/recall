import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';
import { getOrCreateSubscription, isEntitled, checkWordLimit, recordWordUsage, checkYoutubeLimit, recordYoutubeUsage } from '@/lib/entitlement';
import { isYoutubeUrl, fetchYoutubeTranscript } from '@/lib/youtubeTranscript';

// Long YouTube videos can take a while to transcribe (see youtubeTranscript.ts's
// polling), so this needs more than the default 10s function timeout.
export const maxDuration = 60;

// This route (like /api/extract) is one of the only places ANTHROPIC_API_KEY
// is read — it runs server-side only, so the key never reaches the browser.
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const sub = await getOrCreateSubscription(user.id);
  if (!isEntitled(sub)) {
    return NextResponse.json({ error: 'Your trial has ended. Subscribe to keep summarizing.' }, { status: 403 });
  }

  const body = await req.json();
  const { title, type } = body;
  let content = body.content;
  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'No content provided' }, { status: 400 });
  }

  const isFromYoutube = isYoutubeUrl(content);
  if (isFromYoutube) {
    const youtubeLimitError = checkYoutubeLimit(sub);
    if (youtubeLimitError) {
      return NextResponse.json({ error: youtubeLimitError }, { status: 403 });
    }
    try {
      content = await fetchYoutubeTranscript(content);
      await recordYoutubeUsage(user.id, sub);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Could not fetch this video\'s transcript' }, { status: 502 });
    }
  }

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  const limitError = checkWordLimit(sub, wordCount);
  if (limitError) {
    if (isFromYoutube && sub.status === 'trialing') {
      return NextResponse.json(
        { error: "This video is too long for your trial's word budget. Try a shorter video (under ~30 minutes), or subscribe for unlimited use." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: limitError }, { status: 403 });
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system:
          'You write a concise summary of a piece of text the user read — 3-5 sentences, plain prose, no markdown, no bullet points, no preamble like "This text discusses...". Just the summary itself.',
        messages: [
          {
            role: 'user',
            content: `Title: ${title || '(untitled)'}\nType: ${type || 'Note'}\n\nText:\n${content}`,
          },
        ],
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      const msg = data?.error?.message || `Anthropic API error (${anthropicRes.status})`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const summary = (data.content || []).map((b: any) => b.text || '').join('\n').trim();
    if (!summary) {
      return NextResponse.json({ error: 'No summary generated' }, { status: 502 });
    }

    await recordWordUsage(user.id, sub, wordCount);

    return NextResponse.json({ summary });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Summarization failed' }, { status: 500 });
  }
}

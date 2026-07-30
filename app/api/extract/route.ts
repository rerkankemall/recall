import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabaseServer';
import { getOrCreateSubscription, isEntitled, TRIAL_WORD_LIMIT } from '@/lib/entitlement';

// This route is the ONLY place ANTHROPIC_API_KEY is ever read. It runs on
// the server, so the key never reaches the browser. The client (app/page.tsx)
// calls this route instead of calling Anthropic directly.
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const sub = await getOrCreateSubscription(user.id);
  if (!isEntitled(sub)) {
    return NextResponse.json({ error: 'Your trial has ended. Subscribe to keep capturing new ideas.' }, { status: 403 });
  }

  const { title, type, content } = await req.json();
  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'No content provided' }, { status: 400 });
  }

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  if (sub.status === 'trialing') {
    const remaining = TRIAL_WORD_LIMIT - sub.trial_words_used;
    if (wordCount > remaining) {
      return NextResponse.json(
        {
          error: `This would use ${wordCount} words, but you only have ${Math.max(0, remaining)} words left in your trial's ${TRIAL_WORD_LIMIT}-word limit. Subscribe for unlimited extraction.`,
        },
        { status: 403 }
      );
    }
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
        max_tokens: 1000,
        system:
          "You extract the key ideas worth remembering from a piece of text the user read, and suggest topic tags for it. Return ONLY a JSON object of the shape {\"ideas\": [...], \"tags\": [...]} — \"ideas\" is 3-6 short strings, each a single self-contained idea or fact, written so it stands alone (no 'the article says'); \"tags\" is 1-3 short lowercase single-or-two-word topic tags (e.g. \"productivity\", \"machine learning\") describing the subject matter, not the source type. No markdown, no preamble, no code fences — raw JSON object only.",
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

    const raw = (data.content || []).map((b: any) => b.text || '').join('\n');
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed: { ideas?: unknown; tags?: unknown };
    try {
      parsed = JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Model did not return a parseable response');
      parsed = JSON.parse(match[0]);
    }

    const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
    const tags = Array.isArray(parsed.tags) ? parsed.tags : [];

    if (ideas.length === 0) {
      return NextResponse.json({ error: 'No ideas extracted' }, { status: 502 });
    }

    if (sub.status === 'trialing') {
      await createAdminSupabase()
        .from('subscriptions')
        .update({ trial_words_used: sub.trial_words_used + wordCount })
        .eq('user_id', user.id);
    }

    return NextResponse.json({ ideas: ideas.map(String), tags: tags.map(String) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Extraction failed' }, { status: 500 });
  }
}

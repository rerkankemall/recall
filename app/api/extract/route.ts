import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';

// This route is the ONLY place ANTHROPIC_API_KEY is ever read. It runs on
// the server, so the key never reaches the browser. The client (app/page.tsx)
// calls this route instead of calling Anthropic directly.
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { title, type, content } = await req.json();
  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'No content provided' }, { status: 400 });
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
          "You extract the key ideas worth remembering from a piece of text the user read. Return ONLY a JSON array of 3-6 short strings, each a single self-contained idea or fact, written so it stands alone (no 'the article says'). No markdown, no preamble, no code fences — raw JSON array only.",
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

    let ideas: string[];
    try {
      ideas = JSON.parse(clean);
    } catch {
      const match = clean.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('Model did not return a parseable list');
      ideas = JSON.parse(match[0]);
    }

    if (!Array.isArray(ideas) || ideas.length === 0) {
      return NextResponse.json({ error: 'No ideas extracted' }, { status: 502 });
    }

    return NextResponse.json({ ideas: ideas.map(String) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Extraction failed' }, { status: 500 });
  }
}

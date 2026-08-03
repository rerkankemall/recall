import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';
import { getOrCreateSubscription, isEntitled, checkWordLimit, recordWordUsage, checkYoutubeLimit, recordYoutubeUsage } from '@/lib/entitlement';
import { isYoutubeUrl, fetchYoutubeTranscript } from '@/lib/youtubeTranscript';

// Long YouTube videos can take a while to transcribe (see youtubeTranscript.ts's
// polling), so this needs more than the default 10s function timeout.
export const maxDuration = 60;

type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

// This route (like /api/extract and /api/summarize) is one of the only places
// ANTHROPIC_API_KEY is read — it runs server-side only. Quizzes are generated
// fresh from whatever's pasted and never stored — no new tables needed.
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const sub = await getOrCreateSubscription(user.id);
  if (!isEntitled(sub)) {
    return NextResponse.json({ error: 'Your trial has ended. Subscribe to keep quizzing yourself.' }, { status: 403 });
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
        max_tokens: 2000,
        system: [
          'You write a multiple-choice quiz that genuinely tests whether someone understood a piece of text, not whether they can pattern-match its wording.',
          '',
          'Rules:',
          '- Ground every question strictly in the given text. Never invent facts, numbers, or claims that are not actually in it.',
          '- Never lift a sentence or phrase directly from the source into the question or the correct answer — paraphrase in different words so the question cannot be answered by string-matching against the original text.',
          '- Test understanding and application, not verbatim recall: ask why something happens, how two things relate, what a concept implies, or which scenario is an example of it — not just "what did the text call X."',
          '- Match the apparent rigor of the source itself: if it reads like casual notes, keep questions straightforward; if it reads like university-level material (dense technical or academic language, multi-step reasoning, domain terminology), write questions with comparable depth, similar to what an exam on that material might ask. Do not artificially inflate difficulty beyond what the source supports.',
          '- Each question has exactly 4 options and exactly one correct answer.',
          '- Wrong options must be plausible: same category as the right answer, or a common misconception/confusable concept — never random or obviously-wrong filler that gives away the answer by elimination.',
          '- Write 5 to 8 questions if the text supports that much genuine depth; write fewer rather than padding with filler or repetitive questions if the source is short or thin.',
          '',
          'Return ONLY a JSON object of the shape {"questions": [{"question": string, "options": [string, string, string, string], "answerIndex": number, "explanation": string}]} — "answerIndex" is the 0-based index of the correct option in "options"; "explanation" is one short sentence saying why that answer is correct, grounded in the text. No markdown, no preamble, no code fences — raw JSON object only.',
        ].join('\n'),
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

    let parsed: { questions?: unknown };
    try {
      parsed = JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Model did not return a parseable response');
      parsed = JSON.parse(match[0]);
    }

    const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const questions: QuizQuestion[] = rawQuestions
      .filter(
        (q: any) =>
          q &&
          typeof q.question === 'string' &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          Number.isInteger(q.answerIndex) &&
          q.answerIndex >= 0 &&
          q.answerIndex < 4
      )
      .map((q: any) => ({
        question: q.question,
        options: q.options.map(String),
        answerIndex: q.answerIndex,
        explanation: typeof q.explanation === 'string' ? q.explanation : '',
      }));

    if (questions.length === 0) {
      return NextResponse.json({ error: 'No quiz questions generated' }, { status: 502 });
    }

    await recordWordUsage(user.id, sub, wordCount);

    return NextResponse.json({ questions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Quiz generation failed' }, { status: 500 });
  }
}

import { Resend } from 'resend';

export function getResend() {
  return new Resend(process.env.RESEND_API_KEY!);
}

export function digestEmailHtml(ideas: { text: string }[], appUrl: string) {
  const items = ideas
    .slice(0, 10)
    .map((i) => `<li style="margin-bottom:8px;">${escapeHtml(i.text)}</li>`)
    .join('');
  const more = ideas.length > 10 ? `<p>...and ${ideas.length - 10} more.</p>` : '';

  return `
    <div style="font-family:sans-serif; max-width:480px; margin:0 auto;">
      <h2>You have ${ideas.length} idea${ideas.length === 1 ? '' : 's'} ready to review</h2>
      <ul>${items}</ul>
      ${more}
      <p><a href="${appUrl}" style="display:inline-block; padding:10px 18px; background:#e8a649; color:#14171c; text-decoration:none; border-radius:4px;">Review now</a></p>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

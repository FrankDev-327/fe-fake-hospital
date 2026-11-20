/**
 * Only allow redirects to our own pages. Without this, a link like
 * /login?redirect=https://evil.example would send the user to another site after login
 * (an "open redirect", handy for phishing).
 */
export function safeRedirect(target: string | undefined): string {
  if (
    !target ||
    !target.startsWith('/') ||
    target.startsWith('//') ||
    target.startsWith('/\\')
  )
    return '/';
  return target;
}

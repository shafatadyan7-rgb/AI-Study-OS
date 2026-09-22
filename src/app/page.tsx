import Link from 'next/link';
import { cookies } from 'next/headers';
import { resolveSession, SESSION_COOKIE } from '@/lib/auth/session';

const LOOP = ['Textbook', 'Understand', 'Learn', 'Practice', 'Master'];

/**
 * Public landing page. Unlike the earlier version, this never force-redirects
 * a signed-in visitor away — someone presenting at the carnival may want to
 * return here between demo runs. The primary CTA's destination adapts to
 * whether a session already exists, without hiding the page behind a redirect.
 */
export default async function LandingPage() {
  const jar = await cookies();
  const user = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  const enterHref = user ? '/dashboard' : '/login';

  return (
    <main className="landing">
      <div className="landing-bg" aria-hidden="true" />

      <section className="landing-hero">
        <div className="brand landing-brand">
          <span className="orb" aria-hidden="true" />
          <span className="brand-name">AI StudyOS</span>
        </div>

        <h1 className="landing-title">AI STUDYOS</h1>
        <p className="landing-tagline">Your Textbook. Your AI. Your Learning System.</p>
        <p className="landing-sub">
          Turn any textbook into a personalized AI-powered learning system.
        </p>

        <div className="landing-ctas">
          <Link href={enterHref} className="btn primary landing-cta">Enter AI StudyOS</Link>
          <Link href="/demo" className="btn landing-cta">Watch Demo</Link>
        </div>
      </section>

      <section className="landing-loop" aria-label="How AI StudyOS works">
        {LOOP.map((step, i) => (
          <div key={step} className="landing-loop-step">
            <div className="landing-loop-node">{step}</div>
            {i < LOOP.length - 1 && <div className="landing-loop-arrow" aria-hidden="true">→</div>}
          </div>
        ))}
      </section>

      <section className="landing-identity">
        <p>
          AI StudyOS doesn&apos;t replace the textbook.<br />
          It turns the textbook into a personal learning system.
        </p>
      </section>

      <div className="landing-carnival-cta">
        <Link href="/demo" className="btn primary landing-carnival-btn">START CARNIVAL DEMO</Link>
      </div>
    </main>
  );
}

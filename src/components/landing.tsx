import Link from 'next/link';
import { Brand } from './common';
import { Button } from './ui/button';
import { MealGallery } from './meal-gallery';
import styles from './landing.module.css';

/** Public product overview; the gallery contains examples, never household data. */
export function Landing() {
  return (
    <div className={styles.page}>
      <a className="auth-skip" href="#landing-main">
        Skip to content
      </a>
      <header className={styles.header}>
        <Brand />
      </header>
      <main id="landing-main" className={styles.main} tabIndex={-1}>
        <section className={styles.story} aria-labelledby="landing-title">
          <h1 id="landing-title" className={styles.headline} aria-label="Cook with what you have.">
            <span>Cook with</span>
            <span>what you have.</span>
          </h1>
          <p className={styles.intro}>
            <span>Keep track of your ingredients.</span>
            <span>Find meal ideas using what you have.</span>
          </p>
          <div className={styles.actions}>
            <Button asChild size="lg" className={styles.primaryAction}>
              <Link href="/login">Open your kitchen</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className={styles.secondaryAction}>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>
      </main>
      <MealGallery />
    </div>
  );
}

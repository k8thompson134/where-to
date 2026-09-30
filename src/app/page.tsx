import styles from './page.module.scss';
import WhereToApp from '@/components/WhereToApp';

export default function WhereTo() {
    return (
        <main className={styles.main}>
            {/* Plain anchor: "/" must leave this app's basePath and reach the portfolio root. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className={styles.backLink}>
                ← Back to Command Center
            </a>

            <h1 className={styles.title}>Where To?</h1>
            <p className={styles.description}>
                Optimize your itinerary. Find the best route for your errands.
            </p>

            <div className={styles.links}>
                <a href="https://github.com/k8thompson134/where-to" className={styles.githubLink} target="_blank" rel="noopener noreferrer">View Source on GitHub</a>
            </div>

            <div className={styles.appContainer}>
                <WhereToApp />
            </div>
        </main>
    );
}

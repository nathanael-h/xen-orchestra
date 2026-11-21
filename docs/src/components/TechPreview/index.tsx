import React from 'react'
import styles from './styles.module.css'

/**
 * Standard header note for features shipped as a technology preview
 * (for now: VMK and its Kubernetes components). One component so the
 * wording evolves, and disappears at launch, in one place.
 */
export default function TechPreview({ children }: { children?: React.ReactNode }): JSX.Element {
  return (
    <div className={styles.note} role='note'>
      <span className={styles.badge}>Technology preview</span>
      <div className={styles.body}>
        {children ?? (
          <>
            For lab and non-critical environments only, not for production. Technology previews are{' '}
            <strong>not covered by Vates support subscriptions</strong>, and their interface, API and behavior can
            change between builds.
          </>
        )}
      </div>
    </div>
  )
}

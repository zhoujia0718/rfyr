/**
 * E2E Test Helper: Console monitoring utilities
 *
 * Captures console errors, warnings, and React-specific messages
 * for detecting bugs, warnings, and runtime errors.
 */

import type { ConsoleMessage, Page } from '@playwright/test'

export interface ConsoleIssue {
  type: 'error' | 'warning' | 'warn' | 'log' | 'info'
  text: string
  location: { url: string; line: number }
  args?: string[]
}

/** Attach console listeners to a page and return collected messages */
export function captureConsoleMessages(page: Page) {
  const issues: ConsoleIssue[] = []

  const handler = (msg: ConsoleMessage) => {
    const loc = msg.location()
    issues.push({
      type: msg.type() as ConsoleIssue['type'],
      text: msg.text(),
      location: { url: loc.url, line: loc.lineNumber },
      args: [],
    })
  }

  page.on('console', handler)

  return {
    issues,
    cleanup: () => page.off('console', handler),

    /** Get only error-level issues */
    errors() {
      return issues.filter((i) => i.type === 'error')
    },

    /** Get only warning-level issues */
    warnings() {
      return issues.filter((i) => i.type === 'warning' || i.type === 'warn')
    },

    /** Get React-specific warnings */
    reactWarnings() {
      return issues.filter(
        (i) =>
          i.text.includes('Warning:') ||
          i.text.includes('React') ||
          i.text.includes('onOpenChange') ||
          i.text.includes('Unknown event') ||
          i.text.includes('onChange')
      )
    },

    /** Filter issues by text pattern */
    find(pattern: string | RegExp) {
      const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern
      return issues.filter((i) => re.test(i.text))
    },

    /** Print all issues to console for debugging */
    dump(label = 'Console Issues') {
      if (issues.length === 0) {
        console.log(`[${label}] No issues found.`)
        return
      }
      console.log(`[${label}] ${issues.length} issue(s):`)
      for (const issue of issues) {
        console.log(`  [${issue.type.toUpperCase()}] ${issue.text.substring(0, 200)}`)
        if (issue.location.url) {
          console.log(`    at ${issue.location.url}:${issue.location.line}`)
        }
      }
    },

    /** Assert no React/DOM warnings exist */
    async expectNoReactWarnings() {
      const warnings = this.reactWarnings()
      if (warnings.length > 0) {
        console.error('React warnings found:')
        for (const w of warnings) {
          console.error(`  ${w.text}`)
          if (w.location.url) {
            console.error(`    at ${w.location.url}:${w.location.line}`)
          }
        }
      }
      return warnings
    },
  }
}

/** Common React/DOM warning patterns to filter out (known non-critical) */
export const KNOWN_NON_CRITICAL_PATTERNS = [
  /Download the React DevTools/i,
  /HMR connected/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /SWR is using a stencil/,
]

/** Filter out known non-critical patterns from issues */
export function filterNonCritical(issues: ConsoleIssue[]): ConsoleIssue[] {
  return issues.filter((issue) => {
    for (const pattern of KNOWN_NON_CRITICAL_PATTERNS) {
      if (pattern.test(issue.text)) return false
    }
    return true
  })
}

/** Get all critical issues (errors + React warnings, excluding known non-critical) */
export function getCriticalIssues(issues: ConsoleIssue[]): ConsoleIssue[] {
  return filterNonCritical(
    issues.filter(
      (i) => i.type === 'error' || i.type === 'warning' || i.type === 'warn'
    )
  )
}

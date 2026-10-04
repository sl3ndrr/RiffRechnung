// Preserve the actual assertion even if a later test exhausts the CI job budget.
export default class BrowserFailures {
  onTestEnd(test, result) {
    if (result.status === 'failed' || result.status === 'timedOut') {
      console.error(`Browserfehler: ${test.titlePath().join(' > ')}`)
      for (const error of result.errors) console.error(error.stack || error.message)
    }
  }
}

import { config } from 'dotenv'

// Tests run against itqan_test, never the dev database. Loading this here (rather than
// relying on shell state) means a bare `pnpm test` cannot accidentally truncate dev data.
config({ path: '.env.test', override: true })

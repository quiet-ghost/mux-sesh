import { getConfigPath, getHomeDir, saveConfig } from '../config'
import { requestFatalShutdown } from '../lifecycle/shutdown'
import type { ProjectDiscovery } from '../projects/discovery-service'
import { PROJECT_DISCOVERY } from '../projects/project-items'
import { createItemFilter, type ItemFilter } from '../search'
import { OPEN_HISTORY, type OpenHistory } from '../search/frecency-store'
import { CLONE_SERVICES, type CloneServices } from '../sessions/clone-plan'
import type { Config } from '../config/config-model'
import type { UpdateEventListener } from '../update/update-event'
import { updateEvents } from '../update'
import type { AutoUpdateScheduler } from '../update/scheduler'
import { AUTO_UPDATE_SCHEDULER } from './app-hooks'
import { LAUNCHER_QUERY_SERVICES, type LauncherQueryServices } from './launcher-query'
import type { LiveThemeOptions } from './resolved-theme'
import { DEFAULT_STARTUP_DEPENDENCIES, type StartupDependencies } from './startup'

export interface UpdateEventSource {
  on(listener: UpdateEventListener): () => void
}

// Everything the controller reaches outside React: I/O, process-wide caches and crash reporting.
export interface AppServices {
  readonly startup: StartupDependencies
  readonly saveConfig: (config: Config) => Promise<void>
  readonly configPath: () => string
  readonly homeDir: () => string
  readonly clone: CloneServices
  readonly launcher: LauncherQueryServices
  readonly projects: ProjectDiscovery
  readonly openHistory: OpenHistory
  // Called once per mount, so typing refines that mount's previous Search result.
  readonly createSearchFilter: () => ItemFilter
  readonly theme: LiveThemeOptions
  readonly updates: UpdateEventSource
  readonly autoUpdate: AutoUpdateScheduler
  readonly onDefect: (cause: unknown) => void
}

export const APP_SERVICES: AppServices = {
  startup: DEFAULT_STARTUP_DEPENDENCIES,
  saveConfig,
  configPath: () => getConfigPath(),
  homeDir: getHomeDir,
  clone: CLONE_SERVICES,
  launcher: LAUNCHER_QUERY_SERVICES,
  projects: PROJECT_DISCOVERY,
  openHistory: OPEN_HISTORY,
  createSearchFilter: () => createItemFilter({ boost: item => OPEN_HISTORY.boost(item) }),
  theme: {},
  updates: updateEvents,
  autoUpdate: AUTO_UPDATE_SCHEDULER,
  onDefect: requestFatalShutdown,
}

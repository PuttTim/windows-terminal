import { Action, ActionPanel, Icon, List, showToast, Toast, getPreferenceValues } from "@raycast/api"
import { useCachedPromise } from "@raycast/utils"
import { readFileSync, existsSync } from "fs"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

// Cache for storing profiles
const profilesCache = new Map<string, WindowsTerminalProfile[]>();

interface WindowsTerminalProfile {
    name: string
    guid?: string
    source?: string
    hidden?: boolean
    commandline?: string
    icon?: string
}

interface WindowsTerminalSettings {
    profiles: {
        list: WindowsTerminalProfile[]
        defaults?: object
    }
}

interface Preferences {
    settingsPath: string
    sortOrder: string
    quakeMode: boolean
}

const preferences: Preferences = getPreferenceValues()
const username = process.env.USERNAME || "User"
const defaultSettingsPath = `C:\\Users\\${username}\\AppData\\Local\\Packages\\Microsoft.WindowsTerminal_8wekyb3d8bbwe\\LocalState\\settings.json`
const settingsPath = preferences.settingsPath || defaultSettingsPath
const quakeMode = preferences.quakeMode ? '-w "_quake"' : ''

async function loadProfiles(): Promise<WindowsTerminalProfile[]> {
    if (!existsSync(settingsPath)) {
        await showToast({
            style: Toast.Style.Failure,
            title: "Settings file not found",
            message: `Windows Terminal settings file not found at: ${settingsPath}`,
        })
        return []
    }

    try {
        const settingsContent = readFileSync(settingsPath, "utf8")
        const settings: WindowsTerminalSettings = JSON.parse(settingsContent)

        if (!settings.profiles || !settings.profiles.list) {
            await showToast({
                style: Toast.Style.Failure,
                title: "Invalid settings format",
                message: "Could not find profiles in Windows Terminal settings",
            })
            return []
        }

        // Check if we have cached profiles
        const cachedKey = `${settingsPath}-${preferences.sortOrder}`;
        const cached = profilesCache.get(cachedKey);
        
        if (cached) {
            return cached;
        }

        // only take profiles that has a name
        let availableProfiles = settings.profiles.list.filter(profile => profile.name)

        // Sort based on user preference
        if (preferences.sortOrder === "alphabetical") {
            availableProfiles = availableProfiles.sort((a, b) => a.name.localeCompare(b.name))
        }
        // If sortOrder is "settings", we can just maintain the original order
        
        // Cache the profiles
        profilesCache.set(cachedKey, availableProfiles);

        await showToast({
            style: Toast.Style.Success,
            title: "Profiles loaded",
            message: `Found ${availableProfiles.length} Windows Terminal profiles`,
        })

        return availableProfiles
    } catch (error) {
        await showToast({
            style: Toast.Style.Failure,
            title: "Error loading profiles",
            message: error instanceof Error ? error.message : "Unknown error occurred",
        })
        return []
    }
}

async function openProfile(profile: WindowsTerminalProfile) {
    try {
        let command: string
        const homeDir = process.env.USERPROFILE || process.env.HOME || "~"

        if (profile.guid) {
            // Use GUID (by right you can't have duplicate GUID or else WT will error)
            command = `start "" wt.exe ${quakeMode} -p "${profile.guid}" -d "${homeDir}"` 
        } else {
            // Fall back to profile name
            command = `start "" wt.exe ${quakeMode} -p "${profile.name}" -d "${homeDir}"`
        }

        await execAsync(command)

        await showToast({
            style: Toast.Style.Success,
            title: "Profile opened",
            message: `Opened ${profile.name}`,
        })
    } catch (error) {
        await showToast({
            style: Toast.Style.Failure,
            title: "Error opening profile",
            message: `Failed to open ${profile.name}`,
        })
    }
}

function getProfileIcon(profile: WindowsTerminalProfile): string {
    // Map common profile names to appropriate icons
    const profileName = profile.name.toLowerCase()

    if (profileName.includes("powershell")) {
        return "🟦"
    } else if (profileName.includes("cmd") || profileName.includes("command")) {
        return "💻"
    } else if (profileName.includes("ubuntu") || profileName.includes("linux")) {
        return "🐧"
    } else if (profileName.includes("git")) {
        return "🔗"
    } else if (profileName.includes("azure")) {
        return "☁️"
    } else if (profileName.includes("ssh")) {
        return "🔑"
    } else {
        return "⚡"
    }
}

export default function Command() {
    const { data: profiles, isLoading, revalidate } = useCachedPromise(loadProfiles)

    return (
        <List isLoading={isLoading} searchBarPlaceholder="Search Windows Terminal profiles...">
            {profiles?.map((profile: WindowsTerminalProfile) => (
                <List.Item
                    key={profile.guid || profile.name}
                    title={profile.name}
                    subtitle={
                        profile.commandline?.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b|ssh/i) ? undefined : profile.commandline
                    }
                    icon={getProfileIcon(profile)}
                    actions={
                        <ActionPanel>
                            <Action title="Open Profile" icon={Icon.Terminal} onAction={() => openProfile(profile)} />
                            <Action.ShowInFinder
                                title="Show Settings File"
                                path={settingsPath}
                                shortcut={{ modifiers: ["cmd"], key: "f" }}
                            />
                            <Action
                                title="Reload Profiles"
                                icon={Icon.ArrowClockwise}
                                onAction={revalidate}
                                shortcut={{ modifiers: ["cmd"], key: "r" }}
                            />
                        </ActionPanel>
                    }
                />
            ))}
            {!isLoading && (!profiles || profiles.length === 0) && (
                <List.EmptyView
                    title="No profiles found"
                    description="No Windows Terminal profiles were found. Check your settings file path in preferences."
                    actions={
                        <ActionPanel>
                            <Action title="Reload Profiles" icon={Icon.ArrowClockwise} onAction={revalidate} />
                        </ActionPanel>
                    }
                />
            )}
        </List>
    )
}

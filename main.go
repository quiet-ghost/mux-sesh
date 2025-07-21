package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	primaryColor    = lipgloss.Color("#f38ba8")
	activeColor     = lipgloss.Color("#a6e3a1")
	inactiveColor   = lipgloss.Color("#6c7086")
	textColor       = lipgloss.Color("#cdd6f4")
	borderColor     = lipgloss.Color("#89b4fa")
	backgroundColor = lipgloss.Color("#1e1e2e")

	keyColor       = lipgloss.Color("#f9e2af")
	actionColor    = lipgloss.Color("#cba6f7")
	separatorColor = lipgloss.Color("#585b70")

	titleStyle = lipgloss.NewStyle().
			Foreground(primaryColor).
			Bold(true).
			Align(lipgloss.Center).
			Width(50)

	sessionListStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(borderColor).
				Padding(1, 2).
				Width(50).
				Height(28)

	sessionListStyleFull = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(borderColor).
				Padding(1, 2).
				Width(110).
				Height(28)

	detailPanelStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(borderColor).
				Padding(1, 2).
				Width(60).
				Height(28)
	selectedSessionStyle = lipgloss.NewStyle().
				Foreground(textColor).
				Background(lipgloss.Color("#313244")).
				Bold(true)

	normalSessionStyle = lipgloss.NewStyle().
				Foreground(textColor)

	activeIndicatorStyle = lipgloss.NewStyle().
				Foreground(activeColor).
				Bold(true)

	inactiveIndicatorStyle = lipgloss.NewStyle().
				Foreground(inactiveColor)

	keybindStyle = lipgloss.NewStyle().
			Foreground(inactiveColor)

	keyStyle = lipgloss.NewStyle().
			Foreground(keyColor).
			Bold(true)

	actionStyle = lipgloss.NewStyle().
			Foreground(actionColor)

	separatorStyle = lipgloss.NewStyle().
			Foreground(separatorColor)

	detailHeaderStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Bold(true).
				Align(lipgloss.Center)

	detailTextStyle = lipgloss.NewStyle().
			Foreground(textColor)

	windowStyle = lipgloss.NewStyle().
			Foreground(textColor).
			MarginLeft(2)

	pathStyle = lipgloss.NewStyle().
			Foreground(inactiveColor)

	highlightStyle = lipgloss.NewStyle().
			Foreground(textColor).
			Bold(true)

	programStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#fab387"))

	fileTreeStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#94e2d5"))

	windowHeaderStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Bold(true).
				Align(lipgloss.Center)
)

type AppMode int

const (
	ModeNormal AppMode = iota
	ModeSearch
	ModeNewSession
	ModeRename
)

type ViewMode int

const (
	ViewSessions ViewMode = iota
	ViewProjects
)

type item struct {
	title       string
	desc        string
	path        string
	isSession   bool
	isAttached  bool
	windowCount string
}

type model struct {
	appMode      AppMode
	viewMode     ViewMode
	items        []item
	allItems     []item
	projectItems []item
	cursor       int
	searchInput  textinput.Model
	choice       string
	action       string
	quitting     bool
	width        int
	height       int
	message      string
	renameTarget string
	config       Config
}

func (m model) Init() tea.Cmd {
	return textinput.Blink
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tea.KeyMsg:
		switch m.appMode {
		case ModeNormal:
			return m.handleNormalMode(msg)
		case ModeSearch:
			return m.handleSearchMode(msg)
		case ModeNewSession:
			return m.handleNewSessionMode(msg)
		case ModeRename:
			return m.handleRenameMode(msg)
		}
	}

	return m, cmd
}

func (m model) handleNormalMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch keypress := msg.String(); keypress {
	case "ctrl+c", "q", "esc":
		m.quitting = true
		return m, tea.Quit

	case "i":
		m.appMode = ModeSearch
		m.searchInput.Focus()
		m.searchInput.SetValue("")
		return m, textinput.Blink

	case "n":
		m.appMode = ModeNewSession
		m.viewMode = ViewProjects
		m.allItems = m.projectItems
		m.items = m.allItems
		if len(m.items) > 0 {
			m.cursor = len(m.items) - 1
		} else {
			m.cursor = 0
		}
		m.searchInput.Focus()
		m.searchInput.SetValue("")
		m.searchInput.Placeholder = "Type project name, GitHub URL, or custom session name..."
		return m, textinput.Blink

	case "d":
		if m.viewMode == ViewSessions && len(m.items) > 0 && m.cursor < len(m.items) {
			selectedItem := m.items[m.cursor]
			if selectedItem.isSession {
				err := killTmuxSession(selectedItem.title)
				if err != nil {
					m.message = fmt.Sprintf("Error killing session: %v", err)
				} else {
					m.message = fmt.Sprintf("Session '%s' killed", selectedItem.title)
					m.refreshItems()
				}
			}
		}
		return m, nil

	case "r":
		if m.viewMode == ViewSessions && len(m.items) > 0 && m.cursor < len(m.items) {
			selectedItem := m.items[m.cursor]
			if selectedItem.isSession {
				m.appMode = ModeRename
				m.renameTarget = selectedItem.title
				m.searchInput.Focus()
				m.searchInput.SetValue(selectedItem.title)
				m.searchInput.Placeholder = "Enter new session name..."
				return m, textinput.Blink
			}
		}
		return m, nil

	case "R":
		m.refreshItems()
		m.message = "Refreshed"
		return m, nil

	case "s":
		m.viewMode = ViewSessions
		m.refreshItems()
		return m, nil

	case "p":
		m.viewMode = ViewProjects
		m.refreshItems()
		return m, nil

	case "enter":
		if len(m.items) > 0 && m.cursor < len(m.items) {
			selectedItem := m.items[m.cursor]
			m.choice = selectedItem.path
			if selectedItem.isSession {
				m.action = "switch"
			} else {
				m.action = "create"
			}
			return m, tea.Quit
		}

	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}

	case "down", "j":
		if m.cursor < len(m.items)-1 {
			m.cursor++
		}

	case "1", "2", "3", "4", "5", "6", "7", "8", "9":
		num, _ := strconv.Atoi(keypress)
		if num > 0 && num <= len(m.items) {
			selectedItem := m.items[num-1]
			m.choice = selectedItem.path
			if selectedItem.isSession {
				m.action = "switch"
			} else {
				m.action = "create"
			}
			return m, tea.Quit
		}
	}

	return m, nil
}

func (m model) handleSearchMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg.String() {
	case "esc", "ctrl+c":
		m.appMode = ModeNormal
		m.searchInput.Blur()
		m.items = m.allItems
		m.cursor = 0
		return m, nil

	case "enter":
		if len(m.items) > 0 {
			selectedItem := m.items[0]
			m.choice = selectedItem.path
			if selectedItem.isSession {
				m.action = "switch"
			} else {
				m.action = "create"
			}
			return m, tea.Quit
		}
		return m, nil

	case "down", "ctrl+j":
		if m.cursor < len(m.items)-1 {
			m.cursor++
		}
		return m, nil

	case "up", "ctrl+k":
		if m.cursor > 0 {
			m.cursor--
		}
		return m, nil
	}

	m.searchInput, cmd = m.searchInput.Update(msg)

	m.filterItems(m.searchInput.Value())

	return m, cmd
}

func (m model) handleNewSessionMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg.String() {
	case "esc", "ctrl+c":
		m.appMode = ModeNormal
		m.searchInput.Blur()
		m.viewMode = ViewSessions
		m.refreshItems()
		return m, nil

	case "enter":
		searchTerm := strings.TrimSpace(m.searchInput.Value())
		if searchTerm != "" {
			if isGitHubURL(searchTerm) {
				m.choice = searchTerm
				m.action = "clone_and_create"
				return m, tea.Quit
			} else if len(m.items) > 0 {
				if m.cursor < len(m.items) {
					selectedItem := m.items[m.cursor]
					m.choice = selectedItem.path
					m.action = "create"
				} else {
					selectedItem := m.items[0]
					m.choice = selectedItem.path
					m.action = "create"
				}
			} else {
				m.choice = searchTerm
				m.action = "create_named"
			}
			return m, tea.Quit
		}
		return m, nil

	case "down", "ctrl+j":
		if m.cursor < len(m.items)-1 {
			m.cursor++
		}
		return m, nil

	case "up", "ctrl+k":
		if m.cursor > 0 {
			m.cursor--
		}
		return m, nil
	}

	m.searchInput, cmd = m.searchInput.Update(msg)

	m.filterItems(m.searchInput.Value())

	return m, cmd
}

func (m model) handleRenameMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg.String() {
	case "esc", "ctrl+c":
		m.appMode = ModeNormal
		m.searchInput.Blur()
		m.renameTarget = ""
		return m, nil

	case "enter":
		newName := strings.TrimSpace(m.searchInput.Value())
		if newName != "" && newName != m.renameTarget {
			err := renameTmuxSession(m.renameTarget, newName)
			if err != nil {
				m.message = fmt.Sprintf("Error renaming session: %v", err)
			} else {
				m.message = fmt.Sprintf("Session renamed to '%s'", newName)
				m.refreshItems()
			}
		}
		m.appMode = ModeNormal
		m.searchInput.Blur()
		m.renameTarget = ""
		return m, nil
	}

	m.searchInput, cmd = m.searchInput.Update(msg)
	return m, cmd
}

type searchResult struct {
	item  item
	score int
}

func (m *model) filterItems(query string) {
	if query == "" {
		m.items = m.allItems
		m.cursor = 0
		return
	}

	query = strings.ToLower(query)
	var results []searchResult

	for _, item := range m.allItems {
		score := calculateSearchScore(item, query)
		if score > 0 {
			results = append(results, searchResult{item: item, score: score})
		}
	}

	if m.appMode == ModeNewSession {
		sort.Slice(results, func(i, j int) bool {
			return results[i].score < results[j].score
		})
	} else {
		sort.Slice(results, func(i, j int) bool {
			return results[i].score > results[j].score
		})
	}

	var filtered []item
	for _, result := range results {
		filtered = append(filtered, result.item)
	}

	m.items = filtered
	if m.appMode == ModeNewSession && len(filtered) > 0 {
		m.cursor = len(filtered) - 1
	} else {
		m.cursor = 0
	}
}

func calculateSearchScore(item item, query string) int {
	title := strings.ToLower(item.title)
	desc := strings.ToLower(item.desc)

	if !strings.Contains(title, query) && !strings.Contains(desc, query) {
		return 0
	}

	score := 0

	if title == query {
		score += 1000
	}

	if strings.HasPrefix(title, query) {
		score += 500
	}

	if strings.Contains(title, query) {
		score += 100
	}

	pathDepth := strings.Count(item.desc, "/")
	score += (10 - pathDepth) * 10

	if strings.Count(item.desc, "/") == 2 {
		score += 200
	}

	if strings.Contains(desc, query) {
		score += 50
	}

	return score
}

func (m *model) refreshItems() {
	if m.viewMode == ViewSessions {
		m.allItems = getSessionItems()
	} else {
		m.projectItems = getProjectItems(m.config)
		m.allItems = m.projectItems
	}
	m.items = m.allItems
	m.cursor = 0
}

func (m model) View() string {
	if m.choice != "" {
		return ""
	}
	if m.quitting {
		return ""
	}

	var title string
	var titleWidth int
	if m.appMode == ModeNewSession {
		titleWidth = 110
	} else {
		titleWidth = 50
	}

	titleStyleDynamic := titleStyle.Copy().Width(titleWidth)

	switch m.appMode {
	case ModeSearch:
		title = titleStyleDynamic.Render(" Search Sessions")
	case ModeNewSession:
		title = titleStyleDynamic.Render(" New Session")
	case ModeRename:
		title = titleStyleDynamic.Render(" Rename Session")
	default:
		title = titleStyleDynamic.Render(" Tmux Session Manager")
	}

	var itemLines []string
	itemCount := 0

	var searchLine string
	if m.appMode == ModeSearch {
		searchLine = keybindStyle.Render(" ") + m.searchInput.View()
	} else if m.appMode == ModeNewSession {
		searchLine = keybindStyle.Render("+ ") + m.searchInput.View()
	} else if m.appMode == ModeRename {
		searchLine = keybindStyle.Render(" ") + m.searchInput.View()
	}

	maxItems := len(m.items)
	if m.appMode == ModeSearch || m.appMode == ModeNewSession {
		maxItems = 15
	}

	displayedItems := m.items
	displayStart := 0

	if len(displayedItems) > maxItems {
		start := m.cursor - maxItems/2
		if start < 0 {
			start = 0
		}
		end := start + maxItems
		if end > len(m.items) {
			end = len(m.items)
			start = end - maxItems
			if start < 0 {
				start = 0
			}
		}
		displayedItems = m.items[start:end]
		displayStart = start
	}

	for i, item := range displayedItems {
		actualIndex := displayStart + i
		itemCount++

		var itemLine string
		if item.isSession {
			var indicator string
			if item.isAttached {
				indicator = activeIndicatorStyle.Render("●")
			} else {
				indicator = inactiveIndicatorStyle.Render("○")
			}
			itemLine = fmt.Sprintf("%d %s %s (%s)", actualIndex+1, indicator, item.title, item.windowCount)
		} else {
			if m.appMode == ModeNewSession {
				fullPath := item.desc
				if fullPath == "" {
					fullPath = item.path
				}
				if strings.HasPrefix(fullPath, os.Getenv("HOME")) {
					fullPath = strings.Replace(fullPath, os.Getenv("HOME"), "~", 1)
				}

				highlightedPath := highlightMatches(fullPath, m.searchInput.Value())
				itemLine = fmt.Sprintf("%d %s", actualIndex+1, highlightedPath)
			} else {
				itemLine = fmt.Sprintf("%d %s", actualIndex+1, item.title)
				if item.desc != "" {
					itemLine += fmt.Sprintf(" %s", pathStyle.Render(item.desc))
				}
			}
		}

		if actualIndex == m.cursor {
			itemLine = selectedSessionStyle.Render("▶ " + itemLine)
		} else {
			itemLine = normalSessionStyle.Render("  " + itemLine)
		}

		itemLines = append(itemLines, itemLine)
	}
	var statusLine string
	if m.appMode == ModeSearch || m.appMode == ModeNewSession {
		totalItems := len(m.items)
		if totalItems > maxItems {
			statusLine = keybindStyle.Render(fmt.Sprintf("  %d/%d", len(displayedItems), totalItems))
		} else if totalItems > 0 {
			statusLine = keybindStyle.Render(fmt.Sprintf("  %d", totalItems))
		}
	}

	if itemCount == 0 {
		if m.appMode == ModeNewSession {
			if m.searchInput.Value() != "" {
				if isGitHubURL(m.searchInput.Value()) {
					repoName := extractRepoName(m.searchInput.Value())
					if repoName != "" {
						itemLines = append(itemLines, selectedSessionStyle.Render(fmt.Sprintf("▶ Clone & create session: %s", repoName)))
					} else {
						itemLines = append(itemLines, selectedSessionStyle.Render("▶ Clone repository"))
					}
				} else {
					itemLines = append(itemLines, selectedSessionStyle.Render(fmt.Sprintf("▶ Create session: %s", m.searchInput.Value())))
				}
			} else {
				itemLines = append(itemLines, inactiveIndicatorStyle.Render("No projects found"))
			}
		} else if m.appMode == ModeSearch {
			if m.searchInput.Value() != "" {
				itemLines = append(itemLines, inactiveIndicatorStyle.Render("No matches found"))
			} else {
				itemLines = append(itemLines, inactiveIndicatorStyle.Render("Start typing to search..."))
			}
		} else {
			itemLines = append(itemLines, inactiveIndicatorStyle.Render("No tmux sessions found"))
			itemLines = append(itemLines, keybindStyle.Render("Press 'n' to create a new session"))
		}
	}

	var keybinds []string
	switch m.appMode {
	case ModeSearch, ModeNewSession, ModeRename:
		keybinds = []string{
			formatKeybind("⏎ Enter", "select"),
			formatKeybind("↑/↓", "navigate"),
			formatKeybind("Esc", "cancel"),
		}
	default:
		keybinds = []string{
			formatKeybind("⏎ Enter/1-9", "switch"),
			formatKeybind(" d", "kill"),
			formatKeybind(" r", "rename"),
			formatKeybind(" n", "new"),
			formatKeybind(" i", "search"),
			formatKeybind(" R", "refresh"),
			formatKeybind(" q", "quit"),
		}
	}

	leftContent := []string{title, ""}
	leftContent = append(leftContent, itemLines...)
	if statusLine != "" {
		leftContent = append(leftContent, statusLine)
	}
	leftContent = append(leftContent, "")
	leftContent = append(leftContent, keybinds...)
	if searchLine != "" {
		leftContent = append(leftContent, "", searchLine)
	}

	var leftPanel string
	if m.appMode == ModeNewSession {
		leftPanel = sessionListStyleFull.Render(strings.Join(leftContent, "\n"))
	} else {
		leftPanel = sessionListStyle.Render(strings.Join(leftContent, "\n"))
	}

	var content string
	if m.appMode == ModeNewSession {
		content = leftPanel
	} else {
		var rightPanel string
		if m.appMode == ModeNormal && len(m.items) > 0 && m.cursor < len(m.items) && m.items[m.cursor].isSession {
			selectedSession := m.items[m.cursor]
			rightPanel = buildSessionDetails(selectedSession.title)
		} else if m.appMode == ModeRename {
			rightPanel = detailPanelStyle.Render("Renaming session...\n\nEnter new name for session")
		} else if m.appMode == ModeSearch {
			rightPanel = detailPanelStyle.Render("Searching sessions...\n\nType to filter by name\n(showing max 15 results)")
		} else {
			rightPanel = detailPanelStyle.Render("No session selected")
		}

		content = lipgloss.JoinHorizontal(lipgloss.Top, leftPanel, rightPanel)
	}

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, content)
}

func isGitHubURL(input string) bool {
	input = strings.TrimSpace(input)
	return strings.HasPrefix(input, "https://github.com/") ||
		strings.HasPrefix(input, "git@github.com:")
}

func extractRepoName(url string) string {
	url = strings.TrimSpace(url)

	if strings.HasPrefix(url, "https://github.com/") {
		path := strings.TrimPrefix(url, "https://github.com/")
		path = strings.TrimSuffix(path, ".git")
		parts := strings.Split(path, "/")
		if len(parts) >= 2 {
			return parts[1]
		}
	} else if strings.HasPrefix(url, "git@github.com:") {
		path := strings.TrimPrefix(url, "git@github.com:")
		path = strings.TrimSuffix(path, ".git")
		parts := strings.Split(path, "/")
		if len(parts) >= 2 {
			return parts[1]
		}
	}

	return ""
}

func cloneGitHubRepo(url string, config Config) (string, error) {
	repoName := extractRepoName(url)
	if repoName == "" {
		return "", fmt.Errorf("could not extract repository name from URL")
	}

	reposDir := config.ReposPath
	if err := os.MkdirAll(reposDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create repos directory: %v", err)
	}

	targetDir := filepath.Join(reposDir, repoName)

	if _, err := os.Stat(targetDir); err == nil {
		return targetDir, nil
	}

	cmd := exec.Command("git", "clone", url, targetDir)
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to clone repository: %v", err)
	}

	return targetDir, nil
}

func buildSessionDetails(sessionName string) string {
	header := detailHeaderStyle.Render(" " + sessionName)

	statusCmd := exec.Command("tmux", "list-sessions", "-F", "#{session_name}:#{session_attached}:#{session_windows}", "-f", "#{==:#{session_name},"+sessionName+"}")
	statusOutput, err := statusCmd.Output()

	var status, windowCount string
	if err == nil && len(statusOutput) > 0 {
		parts := strings.Split(strings.TrimSpace(string(statusOutput)), ":")
		if len(parts) >= 3 {
			if parts[1] == "1" {
				status = activeIndicatorStyle.Render("⚡ Active")
			} else {
				status = inactiveIndicatorStyle.Render("○ Inactive")
			}
			windowCount = parts[2]
		}
	}

	statusLine := fmt.Sprintf("Status: %s", status)
	windowsLine := fmt.Sprintf("Windows: %s", windowCount)

	windowsCmd := exec.Command("tmux", "list-windows", "-t", sessionName, "-F", "#{window_index}: #{window_name}")
	windowsOutput, err := windowsCmd.Output()

	var windowDetails []string
	windowDetails = append(windowDetails, windowHeaderStyle.Render("⊞ Windows"))
	if err == nil && len(windowsOutput) > 0 {
		windows := strings.Split(strings.TrimSpace(string(windowsOutput)), "\n")
		for _, window := range windows {
			if window != "" {
				parts := strings.SplitN(window, ": ", 2)
				if len(parts) == 2 {
					windowNum := parts[0]
					windowName := parts[1]

					dirCmd := exec.Command("tmux", "display-message", "-t", sessionName+":"+windowNum, "-p", "#{pane_current_path}")
					dirOutput, dirErr := dirCmd.Output()

					cmdCmd := exec.Command("tmux", "display-message", "-t", sessionName+":"+windowNum, "-p", "#{pane_current_command}")
					cmdOutput, cmdErr := cmdCmd.Output()

					windowLine := fmt.Sprintf("%s: %s", windowNum, windowName)
					windowDetails = append(windowDetails, windowStyle.Render(windowLine))

					if cmdErr == nil {
						currentCmd := strings.TrimSpace(string(cmdOutput))
						if currentCmd != "" && currentCmd != "bash" && currentCmd != "zsh" && currentCmd != "fish" {
							windowDetails = append(windowDetails, windowStyle.Render("     "+programStyle.Render(currentCmd)))
						}
					}

					if dirErr == nil {
						currentDir := strings.TrimSpace(string(dirOutput))
						if strings.HasPrefix(currentDir, os.Getenv("HOME")) {
							currentDir = strings.Replace(currentDir, os.Getenv("HOME"), "~", 1)
						}
						windowDetails = append(windowDetails, windowStyle.Render("    \uea83 "+fileTreeStyle.Render(currentDir)))
					}
				}
			}
		}
	} else {
		windowDetails = append(windowDetails, windowStyle.Render("No windows found"))
	}

	content := []string{
		header,
		"",
		detailTextStyle.Render(statusLine),
		detailTextStyle.Render(windowsLine),
		"",
	}
	content = append(content, windowDetails...)

	return detailPanelStyle.Render(strings.Join(content, "\n"))
}

func getSessionItems() []item {
	var items []item

	cmd := exec.Command("tmux", "list-sessions", "-F", "#{session_name}:#{session_attached}:#{session_windows}")
	output, err := cmd.Output()
	if err != nil {
		return items
	}

	sessions := strings.Split(strings.TrimSpace(string(output)), "\n")

	for _, session := range sessions {
		if session == "" {
			continue
		}

		parts := strings.Split(session, ":")
		if len(parts) < 3 {
			continue
		}

		name := parts[0]
		attached := parts[1] == "1"
		windows := parts[2]

		items = append(items, item{
			title:       name,
			path:        name,
			isSession:   true,
			isAttached:  attached,
			windowCount: windows,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].title < items[j].title
	})

	return items
}

func getProjectItems(config Config) []item {
	var items []item

	var existingPaths []string
	for _, path := range config.ProjectPaths {
		if _, err := os.Stat(path); err == nil {
			existingPaths = append(existingPaths, path)
		}
	}

	if len(existingPaths) == 0 {
		return items
	}

	args := []string{}
	args = append(args, existingPaths...)
	args = append(args, "-mindepth", "1", "-maxdepth", "3", "-type", "d")

	cmd := exec.Command("find", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil && stdout.Len() == 0 {
		return items
	}

	output := stdout.Bytes()
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}

		baseName := filepath.Base(line)
		if strings.HasPrefix(baseName, ".") ||
			baseName == "node_modules" ||
			baseName == "target" ||
			baseName == "build" ||
			baseName == "dist" {
			continue
		}

		name := baseName
		desc := strings.Replace(line, os.Getenv("HOME"), "~", 1)

		items = append(items, item{
			title:     name,
			desc:      desc,
			path:      line,
			isSession: false,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].title < items[j].title
	})

	return items
}

func createTmuxSession(selectedPath string) error {
	if selectedPath == "" {
		return nil
	}

	selectedName := strings.ReplaceAll(filepath.Base(selectedPath), ".", "_")

	tmuxRunning := exec.Command("pgrep", "tmux")
	tmuxRunning.Run()
	tmuxIsRunning := tmuxRunning.ProcessState.Success()

	_, insideTmux := os.LookupEnv("TMUX")

	if !insideTmux && !tmuxIsRunning {
		cmd := exec.Command("tmux", "new-session", "-s", selectedName, "-c", selectedPath)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr

		go func() {
			time.Sleep(100 * time.Millisecond)
			exec.Command("tmux", "send-keys", "-t", selectedName, "nvim -c \"lua if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end\"", "Enter").Run()
		}()

		return cmd.Run()
	}

	checkSession := exec.Command("tmux", "has-session", "-t="+selectedName)
	err := checkSession.Run()
	if err != nil {
		createCmd := exec.Command("tmux", "new-session", "-d", "-s", selectedName, "-c", selectedPath)
		if err := createCmd.Run(); err != nil {
			return fmt.Errorf("failed to create session: %v", err)
		}

		nvimCmd := exec.Command("tmux", "send-keys", "-t", selectedName, "nvim -c \"lua if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end\"", "Enter")
		nvimCmd.Run()
	}

	switchCmd := exec.Command("tmux", "switch-client", "-t", selectedName)
	return switchCmd.Run()
}

func createNamedTmuxSession(sessionName string) error {
	if sessionName == "" {
		return nil
	}

	sessionName = strings.ReplaceAll(sessionName, ".", "_")
	sessionName = strings.ReplaceAll(sessionName, " ", "_")
	tmuxRunning := exec.Command("pgrep", "tmux")
	tmuxRunning.Run()
	tmuxIsRunning := tmuxRunning.ProcessState.Success()
	_, insideTmux := os.LookupEnv("TMUX")

	if !insideTmux && !tmuxIsRunning {
		cmd := exec.Command("tmux", "new-session", "-s", sessionName)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr

		go func() {
			time.Sleep(100 * time.Millisecond)
			exec.Command("tmux", "send-keys", "-t", sessionName, "nvim -c \"lua if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end\"", "Enter").Run()
		}()

		return cmd.Run()
	}

	checkSession := exec.Command("tmux", "has-session", "-t="+sessionName)
	err := checkSession.Run()
	if err != nil {
		createCmd := exec.Command("tmux", "new-session", "-d", "-s", sessionName)
		if err := createCmd.Run(); err != nil {
			return fmt.Errorf("failed to create session: %v", err)
		}
		nvimCmd := exec.Command("tmux", "send-keys", "-t", sessionName, "nvim -c \"lua if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end\"", "Enter")
		nvimCmd.Run()
	}
	switchCmd := exec.Command("tmux", "switch-client", "-t", sessionName)
	return switchCmd.Run()
}

func switchTmuxSession(sessionName string) error {
	if sessionName == "" {
		return nil
	}

	switchCmd := exec.Command("tmux", "switch-client", "-t", sessionName)
	return switchCmd.Run()
}

func killTmuxSession(sessionName string) error {
	if sessionName == "" {
		return nil
	}

	killCmd := exec.Command("tmux", "kill-session", "-t", sessionName)
	return killCmd.Run()
}

func renameTmuxSession(oldName, newName string) error {
	if oldName == "" || newName == "" {
		return fmt.Errorf("session names cannot be empty")
	}
	newName = strings.ReplaceAll(newName, ".", "_")
	newName = strings.ReplaceAll(newName, " ", "_")

	renameCmd := exec.Command("tmux", "rename-session", "-t", oldName, newName)
	return renameCmd.Run()
}

func highlightMatches(text, query string) string {
	if query == "" {
		return pathStyle.Render(text)
	}

	query = strings.ToLower(query)
	textLower := strings.ToLower(text)

	var result strings.Builder
	i := 0

	for i < len(text) {
		if i < len(textLower) && strings.HasPrefix(textLower[i:], query) {
			matchedPart := text[i : i+len(query)]
			result.WriteString(highlightStyle.Render(matchedPart))
			i += len(query)
		} else {
			result.WriteString(pathStyle.Render(string(text[i])))
			i++
		}
	}

	return result.String()
}

func formatKeybind(key, action string) string {
	return keyStyle.Render(key) + separatorStyle.Render(" │ ") + actionStyle.Render(action)
}

func main() {
	config := LoadConfig()

	ti := textinput.New()
	ti.Placeholder = "Type to search..."
	ti.CharLimit = 50
	ti.Width = 40

	m := model{
		appMode:      ModeNormal,
		viewMode:     ViewSessions,
		searchInput:  ti,
		config:       config,
		projectItems: getProjectItems(config),
	}

	sessionItems := getSessionItems()
	if len(sessionItems) > 0 {
		m.allItems = sessionItems
		m.items = sessionItems
	} else {
		m.viewMode = ViewProjects
		m.allItems = m.projectItems
		m.items = m.allItems
	}

	p := tea.NewProgram(m, tea.WithAltScreen())
	finalModel, err := p.Run()
	if err != nil {
		fmt.Printf("Error: %v", err)
		os.Exit(1)
	}

	if m, ok := finalModel.(model); ok && m.choice != "" {
		switch m.action {
		case "create":
			err := createTmuxSession(m.choice)
			if err != nil {
				fmt.Printf("Error creating tmux session: %v\n", err)
				os.Exit(1)
			}
		case "create_named":
			err := createNamedTmuxSession(m.choice)
			if err != nil {
				fmt.Printf("Error creating tmux session: %v\n", err)
				os.Exit(1)
			}
		case "clone_and_create":
			fmt.Printf("Cloning repository: %s\n", m.choice)
			clonedPath, err := cloneGitHubRepo(m.choice, m.config)
			if err != nil {
				fmt.Printf("Error cloning repository: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("Repository cloned to: %s\n", clonedPath)

			err = createTmuxSession(clonedPath)
			if err != nil {
				fmt.Printf("Error creating tmux session: %v\n", err)
				os.Exit(1)
			}
		case "switch":
			err := switchTmuxSession(m.choice)
			if err != nil {
				fmt.Printf("Error switching to tmux session: %v\n", err)
				os.Exit(1)
			}
		}
	}
}

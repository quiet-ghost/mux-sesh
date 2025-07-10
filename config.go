package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config holds user configuration
type Config struct {
	ProjectPaths []string `json:"project_paths"`
	ReposPath    string   `json:"repos_path"`
	Editor       string   `json:"editor"`
	EditorCmd    string   `json:"editor_cmd"`
}

// DefaultConfig returns the default configuration
func DefaultConfig() Config {
	homeDir := os.Getenv("HOME")
	return Config{
		ProjectPaths: []string{
			filepath.Join(homeDir, "dev"),
			filepath.Join(homeDir, "personal"),
		},
		ReposPath: filepath.Join(homeDir, "dev", "repos"),
		Editor:    "nvim",
		EditorCmd: "nvim -c \"lua if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end\"",
	}
}

// LoadConfig loads configuration from ~/.config/mux-sesh/config.json
func LoadConfig() Config {
	configDir := filepath.Join(os.Getenv("HOME"), ".config", "mux-sesh")
	configFile := filepath.Join(configDir, "config.json")

	// If config file doesn't exist, create it with defaults
	if _, err := os.Stat(configFile); os.IsNotExist(err) {
		config := DefaultConfig()
		SaveConfig(config)
		return config
	}

	// Read existing config
	data, err := os.ReadFile(configFile)
	if err != nil {
		return DefaultConfig()
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return DefaultConfig()
	}

	// Validate and set defaults for missing fields
	if len(config.ProjectPaths) == 0 {
		config.ProjectPaths = DefaultConfig().ProjectPaths
	}
	if config.ReposPath == "" {
		config.ReposPath = DefaultConfig().ReposPath
	}
	if config.Editor == "" {
		config.Editor = DefaultConfig().Editor
	}
	if config.EditorCmd == "" {
		config.EditorCmd = DefaultConfig().EditorCmd
	}

	return config
}

// SaveConfig saves configuration to ~/.config/mux-sesh/config.json
func SaveConfig(config Config) error {
	configDir := filepath.Join(os.Getenv("HOME"), ".config", "mux-sesh")
	configFile := filepath.Join(configDir, "config.json")

	// Create config directory if it doesn't exist
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}

	// Marshal config to JSON with indentation
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	// Write to file
	return os.WriteFile(configFile, data, 0644)
}

// GetConfigPath returns the path to the config file
func GetConfigPath() string {
	return filepath.Join(os.Getenv("HOME"), ".config", "mux-sesh", "config.json")
}

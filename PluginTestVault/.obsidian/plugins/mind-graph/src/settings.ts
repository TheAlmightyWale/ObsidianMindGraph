import { App, PluginSettingTab } from 'obsidian';
import MindGraphPlugin from './main';

export interface MindGraphSettings {
	// settings will be added here as features are built
}

export const DEFAULT_SETTINGS: MindGraphSettings = {};

export class MindGraphSettingTab extends PluginSettingTab {
	plugin: MindGraphPlugin;

	constructor(app: App, plugin: MindGraphPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
	}
}

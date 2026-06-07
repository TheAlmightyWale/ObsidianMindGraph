import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MindGraphSettings,
	MindGraphSettingTab,
} from './settings';

export default class MindGraphPlugin extends Plugin {
	settings!: MindGraphSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new MindGraphSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MindGraphSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

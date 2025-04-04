var obsidian = require('obsidian');

class RepeatEffortNotePlugin extends obsidian.Plugin {
	async onload() {
		this.app.workspace.on('file-open', async (file) => {
			if (!file || !file.path || file.path !== 'Atlas/Efforts.md') return;
			await this.runScript();
		});
	}

	async runScript() {
		const files = this.app.vault.getFiles();
		const mdFiles = files.filter(file => file.extension === 'md');

		for (const file of mdFiles) {
			let content = await this.app.vault.read(file);

			const note = new Note(file, content);
			if (!note.isValid()) continue;

			const processor = new NoteProcessor(note, this);
			await processor.process();
		}
	}
}

class Note {
	constructor(file, content) {
		this.file = file;
		this.content = content;

		this.repeatLine = NoteParser.getValidRepeatLine(content);
		this.goalLine = NoteParser.getValidGoalLine(content);
		this.tagsLine = NoteParser.getTagsLine(content);

		this.goalDate = NoteParser.convertGoalToDate(this.goalLine.value);
		this.currentDate = NoteParser.getCurrentDateAtMidnight();
	}

	isValid() {
		return this.repeatLine.value && this.goalLine.value && this.tagsLine;
	}
}

class NoteProcessor {
	constructor(note, plugin) {
		this.note = note;
		this.plugin = plugin;
	}

	async process() {
		if (this.shouldSkipProcessing()) return;

		this.updateTags();
		this.updateGoalAndRepeat(this.calculateNextGoalDate());

		await this.plugin.app.vault.modify(this.note.file, this.note.content);
	}

	shouldSkipProcessing() {
		const nextGoalDate = this.calculateNextGoalDate();
		const daysUntilNextGoal = NoteParser.getDateDifferenceInDays(this.note.currentDate, nextGoalDate);
		return daysUntilNextGoal > 4 && (!this.hasReachedOrPassedGoalDate() || this.note.currentDate < nextGoalDate);
	}

	calculateNextGoalDate() {
		if (this.hasReachedOrPassedGoalDate()) {
			return NoteParser.addPeriodToGoal(this.note.goalDate, { value: this.note.repeatLine.value, period: this.note.repeatLine.period });
		}
		return this.note.goalDate;
	}

	hasReachedOrPassedGoalDate() {
		return this.note.currentDate >= this.note.goalDate;
	}

	updateTags() {
		if (this.note.tagsLine[1].includes('#output')) {
			this.note.content = this.note.content.replace('#output', '#effort');
		} else if (!this.note.tagsLine[1].includes('#effort')) {
			this.note.content = this.note.content.replace(/tags::\s*/, `tags:: #effort `);
		}
	}

	updateGoalAndRepeat(updatedGoalDate) {
		const updatedGoalStr = `goal:: ${updatedGoalDate.getFullYear()}-${String(updatedGoalDate.getMonth() + 1).padStart(2, '0')}-${String(updatedGoalDate.getDate()).padStart(2, '0')}`;
		this.note.content = this.note.content
			.replace(this.note.goalLine.original, updatedGoalStr)
			.replace(this.note.repeatLine.original, `repeat:: ${this.note.repeatLine.value} ${this.note.repeatLine.period}`);
	}
}

class NoteParser {
	static getValidGoalLine(content) {
		const goalRegex = /goal::\s*(\S+)/;
		const match = content.match(goalRegex);

		if (!match) return { original: null, value: null };

		const goalValue = match[1];
		if (/^\d{4}-\d{2}-\d{2}$/.test(goalValue) || /^\d{4}-\d{2}-\d{1}$/.test(goalValue) || /^\d{4}-\d{1}-\d{1}$/.test(goalValue)) {
			return { original: match[0], value: goalValue };
		}

		const todayStr = NoteParser.getCurrentDateStr();
		return { original: match[0], value: todayStr };
	}

	static getCurrentDateStr() {
		const currentDate = this.getCurrentDateAtMidnight();
		return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
	}

	static getValidRepeatLine(content) {
		const repeatRegex = /repeat::\s*(\S+)(?:\s+(\S+))?(?=\s*#|$)/;
		const match = content.match(repeatRegex);

		if (!match) return { original: null, value: null, period: null };

		let repeatValue = parseInt(match[1]);
		let repeatPeriod = match[2] || 'day';

		if (isNaN(repeatValue)) repeatValue = 1;

		if (!["day", "days", "week", "weeks", "month", "months"].includes(repeatPeriod.toLowerCase())) {
			repeatPeriod = "day";
		}

		return {
			original: match[0],
			value: repeatValue,
			period: repeatPeriod
		};
	}

	static getTagsLine(content) {
		return content.match(/tags::\s*(.*)/);
	}

	static convertGoalToDate(goalStr) {
		try {
			const [year, month, day] = goalStr.split('-').map(Number);
			return this.getDateAtMidnight(year, month - 1, day);
		} catch {
			return this.getCurrentDateAtMidnight();
		}
	}

	static getCurrentDateAtMidnight() {
		const now = new Date();
		return this.getDateAtMidnight(now.getFullYear(), now.getMonth(), now.getDate());
	}

	static getDateAtMidnight(year, month, day) {
		return new Date(year, month, day, 0, 0, 0, 0);
	}

	static getDateDifferenceInDays(date1, date2) {
		return Math.floor(Math.abs(date1 - date2) / (1000 * 3600 * 24));
	}

	static addPeriodToGoal(goalDate, repeatPeriod) {
		let updatedDate = new Date(goalDate);
		let repeatValue = (typeof repeatPeriod.value === "number" && !isNaN(repeatPeriod.value)) ? repeatPeriod.value : 1;

		switch (repeatPeriod.period) {
			case "day":
			case "days":
				updatedDate.setDate(updatedDate.getDate() + repeatValue);
				break;
			case "week":
			case "weeks":
				updatedDate.setDate(updatedDate.getDate() + (repeatValue * 7));
				break;
			case "month":
			case "months":
				updatedDate.setMonth(updatedDate.getMonth() + repeatValue);
				break;
		}

		return this.getDateAtMidnight(updatedDate.getFullYear(), updatedDate.getMonth(), updatedDate.getDate());
	}
}

module.exports = RepeatEffortNotePlugin;

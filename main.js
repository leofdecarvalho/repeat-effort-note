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


		const { frontmatter, frontmatterBlock } = NoteParser.extractFrontmatter(content);

        this.frontmatter = frontmatter;
        this.frontmatterBlock = frontmatterBlock;

        this.repeatLine = NoteParser.getValidRepeatLineFromFrontmatter(frontmatter);
        this.goalLine = NoteParser.getValidGoalLineFromFrontmatter(frontmatter);

        this.goalDate = NoteParser.convertGoalToDate(this.goalLine.value);
        this.currentDate = NoteParser.getCurrentDateAtMidnight();
    }

    isValid() {
        return this.repeatLine.value && this.goalLine.value && this.frontmatter.tags;
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
        const newContent = NoteParser.replaceFrontmatter(this.note.content, this.note.frontmatter);
      	await this.saveFileContent(this.note.file, newContent);
    }

	async saveFileContent(file, content) {
		await this.plugin.app.vault.modify(file, content);
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
        const tags = this.note.frontmatter.tags || [];
        if (tags.includes('output')) {
            this.note.frontmatter.tags = tags.filter(tag => tag !== 'output').concat('effort');
        } else if (!tags.includes('effort')) {
            this.note.frontmatter.tags = tags.concat('effort');
        }
    }

    updateGoalAndRepeat(updatedGoalDate) {
        this.note.frontmatter.goal = `${updatedGoalDate.getFullYear()}-${String(updatedGoalDate.getMonth() + 1).padStart(2, '0')}-${String(updatedGoalDate.getDate()).padStart(2, '0')}`;
        this.note.frontmatter.repeat = `${this.note.repeatLine.value} ${this.note.repeatLine.period}`;
    }
}

class NoteParser {
    static extractFrontmatter(content) {
        const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
        const match = content.match(frontmatterRegex);

        if (!match) {
			return { frontmatter:{}, frontmatterBlock: {}};
		}

        try {
            const frontmatter = this.parseYaml(match[1]);
            return { frontmatter, frontmatterBlock: match[0] };
        } catch (error) {
            throw new Error("Error: Failed to parse frontmatter. Ensure the YAML syntax is correct.");
        }
    }

    static getValidGoalLineFromFrontmatter(frontmatter) {
        return { original: `goal: ${frontmatter.goal}`, value: frontmatter.goal };
    }

    static getValidRepeatLineFromFrontmatter(frontmatter) {
        if (!frontmatter.repeat) return { original: null, value: null, period: null };

        const [value, period = "day"] = frontmatter.repeat.split(" ");
        let repeatValue = parseInt(value);
        let repeatPeriod = period.toLowerCase();

        if (isNaN(repeatValue)) repeatValue = 1;
        if (!["day", "days", "week", "weeks", "month", "months"].includes(repeatPeriod)) {
            repeatPeriod = "day";
        }

        return {
            original: `repeat: ${frontmatter.repeat}`,
            value: repeatValue,
            period: repeatPeriod,
        };
    }

    static parseYaml(yamlString) {
        const lines = yamlString.split("\n");
        const result = {};
        let currentKey = null;

        for (const line of lines) {
            if (line.startsWith("  - ")) {
                if (!currentKey || !Array.isArray(result[currentKey])) {
                    throw new Error("Error: Invalid YAML array structure. Ensure array items are properly indented with '  - '.");
                }
                result[currentKey].push(line.replace("  - ", "").trim());
                continue;
            }

            if (!line.includes(":")) continue;

            const [key, value] = line.split(":").map(part => part.trim());
            currentKey = key;
            result[key] = value === "" ? [] : value;
        }

        return result;
    }

	static replaceFrontmatter(content, updatedFrontmatter) {
		const frontmatterLines = Object.entries(updatedFrontmatter)
		  .map(([key, value]) => {
			if (Array.isArray(value)) {
			  return `${key}:\n${value.map(item => `  - ${item}`).join("\n")}`;
			}
			return `${key}: ${value}`;
		  })
		  .join("\n");
	
		const updatedFrontmatterBlock = `---\n${frontmatterLines}\n---`;
		const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
		return content.replace(frontmatterRegex, updatedFrontmatterBlock);
	  }

    static getCurrentDateStr() {
        const currentDate = this.getCurrentDateAtMidnight();
        return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
    }

    static convertGoalToDate(goalStr) {
		try {
			const [year, month, day] = goalStr.split('-').map(Number);
			return this.getDateAtMidnight(year, month - 1, day);
		} catch {
			const currentDate = new Date();
			return this.getDateAtMidnight(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
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

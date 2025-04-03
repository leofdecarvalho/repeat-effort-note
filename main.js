var obsidian = require('obsidian');

class RepeatEffortNotePlugin extends obsidian.Plugin {
  async onload() {
    this.app.workspace.on('file-open', async (file) => {
      if (file && file.path && file.path === 'Atlas/Efforts.md') {
        await this.runScript();
      }
    });
  }

  async runScript() {
    const files = this.app.vault.getFiles();
    const mdFiles = files.filter(file => file.extension === 'md');

    for (const file of mdFiles) {
      let content = await this.app.vault.read(file);

      let repeatLine = this.getValidRepeatLine(content);
      let goalLine = this.getValidGoalLine(content);
      const tagsLine = content.match(/tags::\s*(.*)/);


      if (repeatLine.value && goalLine.value && tagsLine) {
        const repeatValue = repeatLine.value;
        const repeatPeriod = repeatLine.period;
        let goalDate = this.convertGoalToDate(goalLine.value);
        const currentDate = this.getCurrentDateAtMidnight();

        if (currentDate >= goalDate) {
          const updatedGoalDate = this.addPeriodToGoal(goalDate, { value: repeatValue, period: repeatPeriod });
          const diffInDays = this.getDateDifferenceInDays(currentDate, updatedGoalDate);

          if (diffInDays <= 2) {
            if (tagsLine[1].includes('#output')) {
              content = content.replace('#output', '#effort');
            } else if (!tagsLine[1].includes('#effort')) {
              content = content.replace(/tags::\s*/, `tags:: #effort `);
            }

            const updatedGoalStr = `goal:: ${updatedGoalDate.getFullYear()}-${String(updatedGoalDate.getMonth() + 1).padStart(2, '0')}-${String(updatedGoalDate.getDate()).padStart(2, '0')}`;
			content = content.replace(goalLine.original, updatedGoalStr);
			content = content.replace(repeatLine.original, `repeat:: ${repeatLine.value} ${repeatLine.period}`);
            await this.app.vault.modify(file, content);
          }
        }
      }
    }
  }

	getValidGoalLine(content) {
		const goalRegex = /goal::\s*(\S+)/;
		const match = content.match(goalRegex);

		if (!match) {
			return { original: null, value:null};
		}
		
		const goalValue = match[1];
		if (/^\d{4}-\d{2}-\d{2}$/.test(goalValue)) {
			return { original: match[0], value: goalValue};
		}
		
		const todayStr = this.getCurrentDateStr();
		return { original: match[0], value: todayStr};

	}

	getValidRepeatLine(content) {
		const repeatRegex = /repeat::\s*(\S+)(?:\s+(\S+))?/;
		const match = content.match(repeatRegex);

		if (!match) {
			return { original: null, value: 1, period: "day"};
		}

		let repeatValue = parseInt(match[1]);
		let repeatPeriod = 'day';
		try {
			if (match[2]){
				repeatPeriod = match[2];
			}
		} catch {
			repeatPeriod = 'day';
		}

		if (isNaN(repeatValue)) {
			repeatValue = 1; // Se "x" não for número, assume 1
		}

		if (!["day", "days", "week", "weeks", "month", "months"].includes(repeatPeriod.toLowerCase())) {
			repeatPeriod = "day"; // Se "period" for inválido, assume "day"
		}

		return { 
			original: match[0], 
			value: repeatValue, 
			period: repeatPeriod
		};
	}

  convertGoalToDate(goalStr) {
    try {
      const [year, month, day] = goalStr.split('-').map(Number);
      return this.getDateAtMidnight(year, month - 1, day);
    } catch {
      return this.getCurrentDateAtMidnight();
    }
  }

  getDateDifferenceInDays(date1, date2) {
    return Math.floor(Math.abs(date1 - date2) / (1000 * 3600 * 24));
  }

  addPeriodToGoal(goalDate, repeatPeriod) {
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

  getCurrentDateStr() {
    const currentDate = this.getCurrentDateAtMidnight();
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
  }

  getCurrentDateAtMidnight() {
    const now = new Date();
    return this.getDateAtMidnight(now.getFullYear(), now.getMonth(), now.getDate());
  }

  getDateAtMidnight(year, month, day) {
    return new Date(year, month, day, 0, 0, 0, 0);
  }
}

module.exports = RepeatEffortNotePlugin;

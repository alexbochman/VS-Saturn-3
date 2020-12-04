//extension.js
const vscode = require('vscode');
const pomodoro = require('./pomodoro');
const commands = require('./commands');

const pomodoroTimer = new pomodoro.PomodoroTimer();

function activate(context) {
	let startTimer = vscode.commands.registerCommand(commands.START_TIMER_CMD, () => {
		pomodoroTimer.start();
	});
	let pauseTimer = vscode.commands.registerCommand(commands.PAUSE_TIMER_CMD, () => {
		pomodoroTimer.pause();
	});
	let resetTimer = vscode.commands.registerCommand(commands.RESET_TIMER_CMD, () => {
		pomodoroTimer.reset();
	});
	let snoozeBreak = vscode.commands.registerCommand(commands.SNOOZE_BREAK_CMD, () => {
		pomodoroTimer.snoozeBreak();
	});
	let skipBreak = vscode.commands.registerCommand(commands.SKIP_BREAK_CMD, () => {
		pomodoroTimer.skipBreak();
	});

	let taskBar = vscode.commands.registerCommand(commands.TASKS_CMD, () => {
		pomodoroTimer.taskBar();
	});

	let collapsible = vscode.commands.registerCommand(commands.COLLAPSIBLE_CMD, () => {
		pomodoroTimer.collapsible();
	});

	let options = vscode.commands.registerCommand(commands.OPTIONS_CMD, () => {
		pomodoroTimer.options();
	});

	context.subscriptions.push([startTimer, pauseTimer, resetTimer, skipBreak, snoozeBreak, taskBar, collapsible, options]);
}
exports.activate = activate;

function deactivate() {
	pomodoroTimer.dispose();
}

exports.deactivate = deactivate;
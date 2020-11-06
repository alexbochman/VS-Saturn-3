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

	context.subscriptions.push([startTimer, pauseTimer, resetTimer, skipBreak, snoozeBreak]);
}
exports.activate = activate;

function deactivate() {
	pomodoroTimer.dispose();
}

exports.deactivate = deactivate;
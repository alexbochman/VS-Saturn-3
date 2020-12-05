
// Required         =======================================================================================
const vscode = require('vscode');
const commands = require('./commands');
const { workspace, ConfigurationTarget } = require('vscode')

// Global Variables =======================================================================================
const MILLISECONDS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
const DEFAULT_SNOOZE_DURATION = 5 * 60000;          // Number of minutes * one minute in milliseconds
var DEFAULT_TIMER_DURATION = 25 * 60000;            // Number of minutes * one minute in milliseconds | set to 3 seconds (in package.json) until version 1.0.0 release for testing
var DEFAULT_BREAK_DURATION = 5 * 60000;             // Number of minutes * one minute in milliseconds
var DEFAULT_LONG_BREAK_DURATION = 30 * 60000;       // Number of minutes * one minute in milliseconds
var userTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
let breaking = false;
let collapsed = true;

var selection = "";
let userInput = "input test"; // Input capture inside taskBar function
let taskOptions = ["View Tasks", "Add Task", "Remove Task", "Completed Tasks", "Close Menu"];
let taskList = ["[BACK]"];
let completedList = ["[BACK]"];
let optionList = ["Set Short Break Time Duration", "Set Long Break Time Duration", "Set Pomodoro Time Duration", "Close Menu"];
let shortBreakOpt = ["[BACK]", "0.05 Minutes", "3 Minutes", "5 Minutes", "10 Minutes"];
let longBreakOpt = ["[BACK]", "0.05 Minutes", "25 Minutes", "30 Minutes", "45 Minutes", "1 Hour"];
let pomoTimeOpt = ["[BACK]", "0.05 Minutes", "20 Minutes", "25 Minutes", "30 Minutes", "40 Minutes"];

var TimerState = {
    UNKNOWN: 0,
    READY: 1,
    RUNNING: 2,
    PAUSED: 3,
    FINISHED: 4,
    DISPOSED: 5
}

exports.TimerState = TimerState;

const STARTABLE_STATES = new Set([TimerState.FINISHED, TimerState.READY, TimerState.PAUSED]);
exports.STARTABLE_STATES = STARTABLE_STATES;

const STOPPABLE_STATES = new Set([TimerState.RUNNING, TimerState.PAUSED]);
exports.STOPPABLE_STATES = STOPPABLE_STATES;

const PAUSEABLE_STATES = new Set([TimerState.RUNNING]);
exports.PAUSEABLE_STATES = PAUSEABLE_STATES;

const ALL_STATES = new Set([TimerState.UNKNOWN, TimerState.READY, TimerState.RUNNING, TimerState.PAUSED, TimerState.FINISHED, TimerState.DISPOSED]);
exports.ALL_STATES = ALL_STATES;

function stateToString(state) {
    switch (state) {
        case TimerState.UNKNOWN:    return "unknown";
        case TimerState.READY:      return "Ready";
        case TimerState.RUNNING:    return "Running";
        case TimerState.PAUSED:     return "Paused";
        case TimerState.FINISHED:   return "Finished";
        case TimerState.DISPOSED:   return "disposed";
        default:                    return "unknown";
    }
}

function millisecondsToMMSS(milliseconds) {
    let totalSeconds = Math.round(milliseconds / MILLISECONDS_IN_SECOND);
    let minutes = Math.floor(totalSeconds / SECONDS_IN_MINUTE);
    let seconds = Math.floor(totalSeconds - (minutes * SECONDS_IN_MINUTE));

    if (minutes < 10) { minutes = "0" + minutes; }
    if (seconds < 10) { seconds = "0" + seconds; }

    return minutes + ':' + seconds;
}

class PomodoroTimer {

    constructor(interval = DEFAULT_TIMER_DURATION) {

        this.interval = DEFAULT_TIMER_DURATION;
        this.millisecondsRemaining = this.interval;
        this.timeout = 0;
        this.endDate = new Date();
        this.secondInterval = 0;
        this.state = TimerState.READY;
        this.amountBreaks = 0;

        // On VSCode startup, collapsibleButton is the only item visible. Button toggles all other item's visibility
        this.collapsibleButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.collapsibleButton.show();

        this.startPauseButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.startPauseButton.hide();

        this.resetButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.resetButton.hide();

        this.timerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.timerItem.hide();

        this.breakItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.breakItem.hide();

        this.taskItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.taskItem.hide();

        this.optionsButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.optionsButton.hide();

        this.updateStatusBar();
        this.breakItem.text = "3 short breaks left";
    }

    updateStatusBar() {

        this.collapsibleButton.text = "[Pomodoro]";
        this.collapsibleButton.command = commands.COLLAPSIBLE_CMD;

        this.optionsButton.text = "$(settings-gear)" + " Options";
        this.optionsButton.command = commands.OPTIONS_CMD;

        this.taskItem.text = "$(list-unordered)" +  " Tasks";
        this.taskItem.command = commands.TASKS_CMD;

        // If timer is not on break
        if (breaking == false) {
            const icon = TimerState.RUNNING === this.state ? "$(debug-pause)" + "pause" : "$(triangle-right)" + "start";
            this.startPauseButton.text = icon;
            this.startPauseButton.command = TimerState.RUNNING === this.state ? commands.PAUSE_TIMER_CMD : commands.START_TIMER_CMD;
            this.resetButton.text = "$(clock)" + " Reset";
            this.resetButton.command = commands.RESET_TIMER_CMD;
            this.timerItem.text = millisecondsToMMSS(this.millisecondsRemaining) + " (" + stateToString(this.state) + ")";
        // otherwise, timer is on break
        } else {
            this.startPauseButton.text = "$(watch)" + "snooze";
            this.startPauseButton.command = commands.SNOOZE_BREAK_CMD;
            this.resetButton.text = this.resetButton.text = "$(run-all)" + "Skip";
            this.resetButton.command = commands.SKIP_BREAK_CMD;
            this.timerItem.text = millisecondsToMMSS(this.millisecondsRemaining) + " (Taking a break)";
        }
    }

    //command setting is done in the updateStatusBar function, no need to bring a command into this.
    setState(state) {
        this.state = state;
        this.updateStatusBar();
    }

    isStartable() { return STARTABLE_STATES.has(this.state); }
    isPauseable() { return PAUSEABLE_STATES.has(this.state); }
    isStoppable() { return STOPPABLE_STATES.has(this.state); }

    // starts/resumes the timer but does not reset it
    start() {
        if (!this.isStartable()) { return false; }

        if(vscode.workspace.getConfiguration('workbench').get('colorTheme') != userTheme) {
            userTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
        }

        let onTimeout = () => {
            this.reset();
            breaking = true;

            //when the break duration is set you need to multiply the default second size and default millisecond size.
            if (this.amountBreaks == 3){
                var temp = vscode.workspace.getConfiguration("pomodoro").get("long_break_interval", DEFAULT_LONG_BREAK_DURATION);
                this.millisecondsRemaining = temp != DEFAULT_LONG_BREAK_DURATION ? temp * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND : temp;
            } else {
                temp = vscode.workspace.getConfiguration("pomodoro").get("short_break_interval", DEFAULT_LONG_BREAK_DURATION);
                this.millisecondsRemaining = temp != DEFAULT_BREAK_DURATION ? temp * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND : temp;
            }
            this.startBreak();
        };

        let onSecondElapsed = () => {
            this.millisecondsRemaining -= MILLISECONDS_IN_SECOND;
            this.updateStatusBar();
        };

        this.endDate = new Date(Date.now().valueOf() + this.millisecondsRemaining);
        this.timeout = setTimeout(onTimeout, this.millisecondsRemaining);
        this.secondInterval = setInterval(onSecondElapsed, MILLISECONDS_IN_SECOND);
        this.setState(TimerState.RUNNING);

        return true;
    }

    startBreak() {
        if (!this.isStartable())
            return false;

        if(this.amountBreaks < 3)
            this.breakItem.text = "on a short break";
        else
            this.breakItem.text = "on a long break";

        userTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
        var themeValue = vscode.window.activeColorTheme.kind;
        if (themeValue == 2 || themeValue == 3)
            vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Light+', true)
        else
            vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Dark+', true)


        let onTimeout = () => {
            vscode.workspace.getConfiguration('workbench').update('colorTheme', userTheme, true);

            if(this.amountBreaks < 3){
                this.amountBreaks++;
                if(this.amountBreaks < 3){
                    this.breakItem.text = (3 - this.amountBreaks) + " short breaks left";
                } else {
                    this.breakItem.text = "next break is a long break";
                }
            } else {
                this.amountBreaks = 0;
                this.breakItem.text = (3 - this.amountBreaks) + " short breaks left";
            }
            this.reset();
            breaking = false;
            this.setState(TimerState.READY);
        };

        let onSecondElapsed = () => {
            this.millisecondsRemaining -= MILLISECONDS_IN_SECOND;
            this.updateStatusBar();
        };

        this.endDate = new Date(Date.now().valueOf() + this.millisecondsRemaining);
        this.timeout = setTimeout(onTimeout, this.millisecondsRemaining);
        this.secondInterval = setInterval(onSecondElapsed, MILLISECONDS_IN_SECOND);
        this.setState(TimerState.RUNNING);

        return true;
    }

    // pauses the timer but does not reset it
    pause() {
        if (!this.isPauseable()) { return false; }

        clearTimeout(this.timeout);
        clearInterval(this.secondInterval);
        this.setState(TimerState.PAUSED);

        return true;
    }

    // stops the timer completely
    stop() {
        if (!this.isStoppable()) { return false; }

        clearTimeout(this.timeout);
        clearInterval(this.secondInterval);

        this.timeout = 0;
        this.secondInterval = 0;
        this.millisecondsRemaining = 0;
        this.setState(TimerState.FINISHED);

        return true;
    }

    // stops and resets the timer but does not start it
    reset() {
        this.stop();
        this.millisecondsRemaining = this.interval;
        this.setState(TimerState.READY);
        return true;
    }

    // Active while taking a break. Clicking snooze button
    // will stop taking a break and add 5 minutes to the running timer.
    snoozeBreak() {
        this.stop();
        if(this.amountBreaks < 3){
            this.breakItem.text = (3 - this.amountBreaks) + " short breaks left";
        } else {
            this.breakItem.text = "next break is a long break";
        }
        vscode.workspace.getConfiguration('workbench').update('colorTheme', userTheme, true);
        this.millisecondsRemaining = DEFAULT_SNOOZE_DURATION;
        breaking = false;
        this.setState(TimerState.READY);
        this.start();
        return true;
    }

    // Active while taking a break. Clicking skipBreak button will stop the break, increment
    // the amount of breaks taken, and reset the timer to 25 minutes (will not auto start the timer).
    skipBreak() {
        this.reset();
        breaking = false;
        vscode.workspace.getConfiguration('workbench').update('colorTheme', userTheme, true);
        this.setState(TimerState.READY);
        if(this.amountBreaks < 3){
            this.amountBreaks++;
            if(this.amountBreaks < 3){
                this.breakItem.text = (3 - this.amountBreaks) + " short breaks left";
            } else {
                this.breakItem.text = "next break is a long break";
            }
        } else {
            this.amountBreaks = 0;
            this.breakItem.text = (3 - this.amountBreaks) + " short breaks left";
        }
        this.start();
        return true;
    }

    dispose() {
        if (this.startPauseButton) {
            this.startPauseButton.hide();
            this.startPauseButton.dispose();
            this.startPauseButton = null;
        }
        this.state = TimerState.DISPOSED;
    }

    async showTaskOptions() {
        await vscode.window.showQuickPick(taskOptions).then(result => {
            if(result != null)
                selection = result.toString();
        });
    }

    async showTaskList() {
        await vscode.window.showQuickPick(taskList).then(result => {
            if(result != null)
                selection = result.toString();
        });
    }

    async taskBar() {

        await this.showTaskOptions();

        if(selection == "Close Menu")
            return;

        if(selection == "View Tasks") {
            await vscode.window.showQuickPick(taskList).then(result => {
                if(result != null)
                    selection = result.toString();
            });
            if(selection == "[BACK]")
                this.taskBar();
        }
        else if(selection == "Add Task") {
            userInput = await vscode.window.showInputBox();

            if(userInput != null)
                taskList.push(userInput);
            this.taskBar();

        }
        else if(selection == "Remove Task") {
            await vscode.window.showQuickPick(taskList).then(result => {
            if(result != null)
                selection = result.toString();
            });

            if(selection == "[BACK]")
                this.taskBar();
            else{
                var i = 0;
                while(taskList[i] != selection)
                    i++;
                completedList.push(taskList[i]);
                taskList.splice(i, 1);
                this.taskBar();
            }
        }
        else if(selection == "Completed Tasks") {
            await vscode.window.showQuickPick(completedList).then(result => {
                if(result != null)
                    selection = result.toString();
            });

            if(selection == "[BACK]")
                this.taskBar();
        }
    }

    async options()
    {
        await vscode.window.showQuickPick(optionList).then(result => {
            if(result != null)
                selection = result.toString();
        });

        if(selection == "Close Menu")
            return;

        if(selection == "Set Short Break Time Duration")
        {
            await vscode.window.showQuickPick(shortBreakOpt).then(result => {
                if(result != null)
                    selection = result.toString();
            });

            if(selection == "[BACK]")
                this.options();
            else if(selection == "0.05 Minutes")
                DEFAULT_BREAK_DURATION = 0.05 * 60000;
            else if(selection == "3 Minutes")
                DEFAULT_BREAK_DURATION = 3 * 60000;
            else if(selection == "5 Minutes")
                DEFAULT_BREAK_DURATION = 5 * 60000;
            else if(selection == "10 Minutes")
                DEFAULT_BREAK_DURATION = 10 * 60000;

            this.options();
            return;
        }

        if(selection == "Set Long Break Time Duration")
        {
            await vscode.window.showQuickPick(longBreakOpt).then(result => {
                if(result != null)
                    selection = result.toString();
            });

            if(selection == "[BACK]")
                this.options();
            else if(selection == "0.05 Minutes")
                DEFAULT_LONG_BREAK_DURATION = 0.05 * 60000;
            else if(selection == "25 Minutes")
                DEFAULT_LONG_BREAK_DURATION = 25 * 60000;
            else if(selection == "30 Minutes")
                DEFAULT_LONG_BREAK_DURATION = 30 * 60000;
            else if(selection == "45 Minutes")
                DEFAULT_LONG_BREAK_DURATION = 45 * 60000;
            else if(selection == "1 Hour")
                DEFAULT_LONG_BREAK_DURATION = 60 * 60000;

            this.options();
            return;
        }

        if(selection == "Set Pomodoro Time Duration")
        {
            await vscode.window.showQuickPick(pomoTimeOpt).then(result => {
                if(result != null)
                    selection = result.toString();
            });

            if(selection == "[BACK]") {
                this.options();
                return;
            }

            if(selection == "0.05 Minutes")
                this.interval = 0.05 * 60000;
            else if(selection == "20 Minutes")
                this.interval = 20 * 60000;
            else if(selection == "25 Minutes")
                this.interval = 25 * 60000;
            else if(selection == "30 Minutes")
                this.interval = 30 * 60000;
            else if(selection == "40 Minutes")
                this.interval = 40 * 60000;
            else if(selection == "1 Hour")
                this.interval = 60 * 60000;

            this.reset();
            this.options();
            return;
        }
    }

    // Function allows the collapsibleButton to toggle the visibility of
    // the rest of the Pomodoro statusBar items.
    collapsible() {
        if(collapsed) {
            this.optionsButton.show();
            this.taskItem.show();
            this.startPauseButton.show();
            this.resetButton.show();
            this.timerItem.show();
            this.breakItem.show();

            collapsed = false;
        } else {
            this.optionsButton.hide();
            this.taskItem.hide();
            this.startPauseButton.hide();
            this.resetButton.hide();
            this.timerItem.hide();
            this.breakItem.hide();
            collapsed = true;
        }
    }
}

exports.PomodoroTimer = PomodoroTimer;
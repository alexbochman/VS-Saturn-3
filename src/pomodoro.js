
// Required         =======================================================================================
const vscode = require('vscode');
const commands = require('./commands');
const { workspace, ConfigurationTarget } = require('vscode')

// Global Variables =======================================================================================
const MILLISECONDS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
const DEFAULT_TIMER_DURATION = 25 * 60000;          // Number of minutes * one minute in milliseconds | set to 3 seconds (in package.json) until version 1.0.0 release for testing
const DEFAULT_SNOOZE_DURATION = 5 * 60000;          // Number of minutes * one minute in milliseconds
const DEFAULT_BREAK_DURATION = 5 * 60000;           // Number of minutes * one minute in milliseconds
const DEFAULT_LONG_BREAK_DURATION = 30 * 60000;     // Number of minutes * one minute in milliseconds
var userTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
let breaking = false;

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

        this.interval = interval === DEFAULT_TIMER_DURATION ? vscode.workspace.getConfiguration("pomodoro").get("interval", DEFAULT_TIMER_DURATION) * MILLISECONDS_IN_SECOND * SECONDS_IN_MINUTE : interval;
        this.millisecondsRemaining = this.interval;
        this.timeout = 0;
        this.endDate = new Date();
        this.secondInterval = 0;
        this.state = TimerState.READY;
        this.amountBreaks = 0;

        this.startPauseButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.startPauseButton.show();

        this.resetButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.resetButton.show();

        this.timerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.timerItem.show();

        this.breakItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
        this.breakItem.show();

        this.updateStatusBar();
        this.breakItem.text = "3 short breaks left";
    }

    updateStatusBar() {
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
                var temp = vscode.workspace.getConfiguration("pomodoro").get("short_break_interval", DEFAULT_LONG_BREAK_DURATION);
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
        if (!this.isStartable()) { return false; }

        if(this.amountBreaks < 3) {
            this.breakItem.text = "on a short break";
        } else {
            this.breakItem.text = "on a long break";
        }

        userTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
        var themeValue = vscode.window.activeColorTheme.kind;
        if (themeValue == 2 || themeValue == 3){
            vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Light+', true)
        } else {
            vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Dark+', true)
        }

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

};

exports.PomodoroTimer = PomodoroTimer;
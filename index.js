const { app, BrowserWindow } = require('electron');
const express = require('express');
const fs = require('fs')

let mainWindow;

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
        },
    });

    mainWindow.loadFile('UI/index.html');

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'r' && input.meta) { // Command + R on macOS
            event.preventDefault();
            mainWindow.loadFile('UI/index.html');
        } else if (input.key === 'r' && input.control) { // Ctrl + R on Windows/Linux
            event.preventDefault();
            mainWindow.loadFile('UI/index.html');
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: true,
            },
        });

        mainWindow.loadFile('UI/index.html');
    }
});

const server = express();

server.get('/RUN_SETUP', (req, res) => {
    try {
        const checks = fs.readFileSync('./backend/checks.json')
        const setupProcess = fs.readFileSync('./backend/setup_process.json')
    } catch (error) {
        
    }
});

server.listen(3000, () => {
    console.log('Express server is running on http://localhost:3000');
});
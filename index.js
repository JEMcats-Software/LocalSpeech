const { app, BrowserWindow, dialog } = require('electron');
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const { exec } = require('child_process');

const server = express();
let serverPort; // Declare variable to store the port later

server.listen(0, function () {
    serverPort = this.address().port; // Get the dynamically assigned port
    console.log(`Express server is running on http://localhost:${serverPort}`);
    startElectronApp();
});

const userDir = `${require('os').homedir()}/Library/Application\\ Support/jemcats-localspeech`;
console.log(userDir);

let mainWindow;

function startElectronApp() {
    const checks = fs.readFileSync('./backend/checks.json');
    const checksData = JSON.parse(checks);

    let allChecksPassed = true;

    const checkPromises = checksData.map((check) => {
        return new Promise((resolve) => {
            try {
                console.log(`Running check: ${check}`);
                let fixedCheck = check.replace('USERDATAPATH', userDir);
                exec(fixedCheck, (error, stdout, stderr) => {
                    if (error) {
                        allChecksPassed = false;
                        console.error(`Check failed: ${fixedCheck}, Error: ${stderr}`);
                    } else {
                        console.log(`Check passed: ${fixedCheck}, Output: ${stdout}`);
                    }
                    resolve();
                });
            } catch (error) {
                console.error(`Error occurred: ${error.message}`);
                allChecksPassed = false;
                resolve();
            } finally {
                console.log(`Finished processing check: ${check}`);
            }
        });
    });

    Promise.all(checkPromises).then(() => {
        if (allChecksPassed) {
            axios.get('https://jemcats.software/test_connection.json')
                .then(() => {
                    console.log('You are online!');
                    const options = {
                        type: 'question',
                        buttons: ['No', 'Yes'],
                        defaultId: 1,
                        title: 'Refresh',
                        message: 'Do you want to retrieve the latest data from our server? Declining will use the previously downloaded data.',
                    };

                    dialog.showMessageBox(null, options).then((response) => {
                        if (response.response === 1) {
                            console.log('User selected Yes, Refreshing Now...');
                            refreshData(false);
                        } else {
                            console.log('User selected No, Not Refreshing');
                        }
                    });
                })
                .catch(() => {
                    console.log('You are offline!');
                });
        } else {
            refreshData(true);
        }

        app.on('ready', () => {
            mainWindow = new BrowserWindow({
                width: 800,
                height: 600,
                webPreferences: {
                    nodeIntegration: true,
                },
            });

            mainWindow.loadURL(`file://${__dirname}/UI/index.html?port=${serverPort}`);

            mainWindow.webContents.on('before-input-event', (event, input) => {
                if ((input.key === 'r' && input.meta) || (input.key === 'r' && input.control)) {
                    event.preventDefault();
                    mainWindow.loadURL(`file://${__dirname}/UI/index.html?port=${serverPort}`);
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

                mainWindow.loadURL(`file://${__dirname}/UI/index.html?port=${serverPort}`);
            }
        });
    });
}

function refreshData(urgent) {
    try {
        const refreshProcess = fs.readFileSync('./backend/refresh_process.json');
        let allRefreshRan = true;

        const refreshProcessData = JSON.parse(refreshProcess);

        const runCommandsSequentially = async (commands) => {
            for (const command of commands) {
                let fixedCommand = command.replace('USERDATAPATH', userDir);
                console.log(`Running refresh command: ${fixedCommand}`);
                try {
                    await new Promise((resolve, reject) => {
                        exec(fixedCommand, (error) => {
                            if (error) {
                                allRefreshRan = false;
                                reject(error);
                            } else {
                                resolve();
                            }
                        });
                    });
                } catch (error) {
                    console.error(`Command failed: ${fixedCommand}`);
                }
            }
        };

        const processSequentially = async () => {
            for (const process of refreshProcessData) {
                await runCommandsSequentially(process);
            }
        };

        processSequentially().then(() => {
            if (allRefreshRan) {
                console.log('Refresh Completed!');
            } else {
                console.log('Refresh Failed!');
            }
        });
    } catch (error) {
        console.error(error);
    }
}

server.get('/refresh', (req, res) => {
    res.send('Refresh endpoint hit');
});
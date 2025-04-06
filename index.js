const { app, BrowserWindow, dialog } = require('electron');
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const { exec, spawn } = require('child_process');
const path = require('path');
const os = require('os');
const { log } = require('console');
const AdmZip = require('adm-zip');
const tar = require('tar');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const { json } = require('stream/consumers');

const expressApp = express();
expressApp.use(express.json()); // Middleware to parse JSON requests
const server = http.createServer(expressApp);
let expressAppPort;
let userDir = app.getPath('userData');
userDir = userDir.replace(' ', '\\ ');

const downloadFile = async (url, dest) => {
    const writer = fs.createWriteStream(dest);
    const response = await axios({
        method: "get",
        url,
        responseType: "stream",
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
};

const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Create a Logs directory and a log file where each log message is written.
let logDir = path.join(userDir, 'Logs');
logDir = logDir.replace('\\ ', ' ');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
console.log("Log directory created at:", logDir);
const now = new Date();
// Replace colon to avoid filename issues
const logFilename = path.join(logDir, `${now.toISOString().replace(/:/g, '-')}.log`);
function writeToLog(level, ...args) {
    const message = args.join(' ');
    fs.appendFileSync(logFilename, `${new Date().toISOString()} [${level}]: ${message}\n`);
}

// Override console methods to write into the log file.
console.log = (...args) => writeToLog("LOG", ...args);
console.error = (...args) => writeToLog("ERROR", ...args);

console.log("Resolved user data path:", userDir);

console.log("This is a test")

server.listen(0, function () {
    expressAppPort = this.address().port;
    console.log(`Express expressApp is running on http://localhost:${expressAppPort}`);
    startElectronApp();
});

let mainWindow;

function startElectronApp() {
    console.log("Initializing Electron App...");

    let checksData;
    try {
        const checks = fs.readFileSync(`${__dirname}/backend/checks.json`);
        checksData = JSON.parse(checks);
    } catch (error) {
        console.error("Failed to read checks.json:", error);
        checksData = [];
    }

    let allChecksPassed = true;
    const checkPromises = checksData.map((check) => {
        return new Promise((resolve) => {
            let fixedCheck = check.replace('USERDATAPATH', userDir);
            console.log(`Running check: ${fixedCheck}`);
            exec(fixedCheck, (error, stdout, stderr) => {
                if (error) {
                    allChecksPassed = false;
                    console.error(`Check failed: ${fixedCheck}, Error: ${stderr}`);
                } else {
                    console.log(`Check passed: ${fixedCheck}, Output: ${stdout}`);
                }
                resolve();
            });
        });
    });

    Promise.all(checkPromises).finally(() => {
        console.log("All checks processed. Starting UI...");
        createMainWindow();

        if (allChecksPassed) {
            checkInternetConnection();
        } else {
            refreshData(true);
        }
    });
}

function createMainWindow() {
    if (mainWindow) return;

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: { nodeIntegration: true },
    });

    const uiPath = `file://${__dirname}/UI/index.html?port=${expressAppPort}`;
    console.log("Loading UI from:", uiPath);
    mainWindow.loadURL(uiPath);

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if ((input.key === 'r' && input.meta) || (input.key === 'r' && input.control)) {
            event.preventDefault();
            mainWindow.loadURL(uiPath);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function checkInternetConnection() {
    axios.get('https://jemcats.software/test_connection.json')
        .then(() => {
            console.log('You are online!');
            dialog.showMessageBox(null, {
                type: 'question',
                buttons: ['No', 'Yes'],
                defaultId: 1,
                title: 'Refresh',
                message: 'Do you want to retrieve the latest data from our server? Declining will use any previously downloaded data.',
            }).then((response) => {
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
}

function refreshData(urgent) {
    try {
        const totalCommands = 17; // Total number of commands to run

        // Create a modal popup with a progress bar using Electron
        let progressPopup;
        const createProgressPopup = () => {
            progressPopup = new BrowserWindow({
                width: 400,
                height: 200,
                modal: true,
                parent: mainWindow,
                frame: false,
                alwaysOnTop: true,
                resizable: false,
                webPreferences: { nodeIntegration: true }
            });
            const htmlContent = `
                <html>
                    <head>
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                                margin: 20px;
                                text-align: center;
                            }
                            progress {
                                width: 100%;
                                height: 20px;
                            }
                        </style>
                    </head>
                    <body>
                        <h4>Refreshing Data</h4>
                        <progress id="progressBar" max="${totalCommands}" value="0"></progress>
                        <div id="progressText">0% (0/${totalCommands})</div>
                    </body>
                </html>
            `;
            progressPopup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
        };

        // Update the progress bar in the popup
        const updateProgressPopup = (completed, total) => {
            const percentage = Math.round((completed / total) * 100);
            if (progressPopup && !progressPopup.isDestroyed()) {
                progressPopup.webContents.executeJavaScript(`
                    document.getElementById("progressBar").value = ${completed};
                    document.getElementById("progressText").innerText = "${percentage}% (${completed}/${total})";
                `);
            }
        };

        createProgressPopup();

        const runCommandsSequentially = async () => {
            const modifiedUserDir = userDir.replace('\\ ', ' ');
            const appResourcesPath = path.join(modifiedUserDir, "ApplicationResources");

            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            // Step 1: Create directories
            console.log("Starting: Create ApplicationResources directory");
            ensureDir(appResourcesPath);
            updateProgressPopup(1, totalCommands);
            console.log("Finished: Create ApplicationResources directory");
            await delay(1000);

            console.log("Starting: Remove existing ApplicationResources directory");
            fs.rmSync(appResourcesPath, { recursive: true, force: true }); // Remove existing dir
            updateProgressPopup(2, totalCommands);
            console.log("Finished: Remove existing ApplicationResources directory");
            await delay(1000);

            console.log("Starting: Recreate ApplicationResources directory");
            ensureDir(appResourcesPath); // Recreate
            updateProgressPopup(3, totalCommands);
            console.log("Finished: Recreate ApplicationResources directory");
            await delay(1000);

            console.log("Starting: Create OutputFiles directory");
            ensureDir(path.join(modifiedUserDir, "OutputFiles"));
            updateProgressPopup(4, totalCommands);
            console.log("Finished: Create OutputFiles directory");
            await delay(1000);

            console.log("Starting: Create UserContent directory");
            ensureDir(path.join(modifiedUserDir, "UserContent"));
            updateProgressPopup(5, totalCommands);
            console.log("Finished: Create UserContent directory");
            await delay(1000);

            console.log("Starting: Create Logs directory");
            ensureDir(path.join(modifiedUserDir, "Logs"));
            updateProgressPopup(6, totalCommands);
            console.log("Finished: Create Logs directory");
            await delay(1000);

            // Step 2: Download and extract main.zip
            console.log("Starting: Download main.zip");
            const mainZipPath = path.join(modifiedUserDir, "main.zip");
            await downloadFile("https://github.com/JEMcats-Software/LocalSpeech/archive/refs/heads/main.zip", mainZipPath);
            updateProgressPopup(7, totalCommands);
            console.log("Finished: Download main.zip");
            await delay(1000);

            console.log("Starting: Extract main.zip");
            const zip = new AdmZip(mainZipPath);
            zip.extractAllTo(modifiedUserDir, true);
            updateProgressPopup(8, totalCommands);
            console.log("Finished: Extract main.zip");
            await delay(1000);

            console.log("Starting: Remove main.zip");
            fs.rmSync(mainZipPath);
            updateProgressPopup(9, totalCommands);
            console.log("Finished: Remove main.zip");
            await delay(1000);

            console.log("Starting: Move mac_exec to ApplicationResources");
            fs.renameSync(path.join(modifiedUserDir, "LocalSpeech-main/download_data/mac_exec"), path.join(appResourcesPath, "mac_exec"));
            updateProgressPopup(10, totalCommands);
            console.log("Finished: Move mac_exec to ApplicationResources");
            await delay(1000);

            // Step 3: Download and extract kokoro-multi-lang model
            console.log("Starting: Download kokoro-multi-lang model");
            const kokoroPath = path.join(modifiedUserDir, "kokoro-multi-lang-v1_0.tar.bz2");
            await downloadFile("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2", kokoroPath);
            console.log("Download completed. Verifying file integrity...");

            if (fs.existsSync(kokoroPath) && fs.statSync(kokoroPath).size > 0) {
                updateProgressPopup(11, totalCommands);
                console.log("Finished: Download kokoro-multi-lang model");
                await delay(1000);

                console.log("Starting: Extract kokoro-multi-lang model");
                await new Promise((resolve, reject) => {
                    exec(`tar -xjf "${kokoroPath}" -C "${appResourcesPath}"`, (error, stdout, stderr) => {
                        if (error) {
                            console.error("Extraction error:", stderr);
                            return reject(error);
                        }
                        resolve();
                    });
                });
                updateProgressPopup(12, totalCommands);
                console.log("Finished: Extract kokoro-multi-lang model");
                await delay(1000);
            } else {
                throw new Error("Downloaded file is invalid or corrupted.");
            }

            console.log("Starting: Remove kokoro-multi-lang archive");
            fs.rmSync(kokoroPath);
            updateProgressPopup(13, totalCommands);
            console.log("Finished: Remove kokoro-multi-lang archive");
            await delay(1000);

            // Step 4: Move voice samples
            console.log("Starting: Move voice samples");
            const voiceSamplesSrc = path.join(modifiedUserDir, "LocalSpeech-main/download_data/voice_samples");
            const voiceSamplesDest = path.join(appResourcesPath, "kokoro-multi-lang-v1_0");

            if (fs.existsSync(voiceSamplesSrc)) {
                fs.renameSync(voiceSamplesSrc, path.join(voiceSamplesDest, "voice_samples"));
                updateProgressPopup(14, totalCommands);
                console.log("Finished: Move voice samples");
                await delay(1000);

                console.log("Starting: Remove LocalSpeech-main directory");
                fs.rmSync(path.join(modifiedUserDir, "LocalSpeech-main"), { recursive: true, force: true });
                updateProgressPopup(15, totalCommands);
                console.log("Finished: Remove LocalSpeech-main directory");
                await delay(1000);
            }
            updateProgressPopup(16, totalCommands);
            console.log("Starting: Ensure configuration file exists");
            const userContentDir = path.join(appResourcesPath, "../UserContent");
            ensureDir(userContentDir);
            const configFilePath = path.join(userContentDir, "config.json");
            if (!fs.existsSync(configFilePath)) {
                console.log("Configuration file not found. Creating a new one...");
                const defaultConfig = {
                    "voice": 11,
                    "threads": 6,
                    "provider": "coreml",
                    "file_prefix": "tts_output_"
                };
                fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 4));
                console.log("Default configuration file created at:", configFilePath);
            } else {
                console.log("Configuration file already exists at:", configFilePath);
            }
            console.log("Finished: Ensure configuration file exists");
            console.log("Starting: Make mac_exec executable");
            const macExecPath = path.join(appResourcesPath, "mac_exec");
            fs.chmodSync(macExecPath, '755'); // Equivalent to chmod +x
            updateProgressPopup(16, totalCommands);
            console.log("Finished: Make mac_exec executable");
            
            await delay(1000);
            console.log("Setup completed!");
            updateProgressPopup(17, totalCommands);
        };

        (async () => {
            updateProgressPopup(0, totalCommands);
            await runCommandsSequentially(process);
            console.log('Refresh Completed!');
            if (progressPopup && !progressPopup.isDestroyed()) {
                progressPopup.close();
            }
        })();
    } catch (error) {
        console.error("Failed to refresh data:", error);
        if (urgent === true) {
            dialog.showErrorBox("Error", "Failed to refresh data. Please check the logs for more details. App will quit when this is closed.");
            app.quit();
        } else {
            dialog.showErrorBox("Error", "Failed to refresh data. Please check the logs for more details.");
        }
    }
}

expressApp.get('/refresh', (req, res) => {
    res.send('Refreshing data...');
    refreshData(false)
});

expressApp.get('/get_voice_metadata', (req, res) => {
    const modifiedUserDir = userDir.replace('\\ ', ' ');
    fs.readFile(path.join(modifiedUserDir, 'ApplicationResources/kokoro-multi-lang-v1_0/voice_samples/voices.json'), (err, data) => {
        if (err) {
            console.error(`Error reading voice sample metadata: ${err}`);
            res.status(500).send('Error reading voice sample metadata');
            return;
        }
        res.set('Content-Type', 'application/json');
        res.send(data);
    }
    );
})

expressApp.get('/get_voice_sample', (req, res) => {
    const { id } = req.query;
    const modifiedUserDir = userDir.replace('\\ ', ' ');
    console.log(`Received request for voice sample with ID: ${id}`);
    fs.readFile(path.join(modifiedUserDir, 'ApplicationResources/kokoro-multi-lang-v1_0/voice_samples', `${id}.wav`), (err, data) => {
        if (err) {
            console.error(`Error reading voice sample: ${err}`);
            res.status(500).send('Error reading voice sample');
            return;
        }
        res.set('Content-Type', 'audio/wav');
        res.send(data);
    }
    );
})

expressApp.get('/get_output_audio', (req, res) => {
    const { id } = req.query;
    const modifiedUserDir = userDir.replace('\\ ', ' ');
    const configFilePath = path.join(modifiedUserDir, 'UserContent/config.json');
    const userConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    console.log(`Received request for output with ID: ${id}`);

    if (!id) {
        console.error('Error: No ID provided in the request.');
        res.status(400).send('Error: No ID provided in the request.');
        return;
    }

    const filePath = path.join(modifiedUserDir, 'OutputFiles', `${userConfig.file_prefix}${id}.wav`);
    console.log(`Attempting to read file at path: ${filePath}`);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                console.error(`Error: File not found at path: ${filePath}`);
                res.status(404).send('Error: File not found');
            } else {
                console.error(`Error reading output file at path: ${filePath}, Error: ${err.message}`);
                res.status(500).send('Error reading output');
            }
            return;
        }

        console.log(`Successfully read file at path: ${filePath}`);
        res.set('Content-Type', 'audio/wav');
        res.send(data);
    });
});

expressApp.get('/usr_get_config', (req, res) => {
    const modifiedUserDir = userDir.replace('\\ ', ' ');
    fs.readFile(path.join(modifiedUserDir, 'UserContent/config.json'), (err, data) => {
        if (err) {
            console.error(`Error reading voice User Config: ${err}`);
            res.status(500).send('Error reading User Config');
            return;
        }
        res.set('Content-Type', 'application/json');
        res.send(data);
    }
    );
})

expressApp.post('/save_usr_config', (req, res) => {
    const { voice, threads, provider, file_prefix } = req.body;
    const modifiedUserDir = userDir.replace('\\ ', ' ');
    const newConfig = {
        voice,
        threads,
        provider,
        file_prefix
    }
    const configFilePath = path.join(modifiedUserDir, 'UserContent/config.json');
    fs.writeFile(configFilePath, JSON.stringify(newConfig, null, 4), (err) => {
        if (err) {
            console.error(`Error saving user config: ${err}`);
            res.status(500).send('Error saving user config');
            return;
        }
        res.send('User config saved successfully');
    });
})

expressApp.post('/run_TTS', (req, res) => {
    const { text } = req.body;
    if (typeof text === 'undefined') {
        console.error("Text field is undefined in the request body");
        return res.status(400).send("Error: 'text' property is required in the request body.");
    }
    console.log(`Received TTS request: Text: ${text}`);
    // Here you would typically run your TTS command with the provided parameters

    const ttsuuid = uuidv4();
    res.send(JSON.stringify({ CMD: "RUNTTSREADY", WSID: ttsuuid }));
    const wsPath = `/${ttsuuid}`;
    console.log(`WebSocket app will use path: ${wsPath}`);

    const wss = new WebSocket.Server({ noServer: true });

    server.once('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
        if (pathname === wsPath) {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    wss.on('connection', (ws) => {
        console.log(userDir);
        console.log('WebSocket connection established.');

        const modifiedUserDir = userDir.replace('\\ ', ' ');
        const configFilePath = path.join(modifiedUserDir, 'UserContent/config.json');
        const runCmdFilePath = path.join(__dirname, 'backend/run_cmd.txt');

        try {
            const userConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
            let runCMD = fs.readFileSync(runCmdFilePath, 'utf8');

            runCMD = runCMD.replaceAll(/USERDATAPATH/g, userDir)
                           .replaceAll(/providerThreads/g, userConfig.threads)
                           .replaceAll(/voiceId/g, userConfig.voice)
                           .replaceAll(/providerMethod/g, userConfig.provider)
                           .replaceAll(/outputfiletitle/g, userConfig.file_prefix + ttsuuid)
                           .replaceAll(/text/g, text);

            const process = spawn(runCMD, { shell: true });

            process.stdout.on('data', (data) => {
                const log = data.toString();
                const lines = log.split('\n');
                lines.forEach((line) => {
                    const progressMatch = line.match(/progress=([\d.]+)/);
                    if (progressMatch) {
                        const progressValue = parseFloat(progressMatch[1]);
                        ws.send(JSON.stringify({ status: "progress", progress: progressValue }));
                        console.log(`Progress: ${progressValue}`);
                    } else if (line.trim()) {
                        ws.send(JSON.stringify({ status: "log", message: line.trim() }));
                        console.log(`STDOUT: ${line.trim()}`);
                    }
                });
            });

            process.stderr.on('data', (data) => {
                const errorLog = data.toString();
                if (errorLog.includes("Saved to")) {
                    ws.send(JSON.stringify({ status: "success" }));
                    ws.close();
                }
                if (!errorLog.includes("Context leak detected, msgtracer returned -1")) {
                    ws.send(JSON.stringify({ status: "error", message: errorLog }));
                    console.error(`STDERR: ${errorLog}`);
                }
            });

            process.on('close', (code) => {
                console.log(`Process exited with code ${code}`);
                ws.close(); // Close WebSocket connection when the process ends
            });
        } catch (error) {
            console.error('Error during WebSocket connection handling:', error);
            ws.send(`Error: ${error.message}`);
            ws.close();
        }

        ws.on('message', (message) => {
            console.log(`Received message: ${message}`);
        });

        ws.on('close', () => {
            console.log('WebSocket connection closed.');
        });

        ws.send('WebSocket app is ready.');
    });
});

app.on('ready', createMainWindow);

app.on('activate', () => {
    if (!mainWindow) {
        createMainWindow();
    }
});
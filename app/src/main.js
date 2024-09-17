const { app,Menu, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const AdmZip = require('adm-zip');
const rimraf = require('rimraf');

app.disableHardwareAcceleration();


let isDialogOpen = false;
let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        icon: path.join(__dirname, '../icons/icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('select-directory', async (event, options) => {
    if (isDialogOpen) return; 
    isDialogOpen = true;
    
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: options.title || 'Select Directory',
            buttonLabel: options.buttonLabel || 'Select'
        });
        return result.filePaths[0] || null;
    } finally {
        isDialogOpen = false;
    }
});

ipcMain.handle('get-plugins', async (event, pluginDir) => {
    const plugins = {};
    const files = fs.readdirSync(pluginDir);

    files.forEach((file) => {
        const pluginPath = path.join(pluginDir, file);
        if (fs.statSync(pluginPath).isDirectory()) {
            const readmeFile = path.join(pluginPath, 'readme.txt');
            if (fs.existsSync(readmeFile)) {
                const content = fs.readFileSync(readmeFile, 'utf-8');
                const match = content.match(/Stable tag:\s*(\S+)/i);
                if (match) {
                    plugins[file] = match[1];
                }
            }
        }
    });

    return plugins;
});

ipcMain.handle('check-update', async (event, pluginName) => {
    const WP_API_URL = 'https://api.wordpress.org/plugins/info/1.2/';
    try {
        const response = await axios.get(WP_API_URL, {
            params: {
                action: 'plugin_information',
                'request[slug]': pluginName
            }
        });
        return response.data.version;
    } catch (error) {
        return null;
    }
});

ipcMain.handle('backup-plugin', async (event, pluginDir, backupDir, pluginName, version) => {
    const pluginPath = path.join(pluginDir, pluginName);
    const backupDirPath = path.join(backupDir, 'backups');
    const backupFile = path.join(backupDirPath, `${pluginName}-v${version}.zip`);

    if (!fs.existsSync(backupDirPath)) {
        fs.mkdirSync(backupDirPath, { recursive: true });
    }

    rimraf.sync(backupFile); 

    const zip = new AdmZip();
    zip.addLocalFolder(pluginPath);
    zip.writeZip(backupFile);

    return backupFile;
});

ipcMain.handle('update-plugin', async (event, downloadUrl, pluginDir, pluginName) => {
    const pluginPath = path.join(pluginDir, pluginName);
    const tempFile = path.join(pluginDir, `${pluginName}.zip`);

    const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(tempFile, response.data);

    // Fetch the latest version directly from the API
    const latestVersion = await new Promise((resolve) => {
        axios.get('https://api.wordpress.org/plugins/info/1.2/', {
            params: {
                action: 'plugin_information',
                'request[slug]': pluginName
            }
        }).then(response => {
            resolve(response.data.version);
        }).catch(() => {
            resolve(null);
        });
    });

    rimraf.sync(pluginPath); 

    const zip = new AdmZip(tempFile);
    zip.extractAllTo(pluginDir, true);

    const updatedPluginsDir = path.join(pluginDir, 'updated_plugins');
    if (!fs.existsSync(updatedPluginsDir)) {
        fs.mkdirSync(updatedPluginsDir, { recursive: true });
    }

    const updatedZip = new AdmZip();
    updatedZip.addLocalFolder(pluginPath);
    updatedZip.writeZip(path.join(updatedPluginsDir, `${pluginName}-v${latestVersion}.zip`));

    fs.unlinkSync(tempFile);
    return true;
});

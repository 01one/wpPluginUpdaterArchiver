const { ipcRenderer } = require('electron');


const selectPluginDirButton = document.getElementById('selectPluginDir');
const selectBackupDirButton = document.getElementById('selectBackupDir');
const updatePluginsButton = document.getElementById('updatePlugins');
const pluginDirElement = document.getElementById('pluginDir');
const backupDirElement = document.getElementById('backupDir');
const pluginListElement = document.getElementById('pluginList');
const logOutputElement = document.getElementById('logOutput');

// Flags to prevent multiple dialogs
let isDialogOpen = false;

// Function to log messages
function logMessage(message) {
    logOutputElement.textContent += message + '\n';
}

// Handle directory selection
async function selectDirectoryHandler(elementId, updateElementCallback) {
    if (isDialogOpen) {
        logMessage('Dialog is already open.');
        return;
    }
    isDialogOpen = true;
    
    try {
        const result = await ipcRenderer.invoke('select-directory', {
            title: elementId === 'pluginDir' ? 'Select Plugin Directory' : 'Select Backup Directory',
            buttonLabel: 'Select Directory'
        });
        if (result === null) {
            updateElementCallback('No directory selected');
            return;
        }
        updateElementCallback(result);
    } catch (error) {
        logMessage(`Error selecting directory: ${error.message}`);
    } finally {
        isDialogOpen = false;
    }
}

selectPluginDirButton.addEventListener('click', () => {
    selectDirectoryHandler('pluginDir', (result) => {
        pluginDirElement.textContent = result;
    });
});

selectBackupDirButton.addEventListener('click', () => {
    selectDirectoryHandler('backupDir', (result) => {
        backupDirElement.textContent = result;
    });
});

updatePluginsButton.addEventListener('click', async () => {
    try {
        const pluginDir = pluginDirElement.textContent;
        const backupDir = backupDirElement.textContent;

        if (pluginDir === 'No directory selected') {
            logMessage('Please select the plugin directory.');
            return;
        }

        if (backupDir === 'No directory selected') {
            logMessage('Please select the backup directory.');
            return;
        }

        const plugins = await ipcRenderer.invoke('get-plugins', pluginDir);
        for (const [pluginName, currentVersion] of Object.entries(plugins)) {
            logMessage(`Checking for updates for ${pluginName}...`);
            const latestVersion = await ipcRenderer.invoke('check-update', pluginName);
            if (latestVersion && latestVersion !== currentVersion) {
                logMessage(`Updating ${pluginName} from version ${currentVersion} to ${latestVersion}.`);
                await ipcRenderer.invoke('backup-plugin', pluginDir, backupDir, pluginName, currentVersion);
                const downloadUrl = `https://downloads.wordpress.org/plugin/${pluginName}.zip`;
                const success = await ipcRenderer.invoke('update-plugin', downloadUrl, pluginDir, pluginName);
                if (success) {
                    logMessage(`${pluginName} has been updated to version ${latestVersion}.`);
                } else {
                    logMessage(`Failed to update ${pluginName}.`);
                }
            } else {
                logMessage(`${pluginName} is already up to date.`);
            }
        }
    } catch (error) {
        logMessage(`Error updating plugins: ${error.message}`);
    }
});

// Function to update the plugin list on the UI
function updatePluginList(plugins) {
    pluginListElement.innerHTML = '';
    for (const [name, version] of Object.entries(plugins)) {
        const listItem = document.createElement('li');
        listItem.textContent = `${name}: v${version}`;
        pluginListElement.appendChild(listItem);
    }
}

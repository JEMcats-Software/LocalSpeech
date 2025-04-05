let communicator = {};

communicator.get_voice_metadata = async function () {
    try {
        const response = await fetch(`http://localhost:${port}/get_voice_metadata`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching voices:', error);
        return null;
    }
}

communicator.usr_get_config = async function () {
    try {
        const response = await fetch(`http://localhost:${port}/usr_get_config`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching config:', error);
        return null;
    }
}

communicator.save_usr_config = async function (config) {
    try {
        const response = await fetch(`http://localhost:${port}/save_usr_config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        if (response.ok) {
            alert('Settings saved successfully!');
        } else {
            alert('Failed to save settings.');
        }
        const res = await response;
        return res;
    } catch (error) {
        console.error('Error fetching config:', error);
        return null;
    }
}
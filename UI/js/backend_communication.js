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
        console.error('Error updating config:', error);
        return null;
    }
}

communicator.TTSinit = async function (input) {
    console.log('TTSinit called with input:', input);
    try {
        const response = await fetch(`http://localhost:${port}/run_TTS`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({text: input})
        });
        if (!response.ok) {
            alert('Failed to start TTS.');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error running TTS:', error);
        return null;
    }
}

communicator.TTSrun = async function (uuid, output_txt, output_audio, output_div, run_button) {
    try {
        const socket = new WebSocket(`ws://localhost:${port}/${uuid}`);
        output_txt.innerText = 'Connecting...';
        socket.onopen = () => {
            console.log('WebSocket connection established.');
            output_txt.innerText = 'AI Running...';
        };
        socket.onmessage = (event) => {
            console.log('Message from server:', event.data);
            const parsedData = JSON.parse(event.data);
            if (parsedData.status === 'success') {
                output_audio.src = `http://localhost:${port}/get_output_audio?id=${uuid}`;
                output_div.style.display = 'flex';
                output_txt.innerText = 'Success! Audio is ready.';
                run_button.src = 'svg/paper_plane_black.svg'
                setTimeout(() => {
                    output_txt.innerText = 'Ready.';
                }, 3000);
            } else if (parsedData.status === 'progress') {
                console.log('Progress:', parsedData.progress);
                output_txt.innerText = 'AI Running... Progress: ' + Math.round(parsedData.progress / 1) + '%';
            }
        };
        socket.onclose = () => {
            console.log('WebSocket connection closed.');
        };
        
    } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        return null;
    }
}
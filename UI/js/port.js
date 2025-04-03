const urlParams = new URLSearchParams(window.location.search);
const port = urlParams.get('port');
console.log('Port:', port);
document.getElementById('home-link').href = `index.html?port=${port}`;
document.getElementById('text-link').href = `text.html?port=${port}`;
document.getElementById('pdf-link').href = `pdf.html?port=${port}`;
document.getElementById('settings-link').href = `settings.html?port=${port}`;
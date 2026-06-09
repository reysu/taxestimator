// Tiny persistence + file helpers shared by the data tabs.
export function load(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : structuredClone(fallback);
    } catch {
        return structuredClone(fallback);
    }
}

export function save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

export function downloadText(filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Open a file picker and resolve with the selected file's text (or null if cancelled).
export function pickFileText(accept = '.json') {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.style.display = 'none';
        let done = false;
        const finish = val => {
            if (done) return;
            done = true;
            input.remove();
            resolve(val);
        };
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return finish(null);
            const reader = new FileReader();
            reader.onload = () => finish(reader.result);
            reader.onerror = () => finish(null);
            reader.readAsText(file);
        });
        // 'cancel' fires in modern browsers when the dialog is dismissed
        input.addEventListener('cancel', () => finish(null));
        document.body.appendChild(input);
        input.click();
    });
}
